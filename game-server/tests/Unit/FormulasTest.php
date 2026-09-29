<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Formulas;
use App\Domain\Ruleset\RulesetRefusedException;
use PHPUnit\Framework\TestCase;

/**
 * Formulas::upgradeCost 跨语言对账（dev-plan-e1 S2 验收钩子）：
 * 金值由 rules/formulas.py upgrade_cost 生成（tests/golden/s2_upgrade_cost_vectors.json）。
 * 含 TBD 负例：g=null 必须抛 RulesetRefusedException（§05.5 不静默默认）。
 */
class FormulasTest extends TestCase
{
    public function testUpgradeCostGolden(): void
    {
        $raw = file_get_contents(__DIR__ . '/../golden/s2_upgrade_cost_vectors.json');
        self::assertNotFalse($raw);
        $doc = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        foreach ($doc['vectors'] as $vec) {
            if (isset($vec['expect_error'])) {
                try {
                    Formulas::upgradeCost($vec['base'], $vec['level']);
                    self::fail("{$vec['base_name']} L{$vec['level']} 应抛 TBD 异常但未抛");
                } catch (RulesetRefusedException) {
                    continue;   // 期望路径
                }
            }
            $got = Formulas::upgradeCost($vec['base'], $vec['level']);
            self::assertSame($vec['expected']['M'], $got['M'], "{$vec['base_name']} L{$vec['level']} M");
            self::assertSame($vec['expected']['C'], $got['C'], "{$vec['base_name']} L{$vec['level']} C");
            self::assertSame($vec['expected']['D'], $got['D'], "{$vec['base_name']} L{$vec['level']} D");
        }
    }

    public function testLevelZeroRejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Formulas::upgradeCost(['M' => 60, 'C' => 15, 'D' => 0, 'g' => 1.5], 0);
    }
}
