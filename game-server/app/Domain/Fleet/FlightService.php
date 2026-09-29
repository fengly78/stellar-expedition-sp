<?php

declare(strict_types=1);

namespace App\Domain\Fleet;

use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\Ruleset;
use App\Domain\Ruleset\RulesetRefusedException;

/**
 * FlightService：航时/距离/燃料（审计 §1.1~1.3 上游口径；GAP-02 解除候选）。
 *
 * 配置族 FLEET.FORMULA（常数全部走配置，缺键/TBD fail-closed）：
 * {
 *   model: 'upstream',
 *   distance: {same_system: 5, per_orbit: 5, orbit_base: 1000, per_system: 95,
 *              system_base: 2700, per_galaxy: 20000},
 *   duration: {constant: 35000, base_overhead_s: 10, speed_factor_divisor: 10},
 *   fuel:     {divisor: 35000, speed_term_base: 10, minimum: 1}
 * }
 *
 * 上游语义（审计 §1.1~1.3；燃料速度项经 2026-09-23 端到端纠错 = 每舰速度值，见 fuelCost）：
 *   距离 d = 同星 5 / Δorbit×5+1000 / Δsystem×95+2700 / Δgalaxy×20000
 *   航时秒 = (constant/速度百分比 × √(10d/v慢) + overhead) / universe_speed
 *   燃料   = max(minimum, base×n×d/divisor × (sv/10+1)²)，sv_i = constant/pct×√(10d/v_i)
 */
class FlightService
{
    /**
     * @return array{galaxy:int,system:int,orbit:int}
     */
    public static function parseCoords(string $coords): array
    {
        if (!preg_match('/^(\d+):(\d+):(\d+)$/', $coords, $m)) {
            throw new CommandRejectedException("坐标格式非法（期望 g:s:p）：{$coords}");
        }
        return ['galaxy' => (int) $m[1], 'system' => (int) $m[2], 'orbit' => (int) $m[3]];
    }

    /** 距离（审计 §1.3）。 */
    public function distance(array $from, array $to, Ruleset $rs): int
    {
        $cfg = $rs->get('FLEET.FORMULA.distance');
        if ($from === $to) {
            return (int) $cfg['same_system'];
        }
        if ($from['galaxy'] !== $to['galaxy']) {
            return abs($from['galaxy'] - $to['galaxy']) * (int) $cfg['per_galaxy'];
        }
        if ($from['system'] !== $to['system']) {
            return abs($from['system'] - $to['system']) * (int) $cfg['per_system'] + (int) $cfg['system_base'];
        }
        return abs($from['orbit'] - $to['orbit']) * (int) $cfg['per_orbit'] + (int) $cfg['orbit_base'];
    }

    /**
     * 航时（秒，审计 §1.1）。$slowestSpeed = 编队最慢舰速（SHIP.<ship>.speed，CR-003 B 回填前 fail-closed）。
     *
     * @param float $speedPct 速度百分比（10~100）
     */
    public function durationSeconds(int $distance, float $slowestSpeed, float $speedPct, Ruleset $rs): int
    {
        $cfg = $rs->get('FLEET.FORMULA.duration');
        if ($slowestSpeed <= 0 || $speedPct <= 0 || $speedPct > 100) {
            throw new CommandRejectedException('速度参数非法');
        }
        $universeSpeed = $rs->getFloat('FLEET.FORMULA.universe_speed');
        $seconds = (($cfg['constant'] / $speedPct) * sqrt(10 * $distance / $slowestSpeed)
            + $cfg['base_overhead_s']) / $universeSpeed;
        return (int) ceil($seconds);
    }

