<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Combat\CombatResolveService;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Production\ProductionService;
use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameRuleset;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 多人对抗试玩暴露的服务端缺陷修复回归（2026-09-29）。
 *
 * 背景：派三个子智能体分饰 ALPHA/BRAVO/DELTA 在真实服务端上真打了三场对抗，
 * 三路独立取证报出 12 条缺陷。本文件锁住其中的**可机检**部分。
 * 每条都做过变异验证（改回缺陷形态 → 确认本文件转红 → 还原 → 确认绿）。
 */
class MultiplayerPlaytestRegressionsTest extends TestCase
{
    use RefreshDatabase;

    // ---------- 工具 ----------

    /** HTTP 鉴权默认强制——测试用固定明文令牌（与既有测试同口径）。 */
    private function authHeader(int $ownerId): array
    {
        DB::table('api_tokens')->updateOrInsert(
            ['owner_id' => $ownerId],
            ['token_hash' => hash('sha256', 'test-token-'.$ownerId), 'created_at' => now()],
        );

        return ['Authorization' => 'Bearer test-token-'.$ownerId];
    }

    private function postCmd(string $path, array $body, int $ownerId, array $headers = [])
    {
        return $this->postJson($path, $body, $headers + $this->authHeader($ownerId));
    }

    /** @return array{status:string,body:array} */
    private function cmd(int $ownerId, string $type, array $payload): array
    {
        $resp = $this->postCmd('/api/v1/commands', [
            'command_id' => $this->uuid(),
            'actor' => ['kind' => 'player', 'actor_id' => $ownerId],
            'owner_id' => $ownerId,
            'type' => $type,
            'payload' => $payload,
            'ruleset_version' => 'e2e',
        ], $ownerId);
        $body = $resp->json();

        return [$resp->getStatusCode(), is_array($body) ? $body : []];
    }

    private function uuid(): string
    {
        $d = bin2hex(random_bytes(16));
        $s = substr($d, 0, 8).'-'.substr($d, 8, 4).'-4'.substr($d, 13, 3).'-a'.substr($d, 17, 3).'-'.substr($d, 20);

        return $s;
    }

    private function planetOf(int $ownerId): Planet
    {
        return Planet::query()->where('owner_id', $ownerId)->firstOrFail();
    }

    private function grant(int $ownerId, float $m, float $c, float $d): void
    {
        $p = $this->planetOf($ownerId);
        $p->inv_m = $m; $p->inv_c = $c; $p->inv_d = $d;
        $p->save();
    }

    // ---------- 1. 被袭方战报失明 ----------

    /**
     * 战报读面原先按 `game_commands.owner_id`（发起方）过滤，
     * 而 command_id 属于**发起方**的命令 → 被攻击方永远查不到自己的战报。
     * 实测：被突袭方 GET /reports 恒为 count:0。
     */
    public function testDefenderCanSeeOwnBattleReport(): void
    {
        $rulesetId = TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $this->artisan('game:bootstrap-player', ['owner_id' => 2])->assertExitCode(0);
        $defPlanet = $this->planetOf(2);

        DB::table('game_commands')->insert([
            'command_id' => $this->uuid(), 'payload_hash' => str_repeat('a', 64),
            'actor_kind' => 'player', 'actor_id' => 1, 'owner_id' => 1,
            'type' => 'FLEET_DISPATCH', 'payload_json' => '{}', 'ruleset_id' => $rulesetId,
            'status' => 'committed', 'attempt_count' => 1,
            'submitted_at' => now(), 'committed_at' => now(),
        ]);
        $cmdId = DB::table('game_commands')->orderByDesc('id')->value('command_id');
        $battleId = 'battle-defender-visibility';
        DB::table('battle_snapshots')->insert([
            'battle_id' => $battleId, 'command_id' => $cmdId, 'ruleset_id' => $rulesetId,
            'engine_version' => 'rust-classic-ffi-spec-v0.1', 'seed' => 1,
            'participants_json' => json_encode([
                'attacker_fleets' => [['fleet_mission_id' => 'x', 'owner_id' => 1, 'units' => []]],
                'defender_fleets' => [['fleet_mission_id' => (string) $defPlanet->id, 'owner_id' => 2, 'units' => []]],
            ]),
            'rounds_json' => '[]',
            'result_json' => json_encode(['loot' => ['M' => 1.0, 'C' => 2.0, 'D' => 0.0]]),
            'snapshot_at' => now(), 'settled_at' => now(), 'snapshot_version' => 1,
        ]);

        // 守方：修复前恒为 0
        $resp = $this->getJson('/api/v1/reports?owner_id=2', $this->authHeader(2));
        $resp->assertStatus(200);
        self::assertSame(1, $resp->json('count'), '被攻击方必须能查到自己的战报');
        self::assertSame($battleId, $resp->json('battles.0.battle_id'));
        self::assertSame('defender', $resp->json('battles.0.perspective'), '必须标出这是防守方视角');

        // 攻方：同一场战斗也要能查到，且视角标为 attacker
        $resp2 = $this->getJson('/api/v1/reports?owner_id=1', $this->authHeader(1));
        self::assertSame(1, $resp2->json('count'));
        self::assertSame('attacker', $resp2->json('battles.0.perspective'));

        // 无关的第三方不该看到
        $this->artisan('game:bootstrap-player', ['owner_id' => 3])->assertExitCode(0);
        $resp3 = $this->getJson('/api/v1/reports?owner_id=3', $this->authHeader(3));
        self::assertSame(0, $resp3->json('count'), '第三方不得看到与自己无关的战斗');
    }

