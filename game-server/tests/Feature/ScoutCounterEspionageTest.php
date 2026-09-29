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
 * 反侦察机制端到端（GDD-12 / 上游 CounterEspionageService 同构；2026-09-23 机制落地）：
 * 无守舰 → 概率 0 不触发；守舰压倒性 → 概率夹 100 必触发、探针覆灭、残骸入场、
 * 报告恒生成但揭示按剩余（存活封顶）阈值裁剪。判定种子确定性派生（task_id），
 * 用 0/100 两个夹逼档避开随机边界，保证用例稳定。
 */
class ScoutCounterEspionageTest extends TestCase
{
    use RefreshDatabase;

    private function planet(int $owner, string $coords, array $ships, float $invM = 0.0, float $invD = 0.0, array $levels = ['SOLAR' => 1]): int
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
        $p->levels_json = $levels;
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

    /** 派出 n 艘 SCOUT 侦察 1:1:2 并结算抵达，返回 [taskId, intel 可见字段, task 行] */
    private function dispatchAndArrive(int $rulesetId, int $n, int $originId): array
    {
        $cmd = new CommandEnvelope(
            commandId: sprintf('44444444-4444-4444-8444-%012d', $n),
            actorKind: 'player',
            actorId: 1,
            ownerId: 1,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => 'scout',
                'ships' => ['SCOUT' => $n], 'target' => '1:1:2', 'speed_pct' => 100],
        );
        $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
        $this->app->make(FleetArrivalService::class)->arrive($res['task_id']);

        $task = DB::table('fleet_tasks')->where('task_id', $res['task_id'])->first();
        $intel = DB::table('intel_snapshots')->where('source_command', '44444444-4444-4444-8444-'.sprintf('%012d', $n))->first();
        $this->assertNotNull($intel, '情报快照必须恒生成');
        return [$res['task_id'], (array) json_decode((string) $intel->visible_fields_json, true), $task];
    }

    public function testNoDefenseNoBattleAndThresholdsApply(): void
    {
        $originId = $this->planet(1, '1:1:1', ['SCOUT' => 3], 0, 100000);
        $this->planet(2, '1:1:2', [], 777);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create(withIntel: true);

        [$taskId, $visible, $task] = $this->dispatchAndArrive($rulesetId, 3, $originId);

        // 无守舰 → 概率 0，无战斗
        $this->assertSame(0, DB::table('battle_snapshots')->count());
        $this->assertFalse($visible['meta']['counter_esp_triggered']);
        $this->assertSame(0, $visible['meta']['counter_esp_chance']);

        // 资源恒可见；3 探针无级差 → ships(≥2) 揭示，buildings(≥5)/research(≥7) 不揭示
        $this->assertTrue($visible['target_exists']);
        $this->assertEqualsWithDelta(777.0, $visible['resources']['M'], 1e-6);
        $this->assertSame([], $visible['ships']);
        $this->assertNull($visible['buildings']);
        $this->assertNull($visible['research']);

        // 探针全存 → 返航
        $this->assertSame('returning', $task->status);
        $this->assertSame(['SCOUT' => 3], (array) json_decode((string) $task->ships_json, true));
    }

    public function testOverwhelmingDefenseTriggersBattleProbesDieDebrisForms(): void
    {
        $originId = $this->planet(1, '1:1:1', ['SCOUT' => 3], 0, 100000);
        // 200 轻战 vs 3 探针：chance = floor(200×1/(3×4)×100)=1666 → 夹 100 必触发
        $this->planet(2, '1:1:2', ['LIGHT' => 200], 500, 0, ['SOLAR' => 3]);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create(withIntel: true);

        [$taskId, $visible, $task] = $this->dispatchAndArrive($rulesetId, 3, $originId);

        // 战斗发生：快照存在，攻方探针全灭
        $snap = DB::table('battle_snapshots')->where('battle_id', "counteresp-{$taskId}")->first();
        $this->assertNotNull($snap, '压倒性守舰必须触发反侦察战斗');
        $result = (array) json_decode((string) $snap->result_json, true);
        $this->assertSame(3, $result['attacker_losses']['SCOUT'] ?? 0);
        $this->assertSame(0, array_sum($result['attacker_survivors']));
        $this->assertTrue($visible['meta']['counter_esp_triggered']);
        $this->assertSame(100, $visible['meta']['counter_esp_chance']);

        // 残骸：3×SCOUT 成本 (1000M/1500C) × 0.30 = (900, 1350)
        $debris = $this->app->make(DebrisFieldService::class)->at(1, 1, 2);
        $this->assertNotNull($debris);
        $this->assertEqualsWithDelta(900.0, $debris['M'], 1e-6);
        $this->assertEqualsWithDelta(1350.0, $debris['C'], 1e-6);

        // 探针全灭：任务 done、槽位释放
        $this->assertSame('done', $task->status);
        $this->assertSame([], (array) json_decode((string) $task->ships_json, true));
        $this->assertSame(0, (int) DB::table('civilizations')->where('owner_id', 1)->value('mission_slots_used'));

        // 报告恒生成但揭示裁剪：剩余=0 → 仅资源可见（ships null）
        $this->assertNotNull($visible['resources']);
        $this->assertNull($visible['ships']);
        $this->assertSame(0, $visible['meta']['probes_survived']);
    }

    public function testDeterministicReplayProducesIdenticalSnapshots(): void
    {
        // 同库两次派遣（不同 command_id/task）：揭示内容必须逐字段一致（时间戳除外）。
        // 50 守舰 vs 2 探针 → 概率夹 100 必触发且探针全灭，母星须备 4 艘供两次派遣。
        $originId = $this->planet(1, '1:1:1', ['SCOUT' => 4], 0, 100000);
        $this->planet(2, '1:1:2', ['LIGHT' => 50], 123);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create(withIntel: true);

        $visible = [];
        foreach ([1, 2] as $run) {
            $cmd = new CommandEnvelope(
                commandId: sprintf('55555555-5555-4555-8555-%012d', $run),
                actorKind: 'player',
                actorId: 1,
                ownerId: 1,
                type: 'FLEET_DISPATCH',
                payload: ['planet_id' => $originId, 'mission' => 'scout',
                    'ships' => ['SCOUT' => 2], 'target' => '1:1:2', 'speed_pct' => 100],
            );
            $res = $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
            $this->app->make(FleetArrivalService::class)->arrive($res['task_id']);
            $intel = DB::table('intel_snapshots')
                ->where('source_command', $cmd->commandId)->first();
            $this->assertNotNull($intel);
            $v = (array) json_decode((string) $intel->visible_fields_json, true);
            unset($v['resources']);   // 生产结算随时间微增，不参与确定性比对
            $visible[$run] = $v;
        }
        $this->assertSame($visible[1], $visible[2], '同配置两次侦察的揭示内容必须逐字段一致');
    }
}
