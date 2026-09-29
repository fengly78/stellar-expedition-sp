<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Command\GameCommandBus;
use App\Domain\Fleet\FleetArrivalService;
use App\Models\Civilization;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 舰队任务目标校验与失败返航（2026-09-24 缺陷修复）：
 * - 出发时校验：transport/raid/scout 目标需存在；colonize 需空轨道（409 当场拒绝，不再滞留）。
 * - 抵达防御：raid 目标在航程中消失 → 无损返航；colonize 抵达失败（竞态占轨/容量满）→ 转返航。
 */
class DepartureValidationTest extends TestCase
{
    use RefreshDatabase;

    private int $rulesetId;

    private function planet(int $owner, string $coords, array $ships = [], float $invD = 0): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g;
        $p->system_pos = $s;
        $p->orbit = $o;
        $p->is_homeworld = true;
        $p->inv_m = 0;
        $p->inv_c = 0;
        $p->inv_d = $invD;
        $p->levels_json = [];
        $p->ships_json = $ships;
        $p->defense_json = [];
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

    private function dispatch(string $uuid, int $ownerId, int $originId, string $mission, array $ships, string $target): void
    {
        $cmd = new CommandEnvelope(
            commandId: $uuid,
            actorKind: 'player',
            actorId: $ownerId,
            ownerId: $ownerId,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => $mission,
                'ships' => $ships, 'target' => $target, 'speed_pct' => 100],
        );
        $this->app->make(GameCommandBus::class)->dispatch($cmd, $this->rulesetId);
    }

    private function initWorld(): void
    {
        $this->rulesetId = TestRuleset::create(patches: [
            'SHIP.COLONY' => ['M' => 10000, 'C' => 20000, 'D' => 10000, 'cargo' => 7500,
                'A' => 50, 'S' => 100, 'H' => 3000, 'speed' => 2500, 'fuel' => 1000],
        ]);
    }

    public function testDepartureRejectsMissingTargetForRaidScoutTransport(): void
    {
        $this->initWorld();
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 1], invD: 100000);
        $this->civ(1);

        $missions = ['raid', 'scout', 'transport'];
        foreach ($missions as $i => $mission) {
            try {
                $this->dispatch('77777770-0000-4000-8000-0000000000'.$i, 1, $originId, $mission, ['LIGHT' => 1], '1:9:9');
                $this->fail("{$mission} 到不存在目标应被拒绝");
            } catch (CommandRejectedException $e) {
                $this->assertStringContainsString('目标行星不存在', $e->getMessage());
            }
        }
    }

    public function testColonizeToOccupiedOrbitRejectedAtDeparture(): void
    {
        $this->initWorld();
        $originId = $this->planet(1, '1:1:1', ['COLONY' => 1], invD: 1000000);
        $this->planet(2, '1:1:2');
        $this->civ(1);

        $this->expectException(\App\Domain\Command\CommandRejectedException::class);
        $this->expectExceptionMessage('已被占用');
        $this->dispatch('77777771-0000-4000-8000-000000000001', 1, $originId, 'colonize',
            ['COLONY' => 1], '1:1:2');
    }

    public function testRaidArrivalWithVanishedTargetReturnsHome(): void
    {
        $this->initWorld();
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 5], invD: 100000);
        $targetId = $this->planet(2, '1:1:2');
        $this->civ(1);
        $this->civ(2);

        $cmd = new CommandEnvelope(
            commandId: '88888888-0000-4000-8000-000000000001',
            actorKind: 'player', actorId: 1, ownerId: 1,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => 'raid',
                'ships' => ['LIGHT' => 5], 'target' => '1:1:2', 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $this->rulesetId);
        $taskId = $res['task_id'];

        // 目标在航程中消失（防御性路径：正常部署中行星不可删，此为竞态/运维删除兜底）
        Planet::where('id', $targetId)->delete();
        $this->app->make(FleetArrivalService::class)->arrive($taskId);

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        $this->assertSame('returning', $task->status, '目标消失必须无损返航');
        $this->assertSame(0, DB::table('battle_snapshots')->count(), '无目标不得产出战斗');

        // 返航落地：舰队完整回港
        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->where('arrive_at', '<=', now())->first();
        if ($task !== null) {
            $this->app->make(FleetArrivalService::class)->arrive($taskId);
        }
        $this->app->make(FleetArrivalService::class)->arrive($taskId);
        $origin = Planet::find($originId);
        $this->assertSame(5, (int) (($origin->ships_json ?? [])['LIGHT'] ?? 0), '舰队必须完整回港');
    }

    public function testColonizeRaceFailureReturnsFleetHome(): void
    {
        $this->initWorld();
        $originId = $this->planet(1, '1:1:1', ['COLONY' => 1], invD: 1000000);
        $this->planet(2, '1:1:3');
        $this->civ(1);
        $this->civ(2);

        $cmd = new CommandEnvelope(
            commandId: '88888888-0000-4000-8000-000000000002',
            actorKind: 'player', actorId: 1, ownerId: 1,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => 'colonize',
                'ships' => ['COLONY' => 1], 'target' => '1:1:2', 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $this->rulesetId);
        $taskId = $res['task_id'];

        // 竞态：航程中 1:1:2 被他人殖民 → 抵达判 occupied → 转返航
        $this->app->make(FleetArrivalService::class)->arrive($taskId);
        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        $this->assertSame('returning', $task->status, '殖民失败必须转返航');
        $this->assertSame(1, (int) ((array) json_decode((string) $task->ships_json, true))['COLONY'] ?? 1, '殖民舰不损失');

        // 返航落地：殖民舰回港（竞态失败无损）
        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->where('arrive_at', '<=', now())->first();
        if ($task !== null) {
            $this->app->make(FleetArrivalService::class)->arrive($taskId);
        }
        $this->app->make(FleetArrivalService::class)->arrive($taskId);
        $origin = Planet::find($originId);
        $this->assertSame(1, (int) (($origin->ships_json ?? [])['COLONY'] ?? 0), '殖民舰必须完整回港');
    }
}