    /** 战报须能区分普通战斗与反侦察交战（原先两者混列且无字段）。 */
    public function testReportsDistinguishCounterespionage(): void
    {
        $rulesetId = TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $this->artisan('game:bootstrap-player', ['owner_id' => 2])->assertExitCode(0);

        foreach ([['battle-x', 'battle'], ['counteresp-x', 'counterespionage']] as [$bid, $want]) {
            DB::table('game_commands')->insert([
                'command_id' => $this->uuid(), 'payload_hash' => str_repeat('a', 64),
                'actor_kind' => 'player', 'actor_id' => 1, 'owner_id' => 1,
                'type' => 'FLEET_DISPATCH', 'payload_json' => '{}', 'ruleset_id' => $rulesetId,
                'status' => 'committed', 'attempt_count' => 1,
                'submitted_at' => now(), 'committed_at' => now(),
            ]);
            $cmdId = DB::table('game_commands')->orderByDesc('id')->value('command_id');
            DB::table('battle_snapshots')->insert([
                'battle_id' => $bid, 'command_id' => $cmdId, 'ruleset_id' => $rulesetId,
                'engine_version' => 'rust-classic-ffi-spec-v0.1', 'seed' => 1,
                'participants_json' => json_encode([
                    'attacker_fleets' => [['owner_id' => 1, 'units' => []]],
                    'defender_fleets' => [['owner_id' => 2, 'units' => []]],
                ]),
                'rounds_json' => '[]', 'result_json' => '{}',
                'snapshot_at' => now(), 'settled_at' => now(), 'snapshot_version' => 1,
            ]);
        }

        $resp = $this->getJson('/api/v1/reports?owner_id=1', $this->authHeader(1));
        $kinds = array_column($resp->json('battles'), 'kind');
        sort($kinds);
        self::assertSame(['battle', 'counterespionage'], $kinds);
    }

