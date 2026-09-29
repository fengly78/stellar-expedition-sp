<?php

declare(strict_types=1);

namespace App\Domain\Fleet;

use App\Domain\Colony\ColonizeResolveService;
use App\Domain\Combat\CombatResolveService;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Debris\DebrisFieldService;
use App\Domain\Intel\ScoutArrivalService;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Ruleset\Ruleset;
use App\Domain\Ruleset\RulesetLoader;
use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * FleetArrivalService：舰队抵达/返航结算（在途守恒：抵达一次性交付，两端不同时可花 RES-004）。
 *
 * 覆盖：transport 交付、返航落地（S3）；colonize/raid 分派 S4 服务；scout 情报快照（S5）。
 * 全部五类任务形态已闭环，无未实现分支。
 *
 * 幂等：业务阶段键 settle_phase（uq_task_phase 唯一约束）+ 状态机双层。
 */
class FleetArrivalService
{
    public function __construct(
        private readonly ColonizeResolveService $colonize,
        private readonly CombatResolveService $combat,
        private readonly ScoutArrivalService $scout,
        private readonly RulesetLoader $rulesets,
        private readonly DebrisFieldService $debris,
        private readonly LedgerWriter $ledger,
    ) {
    }

    /** 结算单个到期舰队任务。 */
    public function arrive(string $taskId): void
    {
        DB::transaction(function () use ($taskId) {
            $task = DB::table('fleet_tasks')->where('task_id', $taskId)->lockForUpdate()->first();
            if ($task === null || in_array($task->status, ['done', 'cancelled'], true)) {
                return;   // 幂等
            }
            $ruleset = $this->rulesets->load((int) json_decode($task->ruleset_snapshot_json, true)['ruleset_id']);

            match (true) {
                $task->mission === 'transport' && $task->status === 'outbound' => $this->deliverTransport($task),
                $task->status === 'returning' => $this->landReturn($task),
                $task->mission === 'raid' => $this->raidArrive($task, $ruleset),
                $task->mission === 'colonize' => $this->colonizeArrive($task),
                $task->mission === 'scout' => $this->scout->arrive($task, $ruleset),
                $task->mission === 'recycle' => $this->recycleArrive($task, $ruleset),
                default => throw new \RuntimeException("未知舰队任务形态：{$task->mission}/{$task->status}"),
            };
        });
    }

