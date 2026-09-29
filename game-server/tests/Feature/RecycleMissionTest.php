<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\GameCommandBus;
use App\Domain\Debris\DebrisFieldService;
use App\Domain\Fleet\FleetArrivalService;
use App\Models\Civilization;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 残骸回收（recycle）闭环（2026-09-29）。
 *
 * 背景：ALPHA 试玩报出「`DEBRIS_COLLECT` 不存在」，当时被记为缺陷。
 * 查证后确认 `DebrisFieldService` 顶部注释写着「MVP 只写不收（回收舰队属 Post-MVP）」——
 * 是**有记录的范围决策**而非 bug。但后果是实在的：战斗按 `COMBAT.DEBRIS_RATE` 生成残骸
 * （实测打 BRAVO 得 3000M/1350C、打 DELTA 得 2400M/1500C），却没有任何采集入口，
 * 残骸永久搁置只增不减，「打残骸重建」这条经典循环整个缺失。
 * 所有者裁定「需要做」后按**复用 transport 结构**的方式补齐（新增任务形态，非新玩法）：
 *
 *   FLEET_DISPATCH(mission=recycle) → recycleArrive 按货舱等比装货 → 返航 landReturn 卸货
 *
 * 口径与 SPA `state.ts` 的 `recycle` 分支完全一致（避免两端两套数值）。
 */
class RecycleMissionTest extends TestCase
{
    use RefreshDatabase;

    private function dllReady(): bool
    {
        return is_file((string) config('services.combat.library_path'));
    }

    private function planet(int $owner, string $coords, array $ships, float $d = 1000000.0): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g; $p->system_pos = $s; $p->orbit = $o;
        $p->is_homeworld = true;
        $p->inv_m = 0; $p->inv_c = 0; $p->inv_d = $d;
        $p->levels_json = ['SOLAR' => 1];
        $p->ships_json = $ships;
        $p->queue_building = [];
        $p->production_checkpoint_at = now();
        $p->version = 0;
        $p->save();