    /**
     * 引擎科技映射（经典 0.84 fleet.php:289-386 同构；配置驱动缺键即关）。
     * SHIP.<ship>.engine = {drive, bonus, switch?: {tech, level, base_mul, fuel_mul, bonus}}：
     * - 生效速度 = 基础速度 × base_mul × (1 + bonus × drive 科技等级)
     * - switch 命中（switch 科技 ≥ level）时替换加成并套 base_mul/fuel_mul
     *   （经典：小运脉冲≥5 换脉冲引擎——速度基倍 ×2、油耗 ×2、加成换 0.2）
     * 未配置 engine 的舰种原速原耗（真实 RC1 现状）。
     *
     * @param array<string,int> $ships @param array<string,float> $baseSpeeds @param array<string,float> $baseFuel
     * @param array<string,int> $techs
     * @return array{speeds:array<string,float>,fuel:array<string,float>}
     */
    public function applyEngineTechs(array $ships, array $baseSpeeds, array $baseFuel, array $techs, Ruleset $rs): array
    {
        $speeds = $baseSpeeds;
        $fuel = $baseFuel;
        foreach (array_keys($ships) as $ship) {
            try {
                $eng = $rs->get('SHIP.' . $ship . '.engine');
            } catch (RulesetRefusedException) {
                continue;
            }
            $lvl = (int) ($techs[$eng['drive']] ?? 0);
            $baseMul = 1.0;
            $fuelMul = 1.0;
            $bonus = (float) $eng['bonus'];
            $sw = $eng['switch'] ?? null;
            if (is_array($sw) && ($swLvl = (int) ($techs[$sw['tech']] ?? 0)) >= (int) $sw['level']) {
                $baseMul = (float) $sw['base_mul'];
                $fuelMul = (float) $sw['fuel_mul'];
                $bonus = (float) $sw['bonus'];
                $lvl = $swLvl;   // 换挡后加成按新引擎（switch.tech）科技等级——经典小运脉冲口径
            }
            $speeds[$ship] = (float) $baseSpeeds[$ship] * $baseMul * (1 + $bonus * $lvl);
            $fuel[$ship] = (float) $baseFuel[$ship] * $fuelMul;
        }
        return ['speeds' => $speeds, 'fuel' => $fuel];
    }

    /**
     * 燃料（氘，审计 §1.2；上游 FleetMissionService:187-194 同构）：按船型分组计算后求和，每组 max(minimum, …)。
     * 关键语义（2026-09-23 端到端测试纠错）：速度项用的是**每舰速度值**
     *   sv_i = duration.constant / speed_pct × √(10d / v_i)   （sv 随距离/速度百分比变化）
     * 而非基础舰速——按基础舰速计算会膨胀 5~6 个数量级。
     *
     * @param array<string,int> $ships 船型 => 数量
     * @param array<string,float> $baseFuel 船型 => 单舰燃料基数（SHIP.<ship>.fuel，待 CR-003 B）
     * @param array<string,float> $baseSpeeds 船型 => 基础舰速（SHIP.<ship>.speed，待 CR-003 B）
     */
    public function fuelCost(array $ships, array $baseFuel, array $baseSpeeds, int $distance,
                             float $speedPct, Ruleset $rs): int
    {
        $cfg = $rs->get('FLEET.FORMULA.fuel');
        $constant = (float) $rs->get('FLEET.FORMULA.duration')['constant'];
        $total = 0;
        foreach ($ships as $ship => $n) {
            if ($n <= 0) {
                continue;
            }
            $v = $baseSpeeds[$ship] ?? throw new CommandRejectedException("舰速缺失：{$ship}");
            $b = $baseFuel[$ship] ?? throw new CommandRejectedException("燃料基数缺失：{$ship}");
            if ($v <= 0) {
                throw new CommandRejectedException("舰速非法：{$ship}");
            }
            $speedValue = $constant / $speedPct * sqrt(10 * $distance / $v);
            $term = $b * $n * $distance / $cfg['divisor'] * (($speedValue / $cfg['speed_term_base'] + 1) ** 2);
            $total += (int) max($cfg['minimum'], ceil($term));
        }
        return $total;
    }
}