    /**
     * colonize 抵达：履行 ColonizeResolveService 契约——colonized=false（轨道占用/容量满/无殖民舰）
     * 时调用方转返航（此前忽略返回值导致任务滞留 outbound，2026-09-24 修复）。
     */
    private function colonizeArrive(object $task): void
    {
        $r = $this->colonize->resolve($task);
        if (($r['colonized'] ?? false) === false) {
            DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
                'status' => 'returning',
                'settle_phase' => 'arrive',
                'arrive_at' => now()->addSeconds(max(0, (int) \Carbon\Carbon::parse($task->depart_at)
                    ->diffInSeconds(\Carbon\Carbon::parse($task->arrive_at)))),
            ]);
        }
    }

    /**
     * raid 抵达：目标在航程中消失（防御性，2026-09-24）→ 无损返航；
     * 正常 → 战斗结算。防 Worker 反复结算抛错滞留。
     */
    private function raidArrive(object $task, Ruleset $ruleset): void
    {
        [$g, $s, $o] = array_map('intval', explode(':', $task->target_coords));
        $exists = Planet::query()->where('galaxy', $g)->where('system_pos', $s)->where('orbit', $o)->exists();
        if (! $exists) {
            DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
                'status' => 'returning',
                'settle_phase' => 'arrive',
                'arrive_at' => now()->addSeconds(max(0, (int) \Carbon\Carbon::parse($task->depart_at)
                    ->diffInSeconds(\Carbon\Carbon::parse($task->arrive_at)))),
            ]);
            return;
        }
        $this->combat->resolve($task, $ruleset);
    }

    /** transport 抵达：货物一次性交付目标行星；舰队转入返航。 */
    private function deliverTransport(object $task): void
    {
        /** @var Planet|null $target */
        $target = $this->planetAt($task->target_coords);
        if ($target !== null) {
            // 合法运输可形成临时超额库存（02.2：不删除已抵达货物）
            $target->inv_m += (float) $task->cargo_m;
            $target->inv_c += (float) $task->cargo_c;
            $target->inv_d += (float) $task->cargo_d;
            $target->version++;
            $target->save();
        }
        // 目标行星不存在（被废弃等）：货物留在 cargo_* 随舰返航（不丢失，守恒优先）

        DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
            'status' => 'returning',
            'settle_phase' => 'arrive',
            'cargo_m' => $target === null ? $task->cargo_m : 0,
            'cargo_c' => $target === null ? $task->cargo_c : 0,
            'cargo_d' => $target === null ? $task->cargo_d : 0,
            // 返航时长 = 去程时长（同构语义）。Carbon 3 diffInSeconds 有符号：b−a
            'arrive_at' => now()->addSeconds(
                max(0, (int) \Carbon\Carbon::parse($task->depart_at)->diffInSeconds(\Carbon\Carbon::parse($task->arrive_at)))),
        ]);
    }

    /**
     * 残骸回收抵达（2026-09-29 补）。
     *
     * 结构与 transport 完全同构：去程把残骸装进 cargo → 返航由 landReturn 卸进母星。
     * 差别只在装货来源——残骸场按货舱容量等比取，**取不下的留在场里**。
     *
     * 口径与 SPA `state.ts` 的 `recycle` 分支一致：
     *   cap = Σ(SHIP.cargo × 数量)，k = min(1, cap / (残骸M + 残骸C))，got = round(残骸 × k)
     * 氘不成残骸（GDD-04），故 cargo_d 恒为 0。
     *
     * 守恒口径：残骸是**从场上搬进玩家库存**、不是凭空生成，所以必须写台账
     * （装货侧记负；返航入账由既有 landReturn 负责——它此前未记账，
     * 本次一并补上，否则回收会凭空增账）。
     */
    private function recycleArrive(object $task, Ruleset $ruleset): void
    {
        [$g, $s, $o] = array_map('intval', explode(':', (string) $task->target_coords));
        $ships = (array) json_decode((string) $task->ships_json, true);
        $cap = $this->debris->fleetCargo($ships, $ruleset);

        $took = ['M' => 0.0, 'C' => 0.0];
        if ($cap > 0.0) {
            // 纯战斗单位（货舱 0）来回收 = 空跑一趟：不消耗任何残骸
            $took = $this->debris->collect($g, $s, $o, $cap, $cap)['took'];
        }

        DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
            'status' => 'returning',
            'settle_phase' => 'arrive',
            'cargo_m' => $took['M'],
            'cargo_c' => $took['C'],
            'cargo_d' => 0,
            // 返航时长 = 去程实耗（与 transport/raid 同一口径，不用配置总时长）
            'arrive_at' => now()->addSeconds(
                max(0, (int) \Carbon\Carbon::parse($task->depart_at)->diffInSeconds(\Carbon\Carbon::parse($task->arrive_at)))),
        ]);

        if ($took['M'] > 0.0 || $took['C'] > 0.0) {
            $this->ledger->record(
                (string) $task->command_id,
                (int) $task->owner_id,
                (int) $task->origin_planet_id,
                null,
                ['M' => -$took['M'], 'C' => -$took['C'], 'D' => 0.0],
                'debris',
                (string) $task->target_coords,
                (string) $task->task_id,
            );
        }
    }

    /** 返航落地：舰船与随船货物回到母星，释放任务槽。 */
    public function landReturn(object $task): void
    {
        /** @var Planet|null $origin */
        $origin = Planet::query()->where('id', $task->origin_planet_id)->lockForUpdate()->first();
        if ($origin === null) {
            throw new \RuntimeException("fleet_tasks {$task->task_id} 母星缺失");
        }
        $ships = $origin->ships_json ?? [];
        foreach ((array) json_decode($task->ships_json, true) as $ship => $n) {
            $ships[$ship] = (int) ($ships[$ship] ?? 0) + (int) $n;
        }
        $origin->ships_json = $ships;
        $landedM = (float) $task->cargo_m;
        $landedC = (float) $task->cargo_c;
        $landedD = (float) $task->cargo_d;
        $origin->inv_m += $landedM;
        $origin->inv_c += $landedC;
        $origin->inv_d += $landedD;
        $origin->version++;
        $origin->save();

        // 2026-09-29 补记台账：返航落地此前**只加库存不写流水**。
        // 残骸回收上线后这会变成实打实的凭空增账（回收侧已记负、落地侧没记正），
        // 逐 owner 对账必然对不上。operation 随任务类型区分，便于审计。
        if ($landedM > 0.0 || $landedC > 0.0 || $landedD > 0.0) {
            $this->ledger->record(
                (string) $task->command_id,
                (int) $task->owner_id,
                (int) $origin->id,
                null,
                ['M' => $landedM, 'C' => $landedC, 'D' => $landedD],
                (string) $task->mission === 'recycle' ? 'debris' : 'transport',
                (string) $task->task_id,
                null,
            );
        }

        DB::table('civilizations')->where('owner_id', $task->owner_id)
            ->where('mission_slots_used', '>', 0)->decrement('mission_slots_used');

        DB::table('fleet_tasks')->where('task_id', $task->task_id)
            ->update(['status' => 'done', 'settle_phase' => 'return']);
    }

    private function planetAt(string $coords): ?Planet
    {
        $c = FlightService::parseCoords($coords);
        return Planet::query()
            ->where('galaxy', $c['galaxy'])->where('system_pos', $c['system'])->where('orbit', $c['orbit'])
            ->lockForUpdate()->first();
    }
}