    /** participants_json 为空的历史数据不得因修归属而消失（归因回退）。 */
    public function testLegacySnapshotWithoutParticipantsStillVisibleToCommandOwner(): void
    {
        $rulesetId = TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 9])->assertExitCode(0);
        DB::table('game_commands')->insert([
            'command_id' => $this->uuid(), 'payload_hash' => str_repeat('a', 64),
            'actor_kind' => 'player', 'actor_id' => 9, 'owner_id' => 9,
            'type' => 'FLEET_DISPATCH', 'payload_json' => '{}', 'ruleset_id' => $rulesetId,
            'status' => 'committed', 'attempt_count' => 1,
            'submitted_at' => now(), 'committed_at' => now(),
        ]);
        $cmdId = DB::table('game_commands')->orderByDesc('id')->value('command_id');
        DB::table('battle_snapshots')->insert([
            'battle_id' => 'battle-legacy', 'command_id' => $cmdId, 'ruleset_id' => $rulesetId,
            'engine_version' => 'rust-classic-ffi-spec-v0.1', 'seed' => 1,
            'participants_json' => '{}', 'rounds_json' => '[]', 'result_json' => '{}',
            'snapshot_at' => now(), 'settled_at' => now(), 'snapshot_version' => 1,
        ]);

        $resp = $this->getJson('/api/v1/reports?owner_id=9', $this->authHeader(9));
        self::assertSame(1, $resp->json('count'), 'participants 为空的历史战报不得消失');
    }

    // ---------- 2. 建造队列死锁 ----------

    /** 不存在的建筑 id 必须在**入队**就被拒，而不是 200 入队后到 START 才炸。 */
    public function testEnqueueRejectsUnknownBuildingId(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $this->grant(1, 100000, 100000, 100000);

        [$code, $body] = $this->cmd(1, 'BUILD_ENQUEUE', [
            'planet_id' => $p->id, 'building' => 'metal_mine',
        ]);
        self::assertSame(409, $code, '未知建筑必须在入队处即拒绝');
        self::assertStringContainsString('未知建筑', (string) ($body['reason'] ?? ''));
        self::assertSame([], $p->fresh()->queue_building, '被拒的入队不得落库');
    }

    /** 同名重复入队会占满槽位，配合队列不可取消即可毁掉星球——必须直接拒。 */
    public function testEnqueueRejectsDuplicateBuilding(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $this->grant(1, 100000, 100000, 100000);

        self::assertSame(200, $this->cmd(1, 'BUILD_ENQUEUE', [
            'planet_id' => $p->id, 'building' => 'METAL_MINE',
        ])[0]);

        [$code, $body] = $this->cmd(1, 'BUILD_ENQUEUE', [
            'planet_id' => $p->id, 'building' => 'METAL_MINE',
        ]);
        self::assertSame(409, $code, '同名重复入队必须拒绝');
        self::assertStringContainsString('已有待建', (string) ($body['reason'] ?? ''));
        self::assertCount(1, $p->fresh()->queue_building);
    }

    /** 队首付不起时，START 必须能跳过它去启动后面付得起的项（这是死锁的解法）。 */
    public function testBuildStartSkipsUnaffordableQueueHead(): void
    {
        // 造一个带 BUILD.TIME 的规则集（测试规则集默认没有该键，START 会在算时长时 fail-closed）
        // 名字必须是 balance_rc1——CommandController 按 ruleset_name+version 解析，
        // 用默认的 test_synthetic 会得到 422「未知规则集版本：e2e」。
        TestRuleset::create(name: 'balance_rc1', patches: [
            'BUILD.TIME' => ['model' => 'upstream', 'constant' => 2500, 'universe_speed' => 288, 't_min_seconds' => 2, 'robotics_level_R' => 0, 'nanite_level_N' => 0],
        ]);
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        // 队列塞两项：DEUT_SYNTH L1 造价 225M/75C（付不起），CRYSTAL_MINE L1 只需 48M/24C。
        // 只给够 CRYSTAL_MINE 的钱 → 队首付不起，正是 DELTA 遇到的死锁形态。
        $this->grant(1, 100, 100, 0);
        $p->queue_building = [
            ['building' => 'DEUT_SYNTH', 'queued_by' => 'x'],
            ['building' => 'CRYSTAL_MINE', 'queued_by' => 'y'],
        ];
        $p->save();

        [$code, $body] = $this->cmd(1, 'BUILD_START', ['planet_id' => $p->id]);

        self::assertSame(200, $code, '必须能跳过付不起的队首启动后面那项：'.json_encode($body, JSON_UNESCAPED_UNICODE));
        self::assertSame('CRYSTAL_MINE', $body['result']['building'] ?? null);
        // 付不起的队首**留在队列里**（等钱够了自然轮到），不是被丢掉
        $after = $p->fresh()->queue_building;
        self::assertCount(1, $after);
        self::assertSame('DEUT_SYNTH', $after[0]['building'], '付不起的项应保留在队列中');
    }

    /** BUILD_CANCEL：死锁必须可自救。 */
    public function testBuildCancelRemovesStuckQueueHead(): void
    {
        // 名字必须是 balance_rc1——CommandController 按 ruleset_name+version 解析，
        // 用默认的 test_synthetic 会得到 422「未知规则集版本：e2e」。
        TestRuleset::create(name: 'balance_rc1', patches: [
            'BUILD.TIME' => ['model' => 'upstream', 'constant' => 2500, 'universe_speed' => 288, 't_min_seconds' => 2, 'robotics_level_R' => 0, 'nanite_level_N' => 0],
        ]);
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $this->grant(1, 1, 1, 0);
        $p->queue_building = [
            ['building' => 'DEUT_SYNTH', 'queued_by' => 'x'],
            ['building' => 'SOLAR', 'queued_by' => 'y'],
        ];
        $p->save();

        [$code, $body] = $this->cmd(1, 'BUILD_CANCEL', ['planet_id' => $p->id, 'index' => 0]);
        self::assertSame(200, $code, 'BUILD_CANCEL 必须可用：'.json_encode($body, JSON_UNESCAPED_UNICODE));
        self::assertSame(1, $body['result']['queue_depth'] ?? null);

        $after = $p->fresh()->queue_building;
        self::assertCount(1, $after);
        self::assertSame('SOLAR', $after[0]['building'], '取消队首后应剩下第二项');
        // 关键：取消后队列必须重排为连续键。unset 会留下 {1:...} 这样的稀疏数组，
        // 后续 array_shift / count 在 JSON 往返后会错位。
        self::assertSame([0], array_keys($after), '队列必须重排为连续数组（不能留稀疏键）');

        // 死锁解除：现在能正常建造了
        $this->grant(1, 100000, 100000, 100000);
        [$c2, $b2] = $this->cmd(1, 'BUILD_START', ['planet_id' => $p->id]);
        self::assertSame(200, $c2, '取消死锁项后应能正常开工：'.json_encode($b2, JSON_UNESCAPED_UNICODE));
    }

    public function testBuildCancelRejectsOutOfRangeIndex(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);

        [$code] = $this->cmd(1, 'BUILD_CANCEL', ['planet_id' => $p->id, 'index' => 99]);
        self::assertSame(409, $code);
    }

    // ---------- 3. 产出未接入 worker（阻断级） ----------

    /**
     * 实测：闲置 25 秒 M/C/D 增量**精确为 0.000**，`production_checkpoint_at` 滞后 8 小时。
     * 根因是 settle() 只被 5 个 Command Handler 顺带调用，四个 worker 一个都不调。
     */
    public function testProductionWorkerAdvancesIdlePlanets(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $p->levels_json = ['METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5];
        // 库存压到远低于仓容，排除「仓容封顶导致产出为 0」这个混淆因素
        $p->inv_m = 0; $p->inv_c = 0; $p->inv_d = 0;
        $p->production_checkpoint_at = now()->subHours(2);
        $p->save();

        $before = ['M' => (float) $p->inv_m, 'C' => (float) $p->inv_c, 'D' => (float) $p->inv_d];
        $this->artisan('game:process-production')->assertExitCode(0);
        $after = $p->fresh();

        self::assertGreaterThan(
            $before['M'] + $before['C'],
            (float) $after->inv_m + (float) $after->inv_c,
            '闲置星球经 worker 推进后必须有产出（修复前恒为 0）',
        );
    }

    public function testProductionWorkerReachesPlanetsAfterFirstBatch(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $template = (array) DB::table('planets')->first();
        unset($template['id']);
        $template['is_homeworld'] = false;
        $template['production_checkpoint_at'] = now();
        $rows = [];
        for ($system = 2; $system <= 2000; $system++) {
            $rows[] = $template + [];
            $rows[array_key_last($rows)]['system_pos'] = $system;
            if (count($rows) === 100) {
                DB::table('planets')->insert($rows);
                $rows = [];
            }
        }
        if ($rows !== []) DB::table('planets')->insert($rows);

        $template['system_pos'] = 2001;
        $template['levels_json'] = json_encode([
            'METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5,
        ]);
        $template['inv_m'] = 0;
        $template['production_checkpoint_at'] = now()->subHour();
        $lastId = DB::table('planets')->insertGetId($template);

        $this->artisan('game:process-production')->assertExitCode(0);
        self::assertGreaterThan(0, (float) DB::table('planets')->where('id', $lastId)->value('inv_m'));
    }

    /**
     * worker 幂等：检查点水位必须生效。
     *
     * 注意不能断言两次结果**完全相等**——两次 artisan 调用之间真实墙钟仍在走，
     * 第二次必然还会结算那几毫秒。正确口径是：第二次的增量相对于第一次可忽略
     * （若水位没生效，第二次会再来一遍 2 小时的产出，增量与第一次同量级）。
     */
    public function testProductionWorkerIsIdempotent(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $p->levels_json = ['METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5];
        $p->inv_m = 0; $p->inv_c = 0; $p->inv_d = 0;
        $p->production_checkpoint_at = now()->subHours(2);
        $p->save();

        $start = (float) $p->fresh()->inv_m;
        $this->artisan('game:process-production')->assertExitCode(0);
        $afterFirst = (float) $p->fresh()->inv_m;
        $firstGain = $afterFirst - $start;

        $this->artisan('game:process-production')->assertExitCode(0);
        $afterSecond = (float) $p->fresh()->inv_m;
        $secondGain = $afterSecond - $afterFirst;

        self::assertGreaterThan(0.0, $firstGain, '第一次调用必须有产出（否则本用例无鉴别力）');
        self::assertLessThan(
            $firstGain * 0.01,
            $secondGain,
            sprintf(
                '第二次调用又结算了一整段（+%0.2f，与第一次 +%0.2f 同量级）——检查点水位未生效，会重复入账',
                $secondGain, $firstGain,
            ),
        );
    }

    /** 产出必须进账本，否则账实永远对不上（实测 ALPHA 少 88.92 金属）。 */
    public function testProductionWorkerWritesLedgerRows(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $p->levels_json = ['METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5];
        $p->inv_m = 0; $p->inv_c = 0; $p->inv_d = 0;
        $p->production_checkpoint_at = now()->subHours(2);
        $p->save();

        $this->artisan('game:process-production')->assertExitCode(0);

        $n = DB::table('resource_transactions')
            ->where('owner_id', 1)->where('operation', 'production')->count();
        self::assertGreaterThan(0, $n, '产出必须写 resource_transactions 流水');
    }

    public function testCommandPresettleProductionWritesLedgerRows(): void
    {
        TestRuleset::create(name: 'balance_rc1', patches: [
            'BUILD.TIME' => ['model' => 'upstream', 'constant' => 2500, 'universe_speed' => 1,
                't_min_seconds' => 30, 'robotics_level_R' => 0, 'nanite_level_N' => 0],
        ]);
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $p->levels_json = ['METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5];
        $p->inv_m = 1000; $p->inv_c = 1000; $p->inv_d = 1000;
        $p->queue_building = [['building' => 'METAL_MINE', 'queued_by' => 'test']];
        $p->production_checkpoint_at = now()->subHours(2);
        $p->save();

        $beforeInventory = (float) $p->inv_m;
        $beforeLedger = (float) DB::table('resource_transactions')
            ->where('owner_id', 1)->where('resource', 'M')->sum('amount_signed');

        [$status, $body] = $this->cmd(1, 'BUILD_START', ['planet_id' => $p->id]);
        self::assertSame(200, $status, json_encode($body, JSON_UNESCAPED_UNICODE));

        $inventoryDelta = (float) $p->fresh()->inv_m - $beforeInventory;
        $ledgerDelta = (float) DB::table('resource_transactions')
            ->where('owner_id', 1)->where('resource', 'M')->sum('amount_signed') - $beforeLedger;
        self::assertEqualsWithDelta($inventoryDelta, $ledgerDelta, 1e-4);
        self::assertGreaterThan(0, DB::table('resource_transactions')
            ->where('owner_id', 1)->where('operation', 'production')->count());
    }

    /**
     * 账实相符：**逐 owner 逐资源**比对，且比对的是「worker 运行前后的增量」。
     *
     * 这条锁的是本轮踩到的**第五种门禁假绿**——全局求和相等 ≠ 逐主体相符。
     * 用增量而非绝对值：测试夹具会直接改 inv（那是不记账的），绝对值必然对不上，
     * 但「worker 干了多少、账本记了多少」必须分毫不差。
     */
    public function testProductionWorkerLedgerDeltaMatchesInventoryDelta(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $p->levels_json = ['METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5];
        $p->inv_m = 0; $p->inv_c = 0; $p->inv_d = 0;
        $p->production_checkpoint_at = now()->subHours(2);
        $p->save();

        $ledgerBefore = [];
        foreach (['M' => 'inv_m', 'C' => 'inv_c', 'D' => 'inv_d'] as $res => $col) {
            $ledgerBefore[$res] = (float) DB::table('resource_transactions')
                ->where('owner_id', 1)->where('resource', $res)->sum('amount_signed');
        }
        $invBefore = ['M' => (float) $p->inv_m, 'C' => (float) $p->inv_c, 'D' => (float) $p->inv_d];

        $this->artisan('game:process-production')->assertExitCode(0);

        $p->refresh();
        foreach (['M' => 'inv_m', 'C' => 'inv_c', 'D' => 'inv_d'] as $res => $col) {
            $ledgerAfter = (float) DB::table('resource_transactions')
                ->where('owner_id', 1)->where('resource', $res)->sum('amount_signed');
            $invAfter = (float) $p->$col;
            $ledgerDelta = $ledgerAfter - $ledgerBefore[$res];
            $invDelta = $invAfter - $invBefore[$res];
            self::assertGreaterThan(0.0, $invDelta, "{$res} 夹具有问题：worker 应有产出");
            self::assertEqualsWithDelta(
                $invDelta, $ledgerDelta, 1e-6,
                "{$res} 产出未入账：库存 +{$invDelta} 但账本 +{$ledgerDelta}（逐主体比对，不能只比总量）",
            );
        }
    }

    // ---------- 4. 幂等重放返回体自相矛盾 ----------

    /**
     * 修复前：重放一个被拒命令得到 `{"status":"committed","result":{"status":"rejected"}}`，
     * 与同一 id 的 GET /commands/{id}（rejected）对不上。ALPHA 与 BRAVO 各自独立复现。
     */
    public function testReplayingRejectedCommandReturnsConsistentRejection(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);

        $cid = $this->uuid();
        // 未知命令类型 → 409 并落 REJECTED 审计行
        $first = $this->postCmd('/api/v1/commands', [
            'command_id' => $cid,
            'actor' => ['kind' => 'player', 'actor_id' => 1],
            'owner_id' => 1, 'type' => 'BUILD_CANCEL',
            'payload' => ['planet_id' => $p->id],
            'ruleset_version' => 'e2e',
        ], 1);
        self::assertSame(409, $first->getStatusCode());

        // 同一 command_id 重放：必须仍是 409 + rejected，不得变成 committed
        $replay = $this->postCmd('/api/v1/commands', [
            'command_id' => $cid,
            'actor' => ['kind' => 'player', 'actor_id' => 1],
            'owner_id' => 1, 'type' => 'BUILD_CANCEL',
            'payload' => ['planet_id' => $p->id],
            'ruleset_version' => 'e2e',
        ], 1);
        self::assertSame(409, $replay->getStatusCode(), '重放被拒命令必须仍是 409');
        self::assertSame('rejected', $replay->json('status'), '重放不得报 committed');

        // 与读面口径一致
        $show = $this->getJson('/api/v1/commands/'.$cid, $this->authHeader(1));
        self::assertSame('rejected', $show->json('status'), '重放口径必须与 GET 读面一致');
    }

    // ---------- 5. 掠夺双边记账 + 被袭通知 ----------

    private function dllReady(): bool
    {
        return is_file((string) config('services.combat.library_path'));
    }

    private function mkPlanet(int $owner, string $coords, array $ships, float $invM = 0.0, float $invC = 0.0, float $invD = 0.0): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g; $p->system_pos = $s; $p->orbit = $o;
        $p->is_homeworld = true;
        $p->inv_m = $invM; $p->inv_c = $invC; $p->inv_d = $invD;
        $p->levels_json = ['SOLAR' => 1];
        $p->ships_json = $ships;
        $p->queue_building = [];
        $p->production_checkpoint_at = now();
        $p->version = 0;
        $p->save();

        return (int) $p->id;
    }

    private function mkCiv(int $owner, array $techs = []): void
    {
        $c = new \App\Models\Civilization();
        $c->owner_id = $owner;
        $c->techs_json = $techs;
        $c->mission_slots_used = 0;
        $c->version = 0;
        $c->save();
    }

    /** 真跑一次 raid（dispatch → arrive），返回 defender 的 planet id 与 attacker owner。 */
    private function runRaid(int $attackerPlanet, int $attackerOwner, string $targetCoords, array $defShips): int
    {
        $rulesetId = TestRuleset::create();
        $cmd = new \App\Domain\Command\CommandEnvelope(
            commandId: $this->uuid(),
            actorKind: 'player', actorId: $attackerOwner, ownerId: $attackerOwner,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $attackerPlanet, 'mission' => 'raid',
                'ships' => ['LIGHT' => 10], 'target' => $targetCoords, 'speed_pct' => 100],
        );
        $res = $this->app->make(\App\Domain\Command\GameCommandBus::class)->dispatch($cmd, $rulesetId);
        $this->app->make(\App\Domain\Fleet\FleetArrivalService::class)->arrive($res['task_id']);

        return (int) $rulesetId;
    }

    /**
     * 掠夺必须**双边记账**：攻方入账为正、守方出账为负。
     * 修复前只记攻方一条、且盖上守方 planet_id（BRAVO 与 DELTA 各自独立发现）。
     */
    public function testPlunderIsRecordedOnBothSides(): void
    {
        if (! $this->dllReady()) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->mkPlanet(1, '1:1:1', ['LIGHT' => 10], 0, 0, 1000000);
        $defId = $this->mkPlanet(2, '1:1:2', ['LIGHT' => 5], 100000, 100000, 0);
        $this->mkCiv(1);
        $this->mkCiv(2);
        $this->runRaid($originId, 1, '1:1:2', ['LIGHT' => 5]);

        $rows = DB::table('resource_transactions')->where('operation', 'plunder')->get();
        self::assertGreaterThan(0, $rows->count(), '掠夺必须入账');

        $attacker = $rows->filter(fn ($r) => (int) $r->owner_id === 1);
        $defender = $rows->filter(fn ($r) => (int) $r->owner_id === 2);
        self::assertGreaterThan(0, $attacker->count(), '攻方必须有正向入账');
        self::assertGreaterThan(0, $defender->count(), '守方必须有出账（修复前完全没有）');
        foreach ($defender as $r) {
            self::assertLessThan(
                0.0, (float) $r->amount_signed,
                '守方掠夺流水必须为负（正=入负=出，防守方是被抢的一方）',
            );
            self::assertSame($defId, (int) $r->planet_id, '守方流水的 planet 必须是被抢那颗');
        }
        // 两边金额必须严格相反
        $sumAttacker = 0.0;
        foreach ($attacker as $r) { $sumAttacker += (float) $r->amount_signed; }
        $sumDefender = 0.0;
        foreach ($defender as $r) { $sumDefender += (float) $r->amount_signed; }
        self::assertEqualsWithDelta($sumAttacker, -$sumDefender, 1e-6, '攻方入账与守方出账必须等额反向');
    }

    /**
     * 被袭方必须收到入站通知。
     * 修复前 announcements 空 / game_outbox 0 行 / state.announcement=null，
     * 玩家只能靠轮询 state 做 diff 才察觉被打（三名 agent 独立确认）。
     */
    public function testRaidWritesInboundNotificationForDefender(): void
    {
        if (! $this->dllReady()) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->mkPlanet(1, '1:1:1', ['LIGHT' => 10], 0, 0, 1000000);
        $this->mkPlanet(2, '1:1:2', ['LIGHT' => 5], 100000, 100000, 0);
        $this->mkCiv(1);
        $this->mkCiv(2);
        $this->runRaid($originId, 1, '1:1:2', ['LIGHT' => 5]);

        $ev = DB::table('game_outbox')->where('event_type', 'player.raid_inbound')->get();
        self::assertGreaterThan(0, $ev->count(), '被袭方必须收到入站事件（修复前 game_outbox 恒为 0 行）');
        $payload = json_decode((string) $ev->first()->payload_json, true);
        self::assertSame(2, (int) $payload['owner_id'], '事件的归属方是被袭者');
        self::assertSame(1, (int) $payload['attacker_owner_id'], '必须指明是谁打的');
        self::assertNotEmpty((string) $payload['battle_id'], '必须带上 battle_id 供回查战报');
        self::assertSame('1:1:2', $payload['target_coords'] ?? null);
        // 通知里的损失必须与账本守方出账一致
        self::assertLessThanOrEqual(0.0, (float) $payload['loss']['M'], '损失必须为负或零');
    }

    /** 通知事件的 command_id 必须满足外键（曾误用 battle_id 导致 5 个 raid 测试全挂）。 */
    public function testInboundNotificationCommandIdRespectsForeignKey(): void
    {
        if (! $this->dllReady()) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->mkPlanet(1, '1:1:1', ['LIGHT' => 10], 0, 0, 1000000);
        $this->mkPlanet(2, '1:1:2', ['LIGHT' => 5], 100000, 100000, 0);
        $this->mkCiv(1);
        $this->mkCiv(2);
        $this->runRaid($originId, 1, '1:1:2', ['LIGHT' => 5]);

        foreach (DB::table('game_outbox')->get() as $e) {
            $exists = DB::table('game_commands')->where('command_id', $e->command_id)->exists();
            self::assertTrue($exists, "game_outbox.command_id={$e->command_id} 必须存在于 game_commands（外键约束）");
        }
    }

    // ---------- 7. API 一律 JSON + 中文校验文案 ----------

    /**
     * 修复前：客户端不带 `Accept: application/json` 时，Laravel 走 HTML 错误渲染路径，
     * 而该路径要读写 session（`sessions` 表当时不存在）→ 本该 422 变成 **500 + 完整调试页**。
     * 叠加 APP_DEBUG=true，堆栈直接吐给客户端。
     */
    public function testApiAlwaysAnswersJsonEvenWithoutAcceptHeader(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);

        $resp = $this->post('/api/v1/commands', [
            'command_id' => 'not-a-uuid',
            'actor' => ['kind' => 'player', 'actor_id' => 1],
            'owner_id' => 1, 'type' => 'BUILD_START', 'payload' => ['planet_id' => 1],
            'ruleset_version' => 'e2e',
        ], $this->authHeader(1), ['Accept' => 'text/html']);

        $resp->assertStatus(422);
        self::assertStringContainsString(
            'application/json',
            (string) $resp->headers->get('Content-Type'),
            '即便客户端要 HTML，API 也必须以 JSON 应答（否则走错误渲染路径会 500）',
        );
        self::assertStringNotContainsString('<html', strtolower($resp->getContent()));
    }

    /** 校验文案必须是中文（ALPHA 试玩报「422 吐 Laravel 默认英文」）。 */
    public function testValidationMessagesAreInChinese(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);

        $resp = $this->postCmd('/api/v1/commands', [
            'command_id' => 'not-a-uuid',
            'actor' => ['kind' => 'player', 'actor_id' => 1],
            'owner_id' => 1, 'type' => 'BUILD_START', 'payload' => ['planet_id' => 1],
            'ruleset_version' => 'e2e',
        ], 1);

        $resp->assertStatus(422);
        $msg = (string) $resp->json('errors.command_id.0');
        self::assertNotSame('', $msg);
        self::assertDoesNotMatchRegularExpression('/^[\x20-\x7E]+$/', $msg, '校验文案不得是纯 ASCII（应为中文）：' . $msg);
        self::assertStringContainsString('UUID', $msg, '文案应保留可识别的技术词');
    }

    /** 缺 owner_id 这类形状错误也要是中文，而不是英文默认串。 */
    public function testMissingOwnerIdMessageIsChinese(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);

        $resp = $this->postCmd('/api/v1/commands', [
            'command_id' => '11111111-1111-4111-8111-111111111111',
            'actor' => ['kind' => 'player', 'actor_id' => 1],
            'type' => 'BUILD_START', 'payload' => ['planet_id' => 1],
            'ruleset_version' => 'e2e',
        ], 1);

        $resp->assertStatus(422);
        $msg = (string) $resp->json('errors.owner_id.0');
        self::assertDoesNotMatchRegularExpression('/^[\x20-\x7E]+$/', $msg, '应为中文：' . $msg);
    }

    // ---------- 6. 产出 worker 的时钟回拨防御 ----------
    /**
     * 检查点落在**未来**时（时钟回拨 / 导入了他机存档）不得把水位推回去，
     * 否则后续每次调用都会反复结算同一段时间。
     */
    public function testProductionWorkerIgnoresFutureCheckpoint(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 1])->assertExitCode(0);
        $p = $this->planetOf(1);
        $p->levels_json = ['METAL_MINE' => 5, 'CRYSTAL_MINE' => 5, 'DEUT_SYNTH' => 5, 'SOLAR' => 5];
        $p->inv_m = 0; $p->inv_c = 0; $p->inv_d = 0;
        $future = now()->addHours(5);
        $p->production_checkpoint_at = $future;
        $p->save();

        $this->artisan('game:process-production')->assertExitCode(0);

        $after = $p->fresh();
        self::assertEqualsWithDelta(
            0.0, (float) $after->inv_m + (float) $after->inv_c + (float) $after->inv_d, 1e-9,
            '检查点在未来时不得结算（否则会把水位推回去并反复入账）',
        );
        self::assertTrue(
            $after->production_checkpoint_at > now(),
            '检查点不得被回拨',
        );
    }
}
