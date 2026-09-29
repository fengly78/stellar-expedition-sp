<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameRuleset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * DEV 规则集种子（2026-09-23 服务端可玩化）：
 * seed 命令装配「RC1 真值 + 分支候选 + 经典补齐 + TIME 三族」为 frozen 规则集，
 * 必须通过正式 RulesetLoader 校验（frozen+hash+无 TBD）；TBD 项保持缺席（fail-closed）。
 */
class DevRulesetSeedTest extends TestCase
{
    use RefreshDatabase;

    public function testSeedProducesLoadableFrozenRuleset(): void
    {
        $this->artisan('game:seed-dev-ruleset')->assertExitCode(0);

        $row = GameRuleset::query()->where('ruleset_name', 'balance_rc1')->where('version', 'dev_seed')->first();
        $this->assertNotNull($row);
        $this->assertSame('frozen', $row->status);

        // 正式装载器直接可用（frozen + hash 匹配 + 无 TBD）
        $ruleset = $this->app->make(RulesetLoader::class)->load((int) $row->id);

        // RC1 真值在位
        $this->assertSame(30.0, (float) $ruleset->get('RESOURCE.M.PRODUCTION')['p']);
        // 分支候选在位（CR-004 B / 经典机制 / 防御设施）
        $this->assertSame(4, (int) $ruleset->get('INTEL.COUNTER_ESP')['divisor']);
        $this->assertSame(204, (int) $ruleset->get('SHIP.LIGHT.unit_id'));
        $this->assertSame('classic_thirds', $ruleset->get('COMBAT.LOOT_SPLIT'));
        $this->assertSame(80, (int) $ruleset->get('DEFENSE.ROCKET')['A']);
        $this->assertSame(0, (int) $ruleset->get('COMBAT.DEFENSE_DEBRIS_RATE'));

        // 经典五舰补齐（SOURCE-02 §六）+ 前置表自动生成 → 游戏可玩性前提
        $this->assertSame(12500.0, (float) $ruleset->get('SHIP.LIGHT.speed'));
        $this->assertSame(20.0, (float) $ruleset->get('SHIP.LIGHT.fuel'));
        $this->assertSame(50.0, (float) $ruleset->get('SHIP.LIGHT.cargo'));
        $this->assertSame([], $ruleset->get('REQUIRES.TECH.ENERGY'));
        $this->assertSame([], $ruleset->get('REQUIRES.SHIP.LIGHT'));
        $this->assertSame([], $ruleset->get('REQUIRES.DEFENSE.ROCKET'));
        // TIME 三族在位
        $this->assertSame('upstream', $ruleset->get('BUILD.TIME')['model']);
        $this->assertSame('upstream', $ruleset->get('RESEARCH.TIME')['model']);
        $this->assertSame('upstream', $ruleset->get('SHIP.TIME')['model']);
    }

    public function testSeedKeepsUnknownKeysFailClosed(): void
    {
        // RC1 批准版（2026-09-23）零 TBD；fail-closed 机制以「任意未登记键」验证——缺键即抛，不静默默认。
        $this->artisan('game:seed-dev-ruleset')->assertExitCode(0);
        $row = GameRuleset::query()->where('version', 'dev_seed')->first();
        $ruleset = $this->app->make(RulesetLoader::class)->load((int) $row->id);

        $this->assertNotNull($ruleset->get('BUILD.FUSION'), '批准后聚变参数必须在位');
        $this->expectException(\App\Domain\Ruleset\RulesetRefusedException::class);
        $ruleset->get('DEFENSE.NOT_A_THING');
    }

    public function testSeedIsIdempotent(): void
    {
        $this->artisan('game:seed-dev-ruleset')->assertExitCode(0);
        $this->artisan('game:seed-dev-ruleset')->assertExitCode(0);
        $this->assertSame(1, GameRuleset::query()->where('version', 'dev_seed')->count());
    }
}
