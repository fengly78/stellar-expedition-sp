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
 * Raid 端到端集成（dev-plan-e1 S4 验收钩子，2026-09-23 首次真跑）：
 * FLEET_DISPATCH 命令 → 总线 → FleetArrivalService → CombatResolveService
 * → Rust FFI 战斗 → 掠夺三重限制 → 残骸场 → Ledger，全链路真数据库（内存 SQLite）。
 * 数值断言全部从战斗快照推导（引擎确定性，种子=battle_id 派生），不预设胜方。
 */
class RaidEndToEndTest extends TestCase
{
    use RefreshDatabase;

    private function dllReady(): bool
    {
        return is_file((string) config('services.combat.library_path'));
    }

    private function planet(int $owner, string $coords, array $ships, float $invM = 0.0, float $invD = 0.0): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g;
        $p->system_pos = $s;
        $p->orbit = $o;
        $p->is_homeworld = true;
        $p->inv_m = $invM;
        $p->inv_c = 0;
        $p->inv_d = $invD;
        $p->levels_json = ['SOLAR' => 1];
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

    public function testRaidFullChainThroughRustFfi(): void
    {
        if (! $this->dllReady()) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 10], 0, 1000000);
        $this->planet(2, '1:1:2', ['LIGHT' => 5], 100000);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create();

        $cmd = new CommandEnvelope(
            commandId: '22222222-2222-4222-8222-222222222222',
            actorKind: 'player',
            actorId: 1,
            ownerId: 1,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => 'raid',
                'ships' => ['LIGHT' => 10], 'target' => '1:1:2', 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
        $taskId = $res['task_id'];

        $this->app->make(FleetArrivalService::class)->arrive($taskId);

        // 战斗快照：存在、引擎版本、结果与任务/行星落库一致（键已还原为舰名）
        $snap = DB::table('battle_snapshots')->where('battle_id', "battle-{$taskId}")->first();
        $this->assertNotNull($snap, 'raid 抵达必须产出战斗快照');
        $this->assertSame('rust-classic-ffi-spec-v0.1', $snap->engine_version);
        $result = (array) json_decode((string) $snap->result_json, true);

        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->first();
        $this->assertSame('returning', $task->status);
        $this->assertSame($result['attacker_survivors'], (array) json_decode((string) $task->ships_json, true));
        $this->assertSame(10,
            array_sum($result['attacker_survivors']) + array_sum($result['attacker_losses']),
            '攻方存活+损毁必须守恒');

        $defender = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 2)->first();
        $this->assertSame($result['defender_survivors'], (array) ($defender->ships_json ?? []));
        $this->assertSame(5,
            array_sum($result['defender_survivors']) + array_sum($result['defender_losses']),
            '守方存活+损毁必须守恒');

        // 掠夺三重限制：入舱货 = 快照 loot，且 ≤ 存活剩余货舱（LIGHT cargo=50）
        $cargoTotal = (float) $task->cargo_m + (float) $task->cargo_c + (float) $task->cargo_d;
        $this->assertLessThanOrEqual(array_sum($result['attacker_survivors']) * 50 + 1e-6, $cargoTotal);
        $this->assertEqualsWithDelta($result['loot']['M'], (float) $task->cargo_m, 1e-6);
        $this->assertEqualsWithDelta($result['loot']['C'], (float) $task->cargo_c, 1e-6);
        $this->assertEqualsWithDelta($result['loot']['D'], (float) $task->cargo_d, 1e-6);

        // 残骸场：双方损失 LIGHT 成本 M3000 × 0.30（同型舰两侧同价）
        $debris = $this->app->make(DebrisFieldService::class)->at(1, 1, 2);
        $this->assertNotNull($debris);
        $totalLost = ($result['attacker_losses']['LIGHT'] ?? 0) + ($result['defender_losses']['LIGHT'] ?? 0);
        $this->assertEqualsWithDelta(3000 * $totalLost * 0.30, $debris['M'], 1e-6);
        $this->assertEqualsWithDelta(1000 * $totalLost * 0.30, $debris['C'], 1e-6);

        // 幂等：重复 arrive 不再战斗、不再写**掠夺**台账（返航落地合法发生）
        //
        // 2026-09-29 收窄断言：原断言是「台账总行数不变」，之所以成立只是因为
        // landReturn 此前**只加库存、不写台账**。补上返航台账后，第二次 arrive
        // （即合法的返航落地）会新增一行——那是正确行为，不该被这条断言压住。
        // 真正要守的是「战斗与掠夺不重复」，故改成按 operation 精确断言。
        $plunderBefore = DB::table('resource_transactions')->where('operation', 'plunder')->count();
        $snapBefore = DB::table('battle_snapshots')->where('battle_id', "battle-{$taskId}")->count();
        $this->app->make(FleetArrivalService::class)->arrive($taskId);
        $this->assertSame($snapBefore, DB::table('battle_snapshots')->where('battle_id', "battle-{$taskId}")->count());
        $this->assertSame(
            $plunderBefore,
            DB::table('resource_transactions')->where('operation', 'plunder')->count(),
            '重复 arrive 不得再次写掠夺台账'
        );
    }

    public function testRaidWithoutUnitIdFallsBackToShipNames(): void
    {
        if (! $this->dllReady()) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 4], 0, 100000);
        $this->planet(2, '1:1:2', ['LIGHT' => 1]);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create(withUnitId: false);

        $cmd = new CommandEnvelope(
            commandId: '33333333-3333-4333-8333-333333333333',
            actorKind: 'player',
            actorId: 1,
            ownerId: 1,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => 'raid',
                'ships' => ['LIGHT' => 4], 'target' => '1:1:2', 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
        $this->app->make(FleetArrivalService::class)->arrive($res['task_id']);

        $snap = DB::table('battle_snapshots')->where('battle_id', 'battle-'.$res['task_id'])->first();
        $this->assertNotNull($snap);
        $result = (array) json_decode((string) $snap->result_json, true);

        // 回退口径：无 unit_id 配置时以 crc32(舰名) 作内部数值 ID（JSON 数字键解码回 int），输出还原为舰名
        $participants = (array) json_decode((string) $snap->participants_json, true);
        $this->assertSame([crc32('LIGHT')], array_keys($participants['attacker_fleets'][0]['units']));
        foreach ($result['attacker_survivors'] + $result['attacker_losses'] as $ship => $n) {
            $this->assertArrayHasKey($ship, ['LIGHT' => true], "未知舰名键：{$ship}");
        }
        $this->assertSame(4, array_sum($result['attacker_survivors']) + array_sum($result['attacker_losses']));
    }
}
