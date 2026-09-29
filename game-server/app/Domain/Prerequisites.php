<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\Ruleset;
use App\Models\Civilization;
use App\Models\Planet;

/**
 * 前置校验（Core 02.2 / 审计 §2 五舰前置）：REQUIRES.<OBJECT> 配置族。
 *
 * 配置形态：REQUIRES.SHIP.HEAVY = {"PLANET.SHIPYARD": 3, "TECH.ARMOUR": 2, "TECH.IMPULSE": 2}
 * - PLANET.* 前缀 → 查行星建筑等级；TECH.* 前缀 → 查文明科技等级。
 * - 配置缺键 → fail-closed 拒绝（前置表是机制语义，未登记不允许建造/研究——不静默放行）。
 */
class Prerequisites
{
    /**
     * @param string $objectKey 如 'SHIP.HEAVY'、'TECH.IMPULSE'、'BUILD.LAB'
     */
    public static function check(Ruleset $rs, string $objectKey, Planet $planet, Civilization $civ): void
    {
        $reqs = $rs->get('REQUIRES.' . $objectKey);   // 缺键即抛（RulesetRefusedException）
        if (!is_array($reqs)) {
            throw new CommandRejectedException("REQUIRES.{$objectKey} 配置形态非法");
        }
        foreach ($reqs as $reqKey => $needLevel) {
            [$kind, $name] = explode('.', (string) $reqKey, 2) + ['', ''];
            $have = match ($kind) {
                'PLANET' => $planet->level($name),
                'TECH' => $civ->techLevel($name),
                default => throw new CommandRejectedException("未知前置类别：{$reqKey}"),
            };
            if ($have < (int) $needLevel) {
                throw new CommandRejectedException(
                    "{$objectKey} 前置不足：{$reqKey} 需要 L{$needLevel}，当前 L{$have}");
            }
        }
    }
}
