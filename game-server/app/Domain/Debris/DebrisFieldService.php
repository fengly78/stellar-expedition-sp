<?php

declare(strict_types=1);

namespace App\Domain\Debris;

use App\Domain\Ruleset\Ruleset;
use Illuminate\Support\Facades\DB;

/**
 * DebrisFieldService：残骸场读写（CR-20260923-004 C 候选；上游 DebrisFieldService 同构——
 * load-or-create + 累加，坐标唯一）。调用方须在事务内（战斗结算同事务追加）。
 *
 * 2026-09-29 补 collect()：原先**只写不收**（原注释「MVP 只写不收（回收舰队属 Post-MVP）」），
 * 导致战斗按 `COMBAT.DEBRIS_RATE` 生成的残骸永久搁置、「打残骸重建」循环缺失。
 * 口径与 SPA `state.ts` 的 `recycle` 分支保持一致（见 collect() 说明）。
 * 氘不成残骸（GDD-04），列保留同构。
 */
class DebrisFieldService
{
    /** 坐标处追加残骸量（无行则建）。 */
    public function append(int $galaxy, int $systemPos, int $orbit, float $m, float $c, float $d): void
    {
        $q = DB::table('debris_fields')
            ->where('galaxy', $galaxy)->where('system_pos', $systemPos)->where('orbit', $orbit);
        $row = $q->lockForUpdate()->first();

        if ($row === null) {
            DB::table('debris_fields')->insert([
                'galaxy' => $galaxy, 'system_pos' => $systemPos, 'orbit' => $orbit,
                'metal' => $m, 'crystal' => $c, 'deuterium' => $d,
            ]);
            return;
        }

        $q->update([
            'metal' => (float) $row->metal + $m,
            'crystal' => (float) $row->crystal + $c,
            'deuterium' => (float) $row->deuterium + $d,
            'version' => (int) $row->version + 1,
        ]);
    }

    /** @return array{M:float,C:float,D:float}|null 坐标残骸量；无行返回 null */
    public function at(int $galaxy, int $systemPos, int $orbit): ?array
    {
        $row = DB::table('debris_fields')
            ->where('galaxy', $galaxy)->where('system_pos', $systemPos)->where('orbit', $orbit)
            ->first();
        if ($row === null) {
            return null;
        }
        return ['M' => (float) $row->metal, 'C' => (float) $row->crystal, 'D' => (float) $row->deuterium];
    }

    /**
     * 从残骸场装货，返回**实际取走**与**留在场上**的量。
     *
     * 口径与 SPA `state.ts` 的 `recycle` 分支**完全一致**（避免两端两套数值）：
     *   cap = Σ(SHIP.cargo × 数量)，k = min(1, cap / (残骸M + 残骸C))，各资源按 k 取整。
     * 氘不成残骸（GDD-04），故不涉及 D。
     *
     * 必须在事务内调用（行级锁防并发双取）。
     *
     * @param  float $wantM 请求装多少金属
     * @param  float $wantC 请求装多少晶体
     * @return array{took:array{M:float,C:float}, remain:array{M:float,C:float}}
     */
    public function collect(int $galaxy, int $systemPos, int $orbit, float $wantM, float $wantC): array
    {
        $zero = ['M' => 0.0, 'C' => 0.0];
        if ($wantM <= 0.0 && $wantC <= 0.0) {
            return ['took' => $zero, 'remain' => $zero];
        }
        $row = DB::table('debris_fields')
            ->where('galaxy', $galaxy)->where('system_pos', $systemPos)->where('orbit', $orbit)
            ->lockForUpdate()->first();
        if ($row === null) {
            return ['took' => $zero, 'remain' => $zero];
        }

        $haveM = (float) $row->metal;
        $haveC = (float) $row->crystal;
        $total = $haveM + $haveC;
        if ($total <= 0.0) {
            return ['took' => $zero, 'remain' => $zero];
        }

        // k = min(1, 请求量/存量)：装得下就全取，装不下就按比例等分。
        $k = min(1.0, ($wantM + $wantC) / $total);
        $tookM = round($haveM * $k);
        $tookC = round($haveC * $k);
        $remainM = round($haveM - $tookM);
        $remainC = round($haveC - $tookC);

        if ($remainM <= 0.0 && $remainC <= 0.0) {
            // 扫空即删行：与 SPA 的 `delete debrisFields[key]` 一致，
            // 避免留下一堆 0 值行被 at() 当成「有残骸」返回。
            DB::table('debris_fields')
                ->where('galaxy', $galaxy)->where('system_pos', $systemPos)->where('orbit', $orbit)
                ->delete();
        } else {
            DB::table('debris_fields')
                ->where('galaxy', $galaxy)->where('system_pos', $systemPos)->where('orbit', $orbit)
                ->update([
                    'metal' => $remainM,
                    'crystal' => $remainC,
                    'version' => (int) $row->version + 1,
                ]);
        }

        return [
            'took' => ['M' => $tookM, 'C' => $tookC],
            'remain' => ['M' => max(0.0, $remainM), 'C' => max(0.0, $remainC)],
        ];
    }

    /**
     * 舰队货舱总容量（Σ SHIP.<id>.cargo × 数量）。
     * 与 SPA `objects.ts` 的 `fleetCargo` 同口径。
     *
     * @param array<string,int> $ships 舰名 => 数量
     */
    public function fleetCargo(array $ships, Ruleset $ruleset): float
    {
        $defs = (array) $ruleset->get('SHIP');
        $total = 0.0;
        foreach ($ships as $id => $n) {
            $def = $defs[(string) $id] ?? null;
            if (!is_array($def)) {
                continue;
            }
            $total += (float) ($def['cargo'] ?? 0) * (int) $n;
        }

        return $total;
    }
}
