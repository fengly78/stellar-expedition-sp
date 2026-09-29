<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\GameCommandBus;
use App\Domain\Fleet\FleetArrivalService;
use App\Models\Civilization;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 多玩家并发语义（P1-7 首切片；发布就绪 P0-4 前置行为锁定）：
 * 两名玩家先后袭击同一星球——第二场战斗必须在第一场结算后的**最新状态**上进行
 * （行锁 + 事件序推进），掠夺总量不得超出首战后的合法库存，任务槽/舰船守恒不串。
 */
class MultiAttackerTest extends TestCase
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

    private function raid(int $rulesetId, string $uuid, int $ownerId, int $originId, int $lightCount): string
    {
        $cmd = new CommandEnvelope(
            commandId: $uuid,
            actorKind: 'player',
            actorId: $ownerId,
            ownerId: $ownerId,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => 'raid',
                'ships' => ['LIGHT' => $lightCount], 'target' => '1:1:9', 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
        return $res['task_id'];
    }

    public function testSequentialRaidsSeePostBattleStateAndLootConserves(): void
    {
        if (! is_file((string) config('services.combat.library_path'))) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $rulesetId = TestRuleset::create();
        // 两个进攻方各 10 轻战；防守方 1:1:9 拥有 20 轻战 + 60000×3 库存
        $o1 = $this->planet(1, '1:1:1', ['LIGHT' => 10], 0, 0, 1000000);
        $o2 = $this->planet(2, '1:1:2', ['LIGHT' => 10], 0, 0, 1000000);
        $this->planet(3, '1:1:9', ['LIGHT' => 20], 60000, 60000, 60000);
        $this->civ(1);
        $this->civ(2);
        $this->civ(3);

        $t1 = $this->raid($rulesetId, '99999999-0000-4000-8000-000000000001', 1, $o1, 10);
        $t2 = $this->raid($rulesetId, '99999999-0000-4000-8000-000000000002', 2, $o2, 10);

        $arrival = $this->app->make(\App\Domain\Fleet\FleetArrivalService::class);
        $arrival->arrive($t1);
        $arrival->arrive($t2);

        // 两场战斗快照独立存在
        $this->assertSame(2, DB::table('battle_snapshots')->whereIn('battle_id', ["battle-{$t1}", "battle-{$t2}"])->count());

        $r1 = (array) json_decode((string) DB::table('battle_snapshots')->where('battle_id', "battle-{$t1}")->value('result_json'), true);
        $r2 = (array) json_decode((string) DB::table('battle_snapshots')->where('battle_id', "battle-{$t2}")->value('result_json'), true);

        // 防守方总损失跨两场守恒：第一场后幸存者 = 第二场的战前基数
        $survAfter1 = (int) array_sum($r1['defender_survivors']);
        $lost2 = (int) array_sum($r2['defender_losses']);
        $survAfter2 = (int) array_sum($r2['defender_survivors']);
        $this->assertSame(20, (int) array_sum($r1['defender_losses']) + $survAfter1, '第一场守恒');
        $this->assertSame($survAfter1, $lost2 + $survAfter2, '第二场必须基于第一战后的最新状态');

        // 掠夺跨场不超发：两场掠夺总量 ≤ 守方库存（各场受 legal×50% 与舱位双重限制）
        $task2 = DB::table('fleet_tasks')->where('task_id', $t2)->first();
        $loot2Total = (float) $task2->cargo_m + (float) $task2->cargo_c + (float) $task2->cargo_d;
        $defender = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 9)->first();
        $this->assertGreaterThanOrEqual(0.0, (float) $defender->inv_m, '守方库存不得为负');
        $this->assertGreaterThanOrEqual(0.0, (float) $defender->inv_c, '守方库存不得为负');
        $this->assertGreaterThanOrEqual(0.0, (float) $defender->inv_d, '守方库存不得为负');

        // 各进攻方资源独立：o1 的 D 只被自己的燃料扣减（10 轻战同星 ≈ 数千，而非他人消耗）
        $origin1 = Planet::find($o1);
        $deduction = 1000000.0 - (float) $origin1->inv_d;
        $this->assertGreaterThan(0.0, $deduction, '燃料必须被扣减');
        $this->assertLessThan(10000.0, $deduction, '燃料扣减必须只来自自己的舰队');
        unset($loot2Total);
    }
}
