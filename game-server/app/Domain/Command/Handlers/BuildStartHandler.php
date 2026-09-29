<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Formulas;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Production\ProductionSettlement;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * BUILD_START（API-01 §3，系统触发）：启动时扣费（Core 02.2 再校验）。
 *
 * 纪律：
 * - 锁顺序 §4：事务内 SELECT ... FOR UPDATE 行星行（每行星至多 1 执行中由行锁保证）。
 * - 先 settle 生产到启动时刻，再扣费（§06.1）。
 * - 支付失败（库存不足）→ REJECTED，队列项**留在队列不扣费**（02.2）。
 * - 建造时长走 ruleset BUILD.TIME 配置族（F-08 口径；CR-003 提案 E 批准后为上游同构式）。
 *
 * payload: {"planet_id": int}
 */
class BuildStartHandler implements CommandHandler
{
    public function __construct(
        private readonly ProductionSettlement $production,
        private readonly LedgerWriter $ledger,
    ) {
    }

    public function type(): string
    {
        return 'BUILD_START';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        // 实质校验在 handle 的行锁内完成（队列/库存必须读最新值）；此处仅形状校验
        if (!isset($cmd->payload['planet_id'])) {
            throw new CommandRejectedException('缺少 planet_id');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $planetId = (int) $cmd->payload['planet_id'];
        // 2026-09-29：可选的 index——用于「跳过付不起的队首，直接启动后面某项」。
        // 不给时保持原语义（只动队首），保证既有调用方与测试不受影响。
        $wantIndex = isset($cmd->payload['index']) ? (int) $cmd->payload['index'] : null;

        /** @var Planet|null $planet */
        $planet = Planet::query()->where('id', $planetId)->lockForUpdate()->first();
        if ($planet === null || (int) $planet->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException("行星不存在或不归 Owner：{$planetId}");
        }

        $queue = $planet->queue_building ?? [];
        if ($queue === []) {
            throw new CommandRejectedException('待执行队列为空');
        }
        $executing = DB::table('build_tasks')
            ->where('planet_id', $planetId)->where('status', 'executing')->exists();
        if ($executing) {
            throw new CommandRejectedException('已有执行中的建造任务（每行星至多 1）');
        }

        $now = Carbon::now('UTC');
        // §06.1：先结算生产到此刻，再支付
        $this->production->settle($planet, $ruleset, $now, $cmd->commandId);

        $affordable = $this->firstAffordable($planet, $queue, $ruleset, $wantIndex);
        if ($affordable === null) {
            throw new CommandRejectedException(
                $wantIndex === null
                    ? '队列中没有任何可启动的项（资源不足；可用 index 指定或先取消队列项）'
                    : "指定的第 {$wantIndex} 项不存在或资源不足",
            );
        }
        [$index, $next] = $affordable;

        // 队列是稀疏的（前面可能有跳不过去的项），按位置删除而不是 array_shift。
        unset($queue[$index]);
        $queue = array_values($queue);

        $building = (string) $next['building'];
        $targetLevel = $planet->level($building) + 1;
        $cost = Formulas::upgradeCost($ruleset->get('BUILD.' . $building), $targetLevel);

        foreach (['M', 'C', 'D'] as $res) {
            if ($planet->spendable($res) < $cost[$res]) {
                throw new CommandRejectedException("资源不足，无法启动 {$building} L{$targetLevel}（留在队列）");
            }
        }

        foreach (['M', 'C', 'D'] as $res) {
            $col = 'inv_' . strtolower($res);
            $planet->$col -= $cost[$res];
        }
        $planet->queue_building = $queue;
        $planet->version++;
        $planet->save();

        $this->ledger->record($cmd->commandId, $cmd->ownerId, $planetId, null,
            ['M' => -$cost['M'], 'C' => -$cost['C'], 'D' => -$cost['D']],
            'build', null, "{$building} L{$targetLevel}");

        $durationSeconds = $this->buildTimeSeconds($cost, $ruleset);
        DB::table('build_tasks')->insert([
            'planet_id' => $planetId,
            'building' => $building,
            'target_level' => $targetLevel,
            'cost_m' => $cost['M'], 'cost_c' => $cost['C'], 'cost_d' => $cost['D'],
            'ruleset_id' => $ruleset->id,
            'status' => 'executing',
            'complete_at' => $now->copy()->addSeconds($durationSeconds),
        ]);

        return [
            'planet_id' => $planetId, 'building' => $building,
            'target_level' => $targetLevel, 'cost' => $cost,
            'duration_seconds' => $durationSeconds,
        ];
    }

    /**
     * 找出队列里第一项**当前付得起**的建造；返回 [下标, 项]，全都付不起时返回 null。
     *
     * 2026-09-29 补：这是解开「队首死锁」的关键。
     * 原实现无条件 `array_shift($queue)` 取队首，付不起就整体抛错放弃——
     * 于是一条付不起的队首会让后面所有项永远轮不到（DELTA 实测需 181 小时自然解封）。
     * 现在按队列顺序找第一个付得起的项，付不起的项**留在队列里**（等资源够了自然轮到），
     * 但不再阻塞后面的项。$wantIndex 非 null 时只看指定那一项。
     */
    private function firstAffordable(Planet $planet, array $queue, Ruleset $ruleset, ?int $wantIndex): ?array
    {
        $indices = $wantIndex === null ? array_keys($queue) : [$wantIndex];
        foreach ($indices as $i) {
            if (!array_key_exists($i, $queue)) {
                continue;
            }
            $building = (string) ($queue[$i]['building'] ?? '');
            if ($building === '') {
                continue;
            }
            $def = (array) $ruleset->get('BUILD');
            if (!array_key_exists($building, $def)) {
                continue; // 未知建筑（历史脏数据）跳过，不参与计算
            }
            $targetLevel = $planet->level($building) + 1;
            $cost = Formulas::upgradeCost($def[$building], $targetLevel);
            foreach (['M', 'C', 'D'] as $res) {
                if ($planet->spendable($res) < $cost[$res]) {
                    continue 2;
                }
            }

            return [$i, $queue[$i]];
        }

        return null;
    }

    /**
     * F-08 建造时长（秒）。配置族 BUILD.TIME：
     *   {model: 'upstream', constant: 2500, universe_speed: int, t_min_seconds: int,
     *    robotics_level_R: int, nanite_level_N: int}
     * upstream 式（CR-003 提案 E 口径）：ceil(3600×(M+C)/(2500×(1+R)×2^N×speed))，下限 t_min。
     * 配置缺键/TBD 由 Ruleset.get 抛出（不静默默认）。
     */
    private function buildTimeSeconds(array $cost, Ruleset $ruleset): int
    {
        $tm = $ruleset->get('BUILD.TIME');
        if (($tm['model'] ?? null) !== 'upstream') {
            throw new CommandRejectedException('BUILD.TIME.model 仅支持 upstream（F-08 口径）');
        }
        $denominator = $tm['constant'] * (1 + $tm['robotics_level_R'])
            * 2 ** $tm['nanite_level_N'] * $tm['universe_speed'];
        return max((int) $tm['t_min_seconds'],
            (int) ceil(3600 * ($cost['M'] + $cost['C']) / $denominator));
    }
}
