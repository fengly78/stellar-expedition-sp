<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\GameCommandBus;
use App\Models\Civilization;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 经济链与殖民链端到端（补齐 raid/scout 之外的 MVP 任务面）：
 * 1. 建造链：BUILD_ENQUEUE（入队不扣费）→ BUILD_START（扣费+任务行）→ Worker 到期完成 → 升级。
 * 2. 研究链：RESEARCH_START（文明锁+扣费）→ Worker 完成 → 科技入账+锁释放。
 * 3. 运输链：送达目标星球 → 返航落地。
 * 4. 殖民链：抵达建星+消耗殖民舰 → 剩余舰队返航。
 * Worker 驱动的切片按 API-01 §4 事件时间语义：把 complete_at 回拨到过去再触发 Worker。
 */
class EconomyAndFleetChainsTest extends TestCase
{
    use RefreshDatabase;

    private function planet(int $owner, string $coords, array $ships = [], float $invM = 0, float $invC = 0, float $invD = 0): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g;
        $p->system_pos = $s;
        $p->orbit = $o;
        $p->is_homeworld = true;
        $p->inv_m = $invM;
        $p->inv_c = $invC;
        $p->inv_d = $invD;
        $p->levels_json = [];
        $p->ships_json = $ships;
        $p->queue_building = [];
        $p->production_checkpoint_at = now();
        $p->version = 0;
        $p->save();
        return (int) $p->id;
    }

    private function civ(int $owner, array $techs = []): void
    {
        $c = new Civilization();
        $c->owner_id = $owner;
        $c->techs_json = $techs;
        $c->mission_slots_used = 0;
        $c->version = 0;
        $c->save();
    }

    private function dispatch(int $rulesetId, string $uuid, int $ownerId, string $type, array $payload): array
    {
        $cmd = new CommandEnvelope(
            commandId: $uuid,
            actorKind: 'player',
            actorId: $ownerId,
            ownerId: $ownerId,
            type: $type,
            payload: $payload,
        );
        return $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
    }

    public function testBuildChainEnqueueStartComplete(): void
    {
        $planetId = $this->planet(1, '1:1:1', [], 1000, 1000, 1000);
        $this->civ(1);
        $rulesetId = TestRuleset::create(patches: [
            'QUEUE.BUILD.PENDING' => 3,
            'BUILD.TIME' => ['model' => 'upstream', 'constant' => 2500, 'universe_speed' => 1,
                't_min_seconds' => 30, 'robotics_level_R' => 0, 'nanite_level_N' => 0],
        ]);

        // 入队不扣费
        $this->dispatch($rulesetId, 'aaaaaaaa-0000-4000-8000-000000000001', 1,
            'BUILD_ENQUEUE', ['planet_id' => $planetId, 'building' => 'METAL_MINE']);
        $p = Planet::find($planetId);
        $this->assertCount(1, (array) $p->queue_building);
        $this->assertEqualsWithDelta(1000.0, (float) $p->inv_m, 1e-6, '入队不得扣费');

        // 启动扣费（金属矿 L1 = 60/15/0，F-01）并落执行任务
        $res = $this->dispatch($rulesetId, 'aaaaaaaa-0000-4000-8000-000000000002', 1,
            'BUILD_START', ['planet_id' => $planetId]);
        $this->assertSame('METAL_MINE', $res['building']);
        $this->assertSame(1, (int) $res['target_level']);
        $p = Planet::find($planetId);
        $this->assertEqualsWithDelta(940.0, (float) $p->inv_m, 1e-6, '启动必须扣费');
        $this->assertCount(0, (array) $p->queue_building);
        $task = DB::table('build_tasks')->where('planet_id', $planetId)->where('status', 'executing')->first();
        $this->assertNotNull($task, '必须有执行中的建造任务');

        // 事件时间回拨 → Worker 结算：升到 Lv.1
        DB::table('build_tasks')->where('id', $task->id)->update(['complete_at' => now()->subSecond()]);
        $p->levels_json = ['CRYSTAL_MINE' => 5, 'SOLAR' => 5];
        $p->production_checkpoint_at = now()->subHour();
        $p->save();
        $this->artisan('game:process-builds')->assertExitCode(0);
        $p = Planet::find($planetId);
        $this->assertSame(1, $p->level('METAL_MINE'), 'Worker 完成后必须升级');
        $this->assertSame(0, DB::table('build_tasks')->where('id', $task->id)->value('status') === 'done' ? 0 : 1);
        $this->assertGreaterThan(0, DB::table('resource_transactions')
            ->where('planet_id', $planetId)->where('operation', 'production')->count());
    }

    public function testResearchChainLockAndComplete(): void
    {
        $planetId = $this->planet(1, '1:1:1', [], 2000, 2000, 2000);
        $this->civ(1);
        $rulesetId = TestRuleset::create(patches: [
            'RESEARCH.TIME' => ['model' => 'upstream', 'constant' => 1000, 'lab_factor' => 0,
                'universe_speed' => 1, 't_min_seconds' => 30],
            'REQUIRES.TECH.ENERGY' => [],
        ]);

        $res = $this->dispatch($rulesetId, 'bbbbbbbb-0000-4000-8000-000000000001', 1,
            'RESEARCH_START', ['planet_id' => $planetId, 'tech' => 'ENERGY']);
        $this->assertSame(1, (int) $res['target_level']);

        $civ = Civilization::query()->where('owner_id', 1)->first();
        $this->assertNotNull($civ->research_active, '研究期间文明锁必须存在');
        $p = Planet::find($planetId);
        $this->assertEqualsWithDelta(1200.0, (float) $p->inv_c, 1e-6, 'TECH.ENERGY L1 = 800C');
        $this->assertEqualsWithDelta(1600.0, (float) $p->inv_d, 1e-6, 'TECH.ENERGY L1 = 400D');

        // 事件时间回拨 → Worker 完成：科技入账、锁释放
        DB::table('research_tasks')->where('id', $res['task_id'])->update(['complete_at' => now()->subSecond()]);
        $this->artisan('game:process-due')->assertExitCode(0);
        $civ = Civilization::query()->where('owner_id', 1)->first();
        $this->assertSame(1, $civ->techLevel('ENERGY'), '完成后科技必须入账');
        $this->assertNull($civ->research_active, '完成后文明研究锁必须释放');
    }

    public function testTransportDeliversThenReturns(): void
    {
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 1], 1000, 0, 100000);
        $this->planet(1, '1:1:2');   // 同主自己的第二颗星
        $this->civ(1);
        $rulesetId = TestRuleset::create();

        $res = $this->dispatch($rulesetId, 'cccccccc-0000-4000-8000-000000000001', 1,
            'FLEET_DISPATCH', ['planet_id' => $originId, 'mission' => 'transport',
                'ships' => ['LIGHT' => 1], 'cargo' => ['M' => 50], 'target' => '1:1:2', 'speed_pct' => 100]);
        $taskId = $res['task_id'];

        $this->app->make(\App\Domain\Fleet\FleetArrivalService::class)->arrive($taskId);
        $target = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 2)->first();
        $this->assertEqualsWithDelta(50.0, (float) $target->inv_m, 1e-6, '抵达必须一次性交付货物');
        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        $this->assertSame('returning', $task->status);

        // 返航落地：舰回母星、任务槽释放、任务 done
        $this->app->make(\App\Domain\Fleet\FleetArrivalService::class)->arrive($taskId);
        $origin = Planet::find($originId);
        $this->assertSame(1, (int) (($origin->ships_json ?? [])['LIGHT'] ?? 0), '返航后舰船必须回港');
        $this->assertSame('done', DB::table('fleet_tasks')->where('task_id', $taskId)->value('status'));
        $this->assertSame(0, (int) DB::table('civilizations')->where('owner_id', 1)->value('mission_slots_used'));
    }

    public function testColonizeCreatesSecondPlanet(): void
    {
        $originId = $this->planet(1, '1:1:1', ['COLONY' => 1], 1000, 1000, 1000000);
        $this->planet(2, '1:1:2');   // 他人星（不阻碍 1:1:3 殖民）
        $this->civ(1, ['ASTRO' => 1]);   // F-06: 1+ceil(1/2)=2 颗上限
        $rulesetId = TestRuleset::create(patches: [
            'SHIP.COLONY' => ['M' => 10000, 'C' => 20000, 'D' => 10000, 'cargo' => 7500,
                'A' => 50, 'S' => 100, 'H' => 3000, 'speed' => 2500, 'fuel' => 1000],
        ]);

        $res = $this->dispatch($rulesetId, 'dddddddd-0000-4000-8000-000000000001', 1,
            'FLEET_DISPATCH', ['planet_id' => $originId, 'mission' => 'colonize',
                'ships' => ['COLONY' => 1], 'cargo' => ['M' => 100], 'target' => '1:1:3', 'speed_pct' => 100]);
        $taskId = $res['task_id'];

        $this->app->make(\App\Domain\Fleet\FleetArrivalService::class)->arrive($taskId);

        $colony = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 3)->first();
        $this->assertNotNull($colony, '殖民必须建星');
        $this->assertFalse((bool) $colony->is_homeworld);
        $this->assertEqualsWithDelta(100.0, (float) $colony->inv_m, 1e-6, '携带货物必须转入新行星');
        $this->assertSame(0, (int) (($colony->ships_json ?? [])['COLONY'] ?? 0), '殖民舰必须被消耗');

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        $this->assertSame('returning', $task->status);
        $this->assertSame(0, array_sum((array) json_decode((string) $task->ships_json, true)), '唯一殖民舰消耗后返航队列为空');
    }
}
