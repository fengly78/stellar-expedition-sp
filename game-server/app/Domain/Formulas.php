<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Ruleset\RulesetRefusedException;

/**
 * 公式库 PHP 侧镜像：逐式对应 rules/formulas.py（F-01 升级成本等）。
 * 与 Python 侧一致性由对账测试锁定（dev-plan-e1 S2 验收钩子）。
 */
class Formulas
{
    /**
     * F-01：cost(L) = ceil(base[r] × g^(L−1))，L≥1；g 为 null → TBD 拒绝（§05.5）。
     *
     * @param array{M:int|float,C:int|float,D:int|float,g:?float} $base
     * @return array{M:int,C:int,D:int}
     */
    public static function upgradeCost(array $base, int $level): array
    {
        if ($level < 1) {
            throw new \InvalidArgumentException('level 必须 >= 1');
        }
        $g = $base['g'] ?? null;
        if ($g === null) {
            throw new RulesetRefusedException(['成本倍率 g 为 TBD']);
        }
        return [
            'M' => (int) ceil($base['M'] * $g ** ($level - 1)),
            'C' => (int) ceil($base['C'] * $g ** ($level - 1)),
            'D' => (int) ceil($base['D'] * $g ** ($level - 1)),
        ];
    }
}
