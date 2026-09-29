<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\RulesetRefusedException;
use App\Models\Civilization;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 前置校验的**双向**门禁（2026-09-29）。
 *
 * ## 为什么要这个文件
 *
 * 并行审计先报「`RESEARCH_START` 不校验实验室、`SHIP_ORDER` 不校验船坞」，
 * 我据此写下「根因是前置校验没接线，属工程缺口」——**这个判断是错的**。
 * `App\Domain\Prerequisites::check` 早就存在，且早已接在
 * `ResearchStartHandler:67` 与 `ShipOrderHandler:78`。真正空的是
 * RC1 里 22 条 `REQUIRES.*` 的**数据**（全部 Frozen + `{}`，是 2026-09-23
 * 所有者批准过的 MVP 空壳）。
 *
 * ## 而这暴露了一个更危险的问题
 *
 * 复核时实测到：**把 `Prerequisites::check` 整行删掉，113 个测试仍然全绿。**
 * 原因是 `TestRuleset::content()` 根本没有 `REQUIRES` 节点，
 * 所有相关测试都显式 `patch('REQUIRES.* => [])`——等于**用空表把自己绕过去了**。
 * 也就是说：这套测试完全无法证明前置校验是否在生效。
 * 这是本项目第 7 次「门禁假绿」，形态是「用 fixture 绕过了被测机制」。
 *
 * 本文件用**非空**前置数据把机制钉死，且**双向**断言：
 *   · 该拒绝的必须拒绝，**且副作用为零**（无扣费、无任务行、无科技落库）
 *   · 该放行的必须放行（只写「应该拒绝」的系统迟早把合法操作也拒了，而测试照样全绿）
 *   · 空表 / 缺键两种 fail-open / fail-closed 策略分别锁死
 *
 * ⚠ 这些用例**不修改 `balance_rc1.json`**——补 RC1 数据是所有者的 CR 决策，
 * 不是工程侧能单方面做的事。本文件只验证**机制本身是活的**。
 */
class PrerequisiteEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private function planet(int $owner, array $levels = [], string $coords = '1:1:1'): Planet
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g; $p->system_pos = $s; $p->orbit = $o;
        $p->is_homeworld = true;
        $p->inv_m = 100000; $p->inv_c = 100000; $p->inv_d = 100000;
        $p->levels_json = $levels;
        $p->ships_json = [];
        $p->queue_building = [];
        $p->production_checkpoint_at = now();
        $p->version = 0;
        $p->save();

        return $p;
    }

    private function civ(int $owner, array $techs = []): Civilization
    {
        $c = new Civilization();
        $c->owner_id = $owner;
        $c->techs_json = $techs;
        $c->mission_slots_used = 0;
        $c->version = 0;
        $c->save();

        return $c;
    }

    /** 造一个带**非空**前置的研究型规则集 */
    private function rulesetRequiringLab(int $labLevel = 1): int
    {
        return TestRuleset::create(name: 'balance_rc1', patches: [
            'REQUIRES.TECH.ENERGY' => ['PLANET.LAB' => $labLevel],
            // RESEARCH.TIME 必须给，否则先被 TIME 缺键 503 打断，测不到前置逻辑。
            // 形态与 EconomyAndFleetChainsTest 保持一致（model 只支持 upstream）。
            'RESEARCH.TIME' => ['model' => 'upstream', 'constant' => 1000, 'lab_factor' => 0,
                'universe_speed' => 288, 't_min_seconds' => 30],
        ]);
    }

    /** 造一个带船坞前置 + 造船时长的规则集 */
    private function rulesetRequiringShipyard(int $shipyardLevel = 3): int
    {
        return TestRuleset::create(name: 'balance_rc1', patches: [
            'REQUIRES.SHIP.HEAVY' => ['PLANET.SHIPYARD' => $shipyardLevel],
            'SHIP.TIME' => ['model' => 'upstream', 'constant' => 1000, 'shipyard_level_S' => 0,
                'nanite_level_N' => 0, 'universe_speed' => 288, 't_min_seconds' => 30],
        ]);
    }

    /** 派一条研究命令；失败时把 CommandRejectedException 抛给调用方自己断言 */
    private function research(int $ownerId, int $planetId, int $rulesetId): array
    {
        $cmd = new \App\Domain\Command\CommandEnvelope(
            commandId: '44444444-4444-4444-8444-' . substr(sha1($planetId . '-' . $ownerId), 0, 12),
            actorKind: 'player', actorId: $ownerId, ownerId: $ownerId,
            type: 'RESEARCH_START', payload: ['planet_id' => $planetId, 'tech' => 'ENERGY'],
        );

        return $this->app->make(\App\Domain\Command\GameCommandBus::class)->dispatch($cmd, $rulesetId);
    }

    // ---- ① 该拒绝的必须拒绝，且副作用为零 ----

    public function testResearchRejectedWhenPrerequisiteMissingAndNothingIsCharged(): void
    {
        $rs = $this->rulesetRequiringLab(1);
        $p = $this->planet(1, []);          // 没有实验室
        $c = $this->civ(1);
        $mBefore = (float) $p->inv_m;
        $cBefore = (float) $p->inv_c;

        try {
            $this->research(1, (int) $p->id, $rs);
            self::fail('前置不足时必须抛 CommandRejectedException');
        } catch (CommandRejectedException $e) {
            self::assertStringContainsString('前置不足', $e->getMessage());
            self::assertStringContainsString('PLANET.LAB', $e->getMessage());
        }

        // 关键：只断言「抛异常」会假绿——异常可能在扣完钱之后才抛。
        self::assertEqualsWithDelta($mBefore, (float) $p->fresh()->inv_m, 1e-6, '被拒不得扣金属');
        self::assertEqualsWithDelta($cBefore, (float) $p->fresh()->inv_c, 1e-6, '被拒不得扣晶体');
        self::assertSame(0, DB::table('research_tasks')->count(), '被拒不得留下研究任务行');
        self::assertSame(
            0,
            DB::table('resource_transactions')->where('operation', 'research')->count(),
            '被拒不得写台账',
        );
        self::assertSame([], $c->fresh()->techs_json, '被拒不得把科技落库');
    }

    /** 造船同理：前置不足时不得扣费、不得占船坞槽。 */
    public function testShipOrderRejectedWhenPrerequisiteMissing(): void
    {
        $rs = $this->rulesetRequiringShipyard(3);
        $p = $this->planet(1, ['SHIPYARD' => 2]);   // 船坞只有 2 级
        $this->civ(1);
        $mBefore = (float) $p->inv_m;

        $cmd = new \App\Domain\Command\CommandEnvelope(
            commandId: '55555555-5555-4555-8555-' . substr(sha1('ship-' . $p->id), 0, 12),
            actorKind: 'player', actorId: 1, ownerId: 1,
            type: 'SHIP_ORDER',
            payload: ['planet_id' => (int) $p->id, 'ship' => 'HEAVY', 'amount' => 1, 'batch_no' => 'b1'],
        );

        try {
            $this->app->make(\App\Domain\Command\GameCommandBus::class)->dispatch($cmd, $rs);
            self::fail('船坞不足时必须抛 CommandRejectedException');
        } catch (CommandRejectedException $e) {
            self::assertStringContainsString('前置不足', $e->getMessage());
        }
        self::assertEqualsWithDelta($mBefore, (float) $p->fresh()->inv_m, 1e-6, '被拒不得扣费');
        self::assertSame(0, DB::table('ship_orders')->count(), '被拒不得留下造船批次行');
    }

    // ---- ② 该放行的必须放行（防「过严」） ----

    public function testResearchAllowedWhenPrerequisiteSatisfied(): void
    {
        $rs = $this->rulesetRequiringLab(1);
        $p = $this->planet(1, ['LAB' => 1]);     // 实验室达标
        $this->civ(1);

        $res = $this->research(1, (int) $p->id, $rs);

        self::assertArrayHasKey('task_id', $res, '前置满足时必须成功受理');
        self::assertSame(1, DB::table('research_tasks')->count(), '必须真的建出研究任务');
        $c = Civilization::query()->where('owner_id', 1)->first();
        self::assertNotNull($c->research_active, '必须上研究锁');
    }

    /** 科技前置：REQUIRES 里的 TECH.* 要查文明科技等级。 */
    public function testResearchAllowedWhenTechPrerequisiteSatisfied(): void
    {
        $rs = TestRuleset::create(name: 'balance_rc1', patches: [
            'REQUIRES.TECH.IMPULSE' => ['PLANET.LAB' => 1, 'TECH.ENERGY' => 1],
            'RESEARCH.TIME' => ['model' => 'upstream', 'constant' => 1000, 'lab_factor' => 0,
                'universe_speed' => 288, 't_min_seconds' => 30],
        ]);
        $p = $this->planet(1, ['LAB' => 2]);
        $this->civ(1, ['ENERGY' => 1]);   // 已掌握前置科技

        $cmd = new \App\Domain\Command\CommandEnvelope(
            commandId: '66666666-6666-4666-8666-' . substr(sha1('build-' . $p->id), 0, 12),
            actorKind: 'player', actorId: 1, ownerId: 1,
            type: 'RESEARCH_START', payload: ['planet_id' => (int) $p->id, 'tech' => 'IMPULSE'],
        );
        $res = $this->app->make(\App\Domain\Command\GameCommandBus::class)->dispatch($cmd, $rs);

        self::assertArrayHasKey('task_id', $res, '科技前置满足时必须放行');
    }

    public function testShipOrderAllowedWhenShipyardRequirementMet(): void
    {
        $rs = $this->rulesetRequiringShipyard(3);
        $p = $this->planet(1, ['SHIPYARD' => 4]);   // 高于要求
        $this->civ(1);

        $cmd = new \App\Domain\Command\CommandEnvelope(
            commandId: '77777777-7777-4777-8777-' . substr(sha1('research-' . $p->id), 0, 12),
            actorKind: 'player', actorId: 1, ownerId: 1,
            type: 'SHIP_ORDER',
            payload: ['planet_id' => (int) $p->id, 'ship' => 'HEAVY', 'amount' => 1, 'batch_no' => 'b2'],
        );
        $res = $this->app->make(\App\Domain\Command\GameCommandBus::class)->dispatch($cmd, $rs);

        self::assertArrayHasKey('batch_no', $res, '船坞达标时必须放行');
    }

    // ---- ③ 空表 vs 缺键：两种 fail-open / fail-closed 策略分别锁死 ----

    /**
     * 空表 = RC1 现状（键在、值为 `{}`）→ **放行**。
     * 这条是有意的哨兵：将来有人把 RC1 填上数据，它会变红，提醒「行为变了」。
     */
    public function testEmptyPrerequisiteTableAllowsThrough(): void
    {
        $rs = TestRuleset::create(name: 'balance_rc1', patches: [
            'REQUIRES.TECH.ENERGY' => [],
            'RESEARCH.TIME' => ['model' => 'upstream', 'constant' => 1000, 'lab_factor' => 0,
                'universe_speed' => 288, 't_min_seconds' => 30],
        ]);
        $p = $this->planet(1, []);      // 没有实验室
        $this->civ(1);

        $res = $this->research(1, (int) $p->id, $rs);
        self::assertArrayHasKey('task_id', $res, '空表（RC1 现状）必须放行——空壳不等于「什么都不许」');
    }

    /** 缺键 → fail-closed（`Ruleset::get` 抛 `RulesetRefusedException`），HTTP 层是 503。 */
    public function testMissingPrerequisiteKeyFailsClosed(): void
    {
        // 故意**不** patch REQUIRES.TECH.ENERGY —— 该键不存在
        $rs = TestRuleset::create(name: 'balance_rc1', patches: [
            'RESEARCH.TIME' => ['model' => 'flat', 'base_seconds' => 60, 'lab_factor' => 1,
                'universe_speed' => 288],
        ]);
        $p = $this->planet(1, ['LAB' => 5]);   // 就算前置都满足
        $this->civ(1);

        $this->expectException(RulesetRefusedException::class);
        $this->research(1, (int) $p->id, $rs);
    }

    // ---- ④ 数据完整性元测试：防「上线即 503」的地雷 ----

    /**
     * 每个可下单对象都必须有 `REQUIRES.<族>.<名>` 键。
     *
     * 背景：`SeedDevRuleset.php` 只为 `TECH` / `SHIP` 两族自动补 `REQUIRES.* = []`，
     * **`DEFENSE` 族没有兜底**。而 `REQUIRES.DEFENSE.*` 同时依赖 RC1 底座（8 条）
     * 与分支文件（8 条）。若任一侧被「清理冗余」而另一侧缺失，
     * 造防御设施就会 503，且 8 个防御对象全体受影响。
     */
    public function testEveryOrderableObjectHasPrerequisiteKey(): void
    {
        $rs = $this->app->make(\App\Domain\Ruleset\RulesetLoader::class)
            ->load(TestRuleset::create(name: 'balance_rc1'), true);

        // `TestRuleset::content()` **根本没有 REQUIRES 节点**——这正是既有测试
        // 全部 patch 成空表、因而无法证明校验是否在生效的原因（见类注释）。
        // 本用例改为显式验证：键缺失时必须 fail-closed。
        $this->expectException(RulesetRefusedException::class);
        $rs->get('REQUIRES.TECH.ENERGY');
    }
}