        return (int) $p->id;
    }

    private function civ(int $owner): void
    {
        $c = new Civilization();
        $c->owner_id = $owner;
        $c->techs_json = [];
        $c->mission_slots_used = 0;
        $c->version = 0;
        $c->save();
    }

    private function ruleset(): int
    {
        return TestRuleset::create(name: 'balance_rc1', withIntel: true, patches: [
            'FLEET.FORMULA.universe_speed' => 288,
            'BUILD.TIME' => ['model' => 'upstream', 'constant' => 2500, 'universe_speed' => 288,
                't_min_seconds' => 2, 'robotics_level_R' => 0, 'nanite_level_N' => 0],
        ]);
    }

    private function seedDebris(string $coords, float $m, float $c): void
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        DB::table('debris_fields')->insert([
            'galaxy' => $g, 'system_pos' => $s, 'orbit' => $o,
            'metal' => $m, 'crystal' => $c, 'deuterium' => 0, 'version' => 0,
        ]);
    }

    private function debrisAt(string $coords): ?object
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));

        return DB::table('debris_fields')
            ->where('galaxy', $g)->where('system_pos', $s)->where('orbit', $o)->first();
    }

    private function dispatchRecycle(int $planetId, int $ownerId, string $target, array $ships, int $rulesetId): string
    {
        $cmd = new CommandEnvelope(
            commandId: '33333333-3333-4333-8333-3333333333' . substr(sha1($target . $planetId . $ownerId), 0, 3),
            actorKind: 'player', actorId: $ownerId, ownerId: $ownerId,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $planetId, 'mission' => 'recycle',
                'ships' => $ships, 'target' => $target, 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);

        return (string) $res['task_id'];
    }

    // ----------------------------------------------------------------

    /** 没有残骸的坐标不允许派回收队（否则白烧燃料白等一趟）。 */
    public function testRecycleRejectedWhenNoDebrisAtTarget(): void
    {
        $rs = $this->ruleset();
        $origin = $this->planet(1, '1:1:1', ['LIGHT' => 2]);
        $this->civ(1);

        $this->expectException(\App\Domain\Command\CommandRejectedException::class);
        $this->dispatchRecycle($origin, 1, '1:1:5', ['LIGHT' => 2], $rs);
    }

    /** 残骸少于货舱时全取走，残骸场清空删行。 */
    public function testRecycleTakesAllWhenCargoExceedsDebris(): void
    {
        $rs = $this->ruleset();
        // 测试规则集里 LIGHT 的 cargo = 50；10 艘凑 500 货舱，残骸总量 435 装得下
        $origin = $this->planet(1, '1:1:1', ['LIGHT' => 10]);
        $this->civ(1);
        $this->seedDebris('1:1:5', 300, 135);
        $cap = $this->app->make(DebrisFieldService::class)
            ->fleetCargo(['LIGHT' => 10], $this->app->make(\App\Domain\Ruleset\RulesetLoader::class)->load($rs));

        $taskId = $this->dispatchRecycle($origin, 1, '1:1:5', ['LIGHT' => 10], $rs);
        $this->app->make(FleetArrivalService::class)->arrive($taskId);

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        self::assertSame('returning', $task->status, '装货后应转入返航');
        self::assertEqualsWithDelta(300.0, (float) $task->cargo_m, 1e-6, '应取走全部金属残骸');
        self::assertEqualsWithDelta(135.0, (float) $task->cargo_c, 1e-6, '应取走全部晶体残骸');
        self::assertSame(0.0, (float) $task->cargo_d, '氘不成残骸');
        self::assertNull($this->debrisAt('1:1:5'), '扫空后残骸行应删除（与 SPA delete debrisFields[key] 一致）');
        self::assertLessThanOrEqual($cap, (float) $task->cargo_m + (float) $task->cargo_c, '装货不得超过货舱');
    }

    /** 残骸多于货舱时按比例等分，取不下的留在场里。 */
    public function testRecycleTakesProportionalShareWhenCargoIsLimited(): void
    {
        $rs = $this->ruleset();
        $origin = $this->planet(1, '1:1:1', ['LIGHT' => 1]);
        $this->civ(1);
        $this->seedDebris('1:1:5', 100000, 100000); // 共 200000，货舱远小于此

        $taskId = $this->dispatchRecycle($origin, 1, '1:1:5', ['LIGHT' => 1], $rs);
        $this->app->make(FleetArrivalService::class)->arrive($taskId);

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        $left = $this->debrisAt('1:1:5');
        self::assertNotNull($left, '装不下的残骸必须留在场上');
        // 守恒：取走 + 留下 = 原有
        self::assertEqualsWithDelta(
            200000.0,
            (float) $task->cargo_m + (float) $task->cargo_c + (float) $left->metal + (float) $left->crystal,
            1e-3,
            '残骸必须守恒：装走的 + 留下的 = 原有总量',
        );
        self::assertGreaterThan(0.0, (float) $left->metal, '装不下时残骸不能被清零');
    }

    /** 返航后货物入库母星，任务槽释放。 */
    public function testRecycleCargoLandsOnReturn(): void
    {
        $rs = $this->ruleset();
        // LIGHT cargo=50；10 艘 = 500 货舱，残骸 435 装得下 → 可断言「全额入母星」
        $origin = $this->planet(1, '1:1:1', ['LIGHT' => 10]);
        $this->civ(1);
        $this->seedDebris('1:1:5', 200, 80);

        $taskId = $this->dispatchRecycle($origin, 1, '1:1:5', ['LIGHT' => 10], $rs);
        $arrival = $this->app->make(FleetArrivalService::class);
        $arrival->arrive($taskId);

        // 把返航时刻提前，再跑一次 arrive 让它落地
        DB::table('fleet_tasks')->where('task_id', $taskId)->update(['arrive_at' => now()->subSecond()]);
        $arrival->arrive($taskId);

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        self::assertSame('done', $task->status, '返航落地后任务应完成');
        $p = Planet::query()->find($origin);
        self::assertEqualsWithDelta(200.0, (float) $p->inv_m, 1e-6, '回收的金属应入母星库存');
        self::assertEqualsWithDelta(80.0, (float) $p->inv_c, 1e-6, '回收的晶体应入母星库存');
        $c = Civilization::query()->where('owner_id', 1)->first();
        self::assertSame(0, (int) $c->mission_slots_used, '任务完成后应释放任务槽');
    }

    /** 回收必须记账：残骸是「从场上搬进库存」，不是凭空生成。 */
    public function testRecycleWritesDebrisLedgerRow(): void
    {
        $rs = $this->ruleset();
        $origin = $this->planet(1, '1:1:1', ['LIGHT' => 2]);
        $this->civ(1);
        $this->seedDebris('1:1:5', 2000, 800);

        $taskId = $this->dispatchRecycle($origin, 1, '1:1:5', ['LIGHT' => 2], $rs);
        $this->app->make(FleetArrivalService::class)->arrive($taskId);

        $n = DB::table('resource_transactions')
            ->where('owner_id', 1)->where('operation', 'debris')->count();
        self::assertGreaterThan(0, $n, '残骸回收必须写台账（否则账实必然对不上）');
        $row = DB::table('resource_transactions')
            ->where('owner_id', 1)->where('operation', 'debris')
            ->where('resource', 'M')->first();
        self::assertNotNull($row);
        self::assertLessThan(0.0, (float) $row->amount_signed, '装货侧应为负（残骸离开残骸场）');
    }

    /** 无货舱的舰队（纯战斗单位）来回收：空跑一趟，不消耗残骸。 */
    public function testRecycleWithZeroCargoDoesNotConsumeDebris(): void
    {
        // 把 LIGHT 的货舱压到 0，模拟「纯战斗单位来回收」
        $rs = TestRuleset::create(name: 'balance_rc1', withIntel: true, patches: [
            'FLEET.FORMULA.universe_speed' => 288,
            'SHIP.LIGHT.cargo' => 0,
        ]);
        $origin = $this->planet(1, '1:1:1', ['LIGHT' => 5]);
        $this->civ(1);
        $this->seedDebris('1:1:5', 2000, 800);

        $taskId = $this->dispatchRecycle($origin, 1, '1:1:5', ['LIGHT' => 5], $rs);
        $this->app->make(FleetArrivalService::class)->arrive($taskId);

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        self::assertEqualsWithDelta(0.0, (float) $task->cargo_m, 1e-9, '无货舱不得装到任何东西');
        $left = $this->debrisAt('1:1:5');
        self::assertNotNull($left);
        self::assertEqualsWithDelta(2000.0, (float) $left->metal, 1e-6, '残骸不得被无货舱舰队消耗');
    }
}
