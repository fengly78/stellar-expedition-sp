<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Production\ProductionService;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * ProductionService 跨语言对账（dev-plan-e1 S1 验收钩子）：
 * 金值由 sim/engine.py 真实结算内核生成（tests/golden/s1_production_vectors.json），
 * PHP 侧逐向量回放，库存序列逐点一致（容差 1e-4）。
 *
 * ruleset 内容来自 RC1 的 RESOURCE/ENERGY/STORAGE 参数族——测试内置与 RC1 同值的
 * 最小配置；两侧数值若有漂移，本测试与 config 对账测试（S2）会同时报警。
 *
 * 继承 Tests\TestCase（非 PHPUnit TestCase）：日期 cast 赋值会经 Model::resolveConnection
 * 取连接对象；须有活容器（phpunit.xml → testing 内存 SQLite），但不做任何 DB I/O。
 */
class ProductionServiceTest extends TestCase
{
    public function testGoldenVectors(): void
    {
        $raw = file_get_contents(__DIR__ . '/../golden/s1_production_vectors.json');
        self::assertNotFalse($raw);
        $doc = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        $ruleset = self::testRuleset();
        $svc = new ProductionService();

        foreach ($doc['vectors'] as $vec) {
            self::assertTrue($vec['conservation'], "{$vec['name']}: Python 侧守恒已失败");
            $planet = self::makePlanet($vec['initial']);
            $t = Carbon::createFromTimestamp(0, 'UTC');
            $planet->production_checkpoint_at = $t->copy();
            $traceIdx = 0;

            foreach ($vec['steps'] as $step) {
                if (isset($step['settle_seconds'])) {
                    $t = $t->copy()->addSeconds((int) $step['settle_seconds']);
                    $svc->settle($planet, $ruleset, $t);
                    $expect = $vec['expected_trace'][$traceIdx++]['inv'];
                    self::assertEqualsWithDelta($expect['M'], $planet->inv_m, 1e-4, "{$vec['name']} M@t={$step['settle_seconds']}");
                    self::assertEqualsWithDelta($expect['C'], $planet->inv_c, 1e-4, "{$vec['name']} C");
                    self::assertEqualsWithDelta($expect['D'], $planet->inv_d, 1e-4, "{$vec['name']} D");
                } else {
                    $levels = $planet->levels_json;
                    foreach ($step['set_levels'] as $b => $lv) {
                        $levels[$b] = $lv;
                    }
                    $planet->levels_json = $levels;
                }
            }
        }
    }

    /** @param array{inventory:array,levels:array} $initial */
    private static function makePlanet(array $initial): Planet
    {
        $p = new Planet();
        $p->inv_m = (float) $initial['inventory']['M'];
        $p->inv_c = (float) $initial['inventory']['C'];
        $p->inv_d = (float) $initial['inventory']['D'];
        $p->reserved_m = $p->reserved_c = $p->reserved_d = 0.0;
        $p->levels_json = $initial['levels'];
        return $p;
    }

    /**
     * 最小配置夹具：tests/golden/s1_ruleset_fixture.json，由 config/rulesets/balance_rc1.json
     * 的 RESOURCE/ENERGY/STORAGE 族导出（导出脚本见交接档凌晨三十条目）。
     * RC1 这些参数变更时必须重新导出夹具，否则本测试守护的就是旧数值。
     */
    private static function testRuleset(): Ruleset
    {
        $content = json_decode(
            file_get_contents(__DIR__ . '/../golden/s1_ruleset_fixture.json') ?: '[]',
            true, 512, JSON_THROW_ON_ERROR,
        );
        return new Ruleset(0, 'test_fixture', 'test', $content);
    }
}
