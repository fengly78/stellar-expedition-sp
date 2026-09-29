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
 * game:audit 运行时审计（发布 P1-9）：
 * 健康世界（含建造/研究/舰队在途）全过；注入漂移（任务槽/研究锁/负库存）逐项被抓。
 */
class AuditCommandTest extends TestCase
{
    use RefreshDatabase;

    private function healthyWorld(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', [
            'owner_id' => 7, '--m' => '5000', '--c' => '5000', '--d' => '5000',
        ])->assertExitCode(0);

        $rulesetId = TestRuleset::create(patches: [
            'BUILD.TIME' => ['model' => 'upstream', 'constant' => 2500, 'universe_speed' => 1,
                't_min_seconds' => 30, 'robotics_level_R' => 0, 'nanite_level_N' => 0],
            'RESEARCH.TIME' => ['model' => 'upstream', 'constant' => 1000, 'lab_factor' => 0,
                'universe_speed' => 1, 't_min_seconds' => 30],
            'REQUIRES.TECH.ENERGY' => [],
            'SHIP.TIME' => ['model' => 'upstream', 'constant' => 2500, 'shipyard_level_S' => 0,
                'nanite_level_N' => 0, 'universe_speed' => 1, 't_min_seconds' => 30],
        ]);
        $planetId = (int) Planet::query()->where('owner_id', 7)->first()->id;
        // 侦察目标（出发校验要求目标存在）
        $t = new Planet();
        $t->owner_id = 99;
        $t->galaxy = 1;
        $t->system_pos = 1;
        $t->orbit = 2;
        $t->is_homeworld = true;
        $t->levels_json = [];
        $t->ships_json = [];
        $t->defense_json = [];
        $t->queue_building = [];
        $t->production_checkpoint_at = now();
        $t->save();

        $bus = $this->app->make(GameCommandBus::class);
        $mk = fn (string $uuid, string $type, array $payload) => new CommandEnvelope(
            commandId: $uuid, actorKind: 'player', actorId: 7, ownerId: 7, type: $type, payload: $payload,
        );

        // 建造执行中 + 研究执行中 + 舰队在途 → 各守恒面都有真实数据
        $bus->dispatch($mk('abababab-0000-4000-8000-000000000001', 'BUILD_ENQUEUE',
            ['planet_id' => $planetId, 'building' => 'METAL_MINE']), $rulesetId);
        $bus->dispatch($mk('abababab-0000-4000-8000-000000000002', 'BUILD_START',
            ['planet_id' => $planetId]), $rulesetId);
        $bus->dispatch($mk('abababab-0000-4000-8000-000000000003', 'RESEARCH_START',
            ['planet_id' => $planetId, 'tech' => 'ENERGY']), $rulesetId);

        Planet::query()->where('id', $planetId)->update(['ships_json' => json_encode(['LIGHT' => 1])]);
        $bus->dispatch($mk('abababab-0000-4000-8000-000000000004', 'FLEET_DISPATCH',
            ['planet_id' => $planetId, 'mission' => 'scout', 'ships' => ['LIGHT' => 1],
                'target' => '1:1:2', 'speed_pct' => 100]), $rulesetId);
    }

    public function testHealthyWorldPassesAudit(): void
    {
        $this->healthyWorld();
        $this->artisan('game:audit')->assertExitCode(0);
    }

    public function testMissionSlotDriftDetected(): void
    {
        $this->healthyWorld();
        DB::table('civilizations')->where('owner_id', 7)->update(['mission_slots_used' => 5]);

        $this->artisan('game:audit')->assertExitCode(1);
        $this->artisan('game:audit')
            ->expectsOutputToContain('任务槽漂移')
            ->run();
    }

    public function testResearchLockOrphanDetected(): void
    {
        $this->healthyWorld();
        // 文明锁被误清但任务仍 executing
        DB::table('civilizations')->where('owner_id', 7)->update(['research_active' => null]);

        $this->artisan('game:audit')->assertExitCode(1);
    }

    public function testNegativeInventoryDetected(): void
    {
        $this->healthyWorld();
        Planet::query()->where('owner_id', 7)->update(['inv_m' => -5]);

        $this->artisan('game:audit')->assertExitCode(1);
    }

    public function testDuplicateExecutingBuildDetected(): void
    {
        $this->healthyWorld();
        $row = DB::table('build_tasks')->where('status', 'executing')->first();
        DB::table('build_tasks')->insert([
            'planet_id' => $row->planet_id, 'building' => 'SOLAR', 'target_level' => 1,
            'cost_m' => 0, 'cost_c' => 0, 'cost_d' => 0, 'ruleset_id' => $row->ruleset_id,
            'status' => 'executing', 'complete_at' => now()->addHour(),
        ]);

        $this->artisan('game:audit')->assertExitCode(1);
    }
}
