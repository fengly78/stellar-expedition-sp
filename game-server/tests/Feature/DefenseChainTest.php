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
 * 防御设施链路（SOURCE-02 经典防御玩法，2026-09-23 落地）：
 * - SHIP_ORDER 按规则集族自动路由：DEFENSE.<name> 在 → 防御订单（defense_json），否则舰船。
 * - 穹顶 max=1 上限；防御参战（第二防守舰队）；修复 70%±10 确定性种子；防御残骸默认 0。
 */
class DefenseChainTest extends TestCase
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

    public function testDefenseOrderCompletesIntoDefenseJson(): void
    {
        $planetId = $this->planet(1, '1:1:1', [], 20000);
        $this->civ(1);
        $rulesetId = TestRuleset::create(patches: [
            'DEFENSE.ROCKET' => ['M' => 2000, 'C' => 0, 'D' => 0, 'A' => 80, 'S' => 20, 'H' => 200, 'unit_id' => 401, 'rapidfire' => []],
            'REQUIRES.DEFENSE.ROCKET' => [],
            'SHIP.TIME' => ['model' => 'upstream', 'constant' => 2500, 'shipyard_level_S' => 0,
                'nanite_level_N' => 0, 'universe_speed' => 1, 't_min_seconds' => 30],
        ]);

        $this->dispatch($rulesetId, 'aaaaaaaa-0000-4000-8000-0000000000aa', 1,
            'SHIP_ORDER', ['planet_id' => $planetId, 'ship' => 'ROCKET', 'amount' => 5, 'batch_no' => 'batch-rocket-1']);
        $p = Planet::find($planetId);
        $this->assertEqualsWithDelta(10000.0, (float) $p->inv_m, 1e-6, '整批扣费 5×2000');
        $this->assertSame([], (array) $p->ships_json, '防御不得混入舰队');

        DB::table('ship_orders')->where('batch_no', 'batch-rocket-1')->update(['complete_at' => now()->subSecond()]);
        $this->artisan('game:process-due')->assertExitCode(0);

        $p = Planet::find($planetId);
        $this->assertSame(5, (int) ($p->defense_json['ROCKET'] ?? 0), '完成的防御必须入 defense_json');
        $this->assertSame([], (array) $p->ships_json);
    }

    public function testDomeMaxOneEnforced(): void
    {
        $planetId = $this->planet(1, '1:1:1', [], 100000, 100000);
        $this->civ(1);
        $rulesetId = TestRuleset::create(patches: [
            'DEFENSE.SMALL_DOME' => ['M' => 10000, 'C' => 10000, 'D' => 0, 'A' => 1, 'S' => 2000, 'H' => 2000, 'unit_id' => 407, 'rapidfire' => [], 'max' => 1],
            'REQUIRES.DEFENSE.SMALL_DOME' => [],
            'SHIP.TIME' => ['model' => 'upstream', 'constant' => 2500, 'shipyard_level_S' => 0,
                'nanite_level_N' => 0, 'universe_speed' => 1, 't_min_seconds' => 30],
        ]);

        $this->dispatch($rulesetId, 'bbbbbbbb-0000-4000-8000-000000000001', 1,
            'SHIP_ORDER', ['planet_id' => $planetId, 'ship' => 'SMALL_DOME', 'amount' => 1, 'batch_no' => 'batch-dome-1']);

        $this->expectException(\App\Domain\Command\CommandRejectedException::class);
        $this->expectExceptionMessage('上限');
        $this->dispatch($rulesetId, 'bbbbbbbb-0000-4000-8000-000000000002', 1,
            'SHIP_ORDER', ['planet_id' => $planetId, 'ship' => 'SMALL_DOME', 'amount' => 1, 'batch_no' => 'batch-dome-2']);
    }

    public function testDefenseParticipatesInRaidWithRepairAndNoDefenseDebris(): void
    {
        if (! is_file((string) config('services.combat.library_path'))) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 10], 0, 0, 100000);
        $this->planet(2, '1:1:2', [], 30000, 30000, 30000);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create(patches: [
            'DEFENSE.ROCKET' => ['M' => 2000, 'C' => 0, 'D' => 0, 'A' => 80, 'S' => 20, 'H' => 200, 'unit_id' => 401, 'rapidfire' => []],
            'REQUIRES.DEFENSE.ROCKET' => [],
            'COMBAT.DEFENSE_REPAIR' => ['base' => 70, 'delta' => 10],
        ]);
        $defender = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 2)->first();
        $defender->defense_json = ['ROCKET' => 5];
        $defender->save();

        $res = $this->dispatch($rulesetId, 'cccccccc-0000-4000-8000-000000000001', 1,
            'FLEET_DISPATCH', ['planet_id' => $originId, 'mission' => 'raid',
                'ships' => ['LIGHT' => 10], 'target' => '1:1:2', 'speed_pct' => 100]);
        $this->app->make(\App\Domain\Fleet\FleetArrivalService::class)->arrive($res['task_id']);

        $snap = DB::table('battle_snapshots')->where('battle_id', 'battle-'.$res['task_id'])->first();
        $this->assertNotNull($snap);
        $result = (array) json_decode((string) $snap->result_json, true);

        // 防御参战：防守方输出被拆分为舰队与防御两个域
        $defLostRockets = (int) ($result['defense_losses']['ROCKET'] ?? 0);
        $defSurvRockets = (int) ($result['defense_survivors']['ROCKET'] ?? 0);
        $repairedRockets = (int) ($result['defense_repaired']['ROCKET'] ?? 0);
        $this->assertSame(5, $defLostRockets + $defSurvRockets, '防御损失+存活守恒');

        $defender = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 2)->first();
        $finalRockets = (int) (($defender->defense_json ?? [])['ROCKET'] ?? 0);
        $this->assertSame($defSurvRockets + $repairedRockets, $finalRockets, '防御终态 = 存活 + 修复');
        $this->assertLessThanOrEqual($defLostRockets, $repairedRockets, '修复数不得超过损毁数');

        // 防御残骸默认 0：残骸只含攻方轻战损失（3000M×30%）
        $expM = 0.30 * 3000 * (int) ($result['attacker_losses']['LIGHT'] ?? 0);
        $this->assertEqualsWithDelta($expM, (float) DB::table('debris_fields')
            ->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 2)->value('metal'), 1e-6);

        // 攻方损失必须 ≥1：5 座火箭炮 80 攻击齐射对 10 架轻战（hull 400）必有杀伤
        $participants = (array) json_decode((string) $snap->participants_json, true);
        $this->assertCount(2, $participants['defender_fleets'], '防御必须以第二防守舰队参战');
        $this->assertSame(5, (int) ($participants['defender_fleets'][1]['units']['401']['amount'] ?? 0), '防御单位必须按 unit_id 进入战斗输入');
    }
}
