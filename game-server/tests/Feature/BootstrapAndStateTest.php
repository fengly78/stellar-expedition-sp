<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Civilization;
use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 玩家引导 + 状态读面（2026-09-23 服务端可玩性闭环）：
 * bootstrap 创建文明+母星+初始库存台账（幂等拒绝重建）；state 只读投影原始字段。
 */
class BootstrapAndStateTest extends TestCase
{
    use RefreshDatabase;

    /** HTTP 鉴权默认强制——测试用固定明文令牌。 */
    private function authHeader(int $owner): array
    {
        DB::table('api_tokens')->updateOrInsert(
            ['owner_id' => $owner],
            ['token_hash' => hash('sha256', "test-token-{$owner}"), 'created_at' => now()],
        );
        return ['Authorization' => "Bearer test-token-{$owner}"];
    }

    public function testBootstrapCreatesCivPlanetAndLedger(): void
    {
        $rulesetId = TestRuleset::create();   // 台账/命令行 FK 需要 frozen 规则集
        $this->artisan('game:bootstrap-player', [
            'owner_id' => 7, '--m' => '500', '--c' => '500', '--d' => '0',
        ])->assertExitCode(0);

        $civ = Civilization::query()->where('owner_id', 7)->first();
        $this->assertNotNull($civ, '必须创建文明');
        $planet = Planet::query()->where('owner_id', 7)->first();
        $this->assertNotNull($planet, '必须创建母星');
        $this->assertTrue((bool) $planet->is_homeworld);
        // 经典自动选址：首个落点 = 环带 4-12 的 1:1:4，且已定温（coltab 分档）
        $this->assertSame(1, (int) $planet->galaxy);
        $this->assertSame(1, (int) $planet->system_pos);
        $this->assertSame(4, (int) $planet->orbit);
        $this->assertNotNull($planet->temp, '自动选址必须按 coltab 定温');
        $this->assertEqualsWithDelta(500.0, (float) $planet->inv_m, 1e-6);
        $this->assertEqualsWithDelta(500.0, (float) $planet->inv_c, 1e-6);
        $this->assertSame([], (array) ($planet->levels_json ?? []));
        $this->assertSame([], (array) ($planet->ships_json ?? []));

        // 引导系统命令行 + 初始库存台账（operation=init，M/C 两行；D=0 不记）
        $cmdRow = DB::table('game_commands')->where('type', 'BOOTSTRAP')->where('owner_id', 7)->first();
        $this->assertNotNull($cmdRow, '引导必须落系统命令行（台账 FK 归因）');
        $this->assertSame((int) $rulesetId, (int) $cmdRow->ruleset_id);
        $this->assertSame('committed', $cmdRow->status);
        $ops = DB::table('resource_transactions')
            ->where('command_id', $cmdRow->command_id)->where('operation', 'init')
            ->pluck('amount_signed', 'resource');
        $this->assertEqualsWithDelta(500.0, (float) ($ops['M'] ?? 0), 1e-6);
        $this->assertEqualsWithDelta(500.0, (float) ($ops['C'] ?? 0), 1e-6);
    }

    public function testBootstrapRejectsDuplicateOwnerAndTakenCoords(): void
    {
        TestRuleset::create();
        $this->artisan('game:bootstrap-player', ['owner_id' => 7])->assertExitCode(0);
        // 同 owner 重建拒绝
        $this->artisan('game:bootstrap-player', ['owner_id' => 7])->assertExitCode(1);
        // 显式选址撞上已占用坐标拒绝
        $this->artisan('game:bootstrap-player', [
            'owner_id' => 8, '--galaxy' => '1', '--system' => '1', '--orbit' => '4',
        ])->assertExitCode(1);
        // 换 owner 换址成功（显式）
        $this->artisan('game:bootstrap-player', [
            'owner_id' => 8, '--galaxy' => '1', '--system' => '1', '--orbit' => '5',
        ])->assertExitCode(0);
        $this->assertSame(2, Planet::query()->count());
        $this->assertSame(2, Civilization::query()->count());
    }

