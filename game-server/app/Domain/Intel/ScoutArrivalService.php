<?php

declare(strict_types=1);

namespace App\Domain\Intel;

use App\Domain\Combat\CombatEngine;
use App\Domain\Combat\CombatResolveService;
use App\Domain\Debris\DebrisFieldService;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * ScoutArrivalService：侦察抵达——情报快照 + 反侦察机制（GDD-12；上游审计 §6 同构）。
 *
 * 语义（OGameX CounterEspionageService / EspionageMission 对照，机制 Keep、快照制 Replace）：
 * - 触发概率 = floor(守方舰船数 × (守侦级−攻侦级+level_offset) / (探针数×divisor) × 100)，夹 [0,100]；
 *   守方无舰或科技差因子 ≤0 → 恒 0。判定用确定性种子（sha256("counteresp-{task_id}") 前 4 字节
 *   mod 100 < chance），不引入运行时随机——重放/SIM 可复现。
 * - 触发 → 真战斗（攻方=侦察编队，守方=守方舰船；防御建筑不参战——MVP 无防御建筑列，天然一致）。
 *   战斗入 battle_snapshots（battle_id="counteresp-{task_id}"），残骸照常入残骸场。
 * - 报告恒生成：揭示阈值 = 剩余探针（探针数 − max(0,级差)^gap_exponent，并按存活探针封顶）
 *   达 fields.<field>.probes，或攻侦级 − fields.<field>.level ≥ 守侦级；资源恒可见。
 *   与上游差异（CR-004 D 登记）：剩余探针按存活数封顶——上游全灭仍按出发数揭示，我方更保守。
 * - 探针全灭（或触发后编队覆灭）：任务直接 done（无返航）并释放任务槽；守方收到战报快照。
 *
 * 配置族（CR-004 D 候选值=上游同构；缺键 fail-closed，不默认全量揭示）：
 *   INTEL.COUNTER_ESP { divisor, level_offset }
 *   INTEL.REVEAL { gap_exponent, fields: { ships|defense|buildings|research: {probes, level} } }
 */
class ScoutArrivalService
{
    public function __construct(
        private readonly CombatResolveService $combat,
        private readonly CombatEngine $engine,
        private readonly DebrisFieldService $debrisFields,
    ) {
    }