    public function testBootstrapRequiresFrozenRuleset(): void
    {
        // 无任何 frozen 规则集 → 拒绝（配置闸门纪律）
        $this->artisan('game:bootstrap-player', ['owner_id' => 7])->assertExitCode(1);
        $this->assertSame(0, Civilization::query()->count());
    }

    public function testStateEndpointProjectsRawFields(): void
    {
        TestRuleset::create(name: 'balance_rc1');   // state 返回最新 frozen balance_rc1 的 version 供客户端提交
        $this->artisan('game:bootstrap-player', ['owner_id' => 7])->assertExitCode(0);

        $resp = $this->getJson('/api/v1/state?owner_id=7', $this->authHeader(7));
        $resp->assertStatus(200);
        $body = $resp->json();
        $this->assertSame(7, $body['owner_id']);
        $this->assertSame('e2e', $body['ruleset_version'], 'state 必须携带客户端提交命令所需的 ruleset_version');
        $this->assertSame([], $body['civilization']['techs']);
        $this->assertCount(1, $body['planets']);
        $p = $body['planets'][0];
        $this->assertSame('1:1:4', $p['coords']);
        $this->assertNotNull($p['temp']);
        $this->assertTrue($p['is_homeworld']);
        $this->assertSame(500.0, (float) $p['inventory']['M']);
        $this->assertSame([], $p['ships']);
    }

    public function testStateEndpointValidationAndUnknownOwner(): void
    {
        // 缺 owner_id → 422（令牌已带但参数缺失，鉴权先过后校验参数）
        $this->getJson('/api/v1/state', $this->authHeader(7))->assertStatus(422);
        // 未知 owner（本人令牌 + 不存在的 owner → 404 归因前无越权问题：authOwner=7 ≠ 42 → 403；
        // 因此这里直接断言 403，404 只在免鉴权或本人查询时出现）
        $this->getJson('/api/v1/state?owner_id=42', $this->authHeader(7))->assertStatus(403);
    }

    public function testReportsEndpointListsOwnerBattles(): void
    {
        // 战报读面：按 owner 归因（经 game_commands），空态与有战态
        $rulesetId = TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 9])->assertExitCode(0);

        // 空态
        $this->getJson('/api/v1/reports?owner_id=9', $this->authHeader(9))
            ->assertStatus(200)
            ->assertJsonPath('count', 0);

        // 造一场带快照的战斗（直接插 battle_snapshots + 归因命令行）
        DB::table('game_commands')->insert([
            'command_id' => '99999999-9999-4999-8999-999999999999',
            'payload_hash' => str_repeat('a', 64),
            'actor_kind' => 'player', 'actor_id' => 9, 'owner_id' => 9,
            'type' => 'FLEET_DISPATCH',
            'payload_json' => '{}', 'ruleset_id' => $rulesetId,
            'status' => 'committed', 'attempt_count' => 1,
            'submitted_at' => now(), 'committed_at' => now(),
        ]);
        DB::table('battle_snapshots')->insert([
            'battle_id' => 'battle-qa', 'command_id' => '99999999-9999-4999-8999-999999999999',
            'ruleset_id' => $rulesetId, 'engine_version' => 'rust-classic-ffi-spec-v0.1',
            'seed' => 1, 'participants_json' => '{}', 'rounds_json' => '[]', 'result_json' => '{}',
            'snapshot_at' => now(), 'settled_at' => now(), 'snapshot_version' => 1,
        ]);

        $resp = $this->getJson('/api/v1/reports?owner_id=9', $this->authHeader(9));
        $resp->assertStatus(200)->assertJsonPath('count', 1);
        $this->assertSame('battle-qa', $resp->json('battles.0.battle_id'));

        // 缺 owner_id → 422
        $this->getJson('/api/v1/reports', $this->authHeader(9))->assertStatus(422);
    }
}