    public function arrive(object $task, Ruleset $ruleset): void
    {
        $counterCfg = $ruleset->get('INTEL.COUNTER_ESP');   // CR-004 D 回填前 fail-closed
        $revealCfg = $ruleset->get('INTEL.REVEAL');

        [$g, $s, $o] = array_map('intval', explode(':', $task->target_coords));

        /** @var Planet|null $target */
        $target = Planet::query()
            ->where('galaxy', $g)->where('system_pos', $s)->where('orbit', $o)
            ->lockForUpdate()->first();

        /** @var array<string,int> $ships */
        $ships = (array) json_decode($task->ships_json, true);
        $probes = array_sum($ships);   // 反侦察按编队舰船总数计（上游按探测数量）

        $attTechs = $this->techsOf((int) $task->owner_id);
        $defTechs = $target !== null ? $this->techsOf((int) $target->owner_id) : [];
        $attLevel = (int) ($attTechs['ESPIONAGE'] ?? 0);
        $defLevel = (int) ($defTechs['ESPIONAGE'] ?? 0);
        $defShipCount = $target !== null ? array_sum((array) ($target->ships_json ?? [])) : 0;

        // 反侦察触发概率（上游同构式）+ 确定性判定
        $factor = $defLevel - $attLevel + (int) $counterCfg['level_offset'];
        $chance = 0;
        if ($probes > 0 && $defShipCount > 0 && $factor > 0) {
            $chance = (int) min(100, max(0, floor(
                $defShipCount * $factor / ($probes * (int) $counterCfg['divisor']) * 100)));
        }
        $triggered = $chance > 0 && self::seedMod100("counteresp-{$task->task_id}") < $chance;

        $survivors = $ships;
        $probeSurv = $probes;
        if ($triggered && $target !== null) {
            $battleId = "counteresp-{$task->task_id}";
            $battle = $this->combat->runBattle(
                $ships, "scout-{$task->task_id}", (int) $task->owner_id, $attTechs,
                (array) ($target->ships_json ?? []), (string) $target->id, (int) $target->owner_id, $defTechs,
                $battleId, $ruleset,
            );
            $survivors = $battle['att_survivors'];
            $probeSurv = array_sum($survivors);

            // 战斗残骸入残骸场（上游同构：反侦察战损同样成骸）
            $rate = $ruleset->getFloat('COMBAT.DEBRIS_RATE');
            $debris = CombatResolveService::debrisOf($battle['att_losses'], $ruleset, $rate);
            foreach (CombatResolveService::debrisOf($battle['def_losses'], $ruleset, $rate) as $k => $v) {
                $debris[$k] += $v;
            }
            $this->debrisFields->append($g, $s, $o, $debris['M'], $debris['C'], 0.0);

            $now = now();
            $result = [
                'attacker_survivors' => $battle['att_survivors'], 'defender_survivors' => $battle['def_survivors'],
                'attacker_losses' => $battle['att_losses'], 'defender_losses' => $battle['def_losses'],
                'debris' => $debris,
            ];
            DB::table('battle_snapshots')->insert([
                'battle_id' => $battleId,
                'command_id' => $task->command_id,
                'ruleset_id' => $ruleset->id,
                'engine_version' => 'rust-classic-ffi-spec-v0.1',
                'seed' => $battle['input']['seed'],
                'participants_json' => json_encode($battle['input'], JSON_UNESCAPED_UNICODE),
                'rounds_json' => json_encode($battle['output']['rounds'] ?? [], JSON_UNESCAPED_UNICODE),
                'result_json' => json_encode($result, JSON_UNESCAPED_UNICODE),
                'snapshot_at' => $now,
                'settled_at' => $now,
                'snapshot_version' => (int) ($target->version ?? 0),
            ]);
        }

        // 剩余探针：级差^gap 抵扣，并按存活封顶（比上游更保守——全灭即无揭示）
        $extra = (int) floor(pow(max(0, $defLevel - $attLevel), (int) $revealCfg['gap_exponent']));
        $remaining = max(0, min($probes - $extra, $probeSurv));

        $visible = ['target_exists' => $target !== null];
        if ($target !== null) {
            $visible['resources'] = [
                'M' => (float) $target->inv_m, 'C' => (float) $target->inv_c, 'D' => (float) $target->inv_d,
            ];
            foreach ((array) $revealCfg['fields'] as $field => $th) {
                $ok = $remaining >= (int) $th['probes'] || $attLevel - (int) $th['level'] >= $defLevel;
                $visible[$field] = $ok ? match ($field) {
                    'ships' => (array) ($target->ships_json ?? []),
                    'buildings' => (array) ($target->levels_json ?? []),
                    'research' => $defTechs,
                    'defense' => [],          // MVP 无防御建筑列（列预留）
                    default => null,          // 未登记字段不揭示
                } : null;
            }
        }
        $visible['meta'] = [
            'counter_esp_chance' => $chance,
            'counter_esp_triggered' => $triggered,
            'probes_sent' => $probes,
            'probes_survived' => $probeSurv,
            'remaining_probes_for_reveal' => $remaining,
        ];

        DB::table('intel_snapshots')->insert([
            'owner_id' => (int) $task->owner_id,
            'target_ref' => $task->target_coords,
            'observed_at' => now(),
            'visible_fields_json' => json_encode($visible, JSON_UNESCAPED_UNICODE),
            'ruleset_id' => $ruleset->id,
            'source_command' => $task->command_id,
        ]);

        // 舰队处置：有存活舰返航；编队覆灭任务即 done（并释放任务槽，与 landReturn 同口径）
        if ($probeSurv > 0) {
            DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
                'status' => 'returning',
                'settle_phase' => 'arrive',
                'ships_json' => json_encode($survivors),
                'arrive_at' => now()->addSeconds(max(0, (int) \Carbon\Carbon::parse($task->depart_at)
                    ->diffInSeconds(\Carbon\Carbon::parse($task->arrive_at)))),
            ]);
        } else {
            DB::table('fleet_tasks')->where('task_id', $task->task_id)
                ->update(['status' => 'done', 'settle_phase' => 'arrive', 'ships_json' => json_encode([])]);
            DB::table('civilizations')->where('owner_id', $task->owner_id)
                ->where('mission_slots_used', '>', 0)->decrement('mission_slots_used');
        }
    }

    /** 确定性判定种子：sha256 前 4 字节（大端）mod 100。 */
    private static function seedMod100(string $key): int
    {
        return unpack('N', hash('sha256', $key, true))[1] % 100;
    }

    /** @return array<string,int> */
    private function techsOf(int $ownerId): array
    {
        $row = DB::table('civilizations')->where('owner_id', $ownerId)->first();
        return $row ? (array) json_decode($row->techs_json, true) : [];
    }
}
