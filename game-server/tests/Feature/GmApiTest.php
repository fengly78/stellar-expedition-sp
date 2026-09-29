<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * G10 GM 后台 HTTP 面：X-GM-Key fail-closed（未配置即 403）/ 错钥 403 /
 * grant 与 level 入账审计 / ban → 玩家面 403 带原因 / announce → state 投影 / audit 列表。
 */
class GmApiTest extends TestCase
{
    use RefreshDatabase;

    private function seedOwner(int $owner): int
    {
        if (TestRuleset::exists('balance_rc1') === false) {
            TestRuleset::create(name: 'balance_rc1');
        }
        $this->artisan('game:bootstrap-player', ['owner_id' => $owner])->assertExitCode(0);
        // players 行（G1 注册才写；GM 后台列表/封禁以它为源）
        DB::table('players')->updateOrInsert(
            ['owner_id' => $owner],
            ['name' => "Commander{$owner}", 'created_at' => now()],
        );

        return (int) DB::table('planets')->where('owner_id', $owner)->where('is_homeworld', true)->value('id');
    }

    private function tokenFor(int $owner, string $plain): void
    {
        DB::table('api_tokens')->updateOrInsert(
            ['owner_id' => $owner],
            ['token_hash' => hash('sha256', $plain), 'created_at' => now()],
        );
    }

    public function testFailClosedWhenGmKeyNotConfigured(): void
    {
        config(['services.game.gm_key' => null]);
        $this->getJson('/api/v1/gm/players', ['X-GM-Key' => 'whatever'])->assertStatus(403);
    }

    public function testWrongKeyRejected(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $this->getJson('/api/v1/gm/players', ['X-GM-Key' => 'wrong'])->assertStatus(403);
        $this->getJson('/api/v1/gm/players')->assertStatus(403);
    }

    public function testGrantAddsInventoryAndAudits(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $this->seedOwner(7);

        $this->postJson('/api/v1/gm/grant', ['owner_id' => 7, 'M' => 1000, 'D' => 50], ['X-GM-Key' => 'secret-key'])
            ->assertStatus(200)
            ->assertJsonPath('ok', true);

        $p = DB::table('planets')->where('owner_id', 7)->where('is_homeworld', true)->first();
        $this->assertEqualsWithDelta(1500.0, (float) $p->inv_m, 1e-6);
        $this->assertEqualsWithDelta(50.0, (float) $p->inv_d, 1e-6);

        $row = DB::table('game_commands')->where('type', 'GM_RESOURCES')->first();
        $this->assertNotNull($row);
        $this->assertSame('player', $row->actor_kind);
        $this->assertTrue(DB::table('resource_transactions')->where('operation', 'gm')->where('resource', 'M')->exists());
    }

    public function testGrantRejectsNegativeResultingInventory(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $this->seedOwner(7);

        $this->postJson('/api/v1/gm/grant', ['owner_id' => 7, 'M' => -999999], ['X-GM-Key' => 'secret-key'])
            ->assertStatus(422);

        $p = DB::table('planets')->where('owner_id', 7)->where('is_homeworld', true)->first();
        $this->assertEqualsWithDelta(500.0, (float) $p->inv_m, 1e-6, '拒绝时库存不得变动');
    }

    public function testLevelSetsBuildingAndAudits(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $planetId = $this->seedOwner(7);

        $this->postJson('/api/v1/gm/level', ['owner_id' => 7, 'planet_id' => $planetId, 'building' => 'METAL_MINE', 'level' => 5], ['X-GM-Key' => 'secret-key'])
            ->assertStatus(200)
            ->assertJsonPath('to', 5);

        $levels = json_decode((string) DB::table('planets')->where('id', $planetId)->value('levels_json'), true);
        $this->assertSame(5, (int) ($levels['METAL_MINE'] ?? 0));
        $this->assertNotNull(DB::table('game_commands')->where('type', 'GM_LEVEL')->first());
    }

    public function testBanBlocksPlayerApiAndUnbanRestores(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $this->seedOwner(7);
        $this->tokenFor(7, 'owner7-token');

        $this->getJson('/api/v1/state?owner_id=7', ['Authorization' => 'Bearer owner7-token'])->assertStatus(200);

        $this->postJson('/api/v1/gm/ban', ['owner_id' => 7, 'reason' => '测试封禁'], ['X-GM-Key' => 'secret-key'])
            ->assertStatus(200);

        $resp = $this->getJson('/api/v1/state?owner_id=7', ['Authorization' => 'Bearer owner7-token']);
        $resp->assertStatus(403);
        $this->assertStringContainsString('测试封禁', (string) $resp->json('error'));
        $this->assertNotNull(DB::table('game_commands')->where('type', 'GM_BAN')->first());

        $this->postJson('/api/v1/gm/unban', ['owner_id' => 7], ['X-GM-Key' => 'secret-key'])->assertStatus(200);
        $this->getJson('/api/v1/state?owner_id=7', ['Authorization' => 'Bearer owner7-token'])->assertStatus(200);
    }

    public function testAnnounceProjectsIntoState(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $this->seedOwner(7);
        $this->tokenFor(7, 'owner7-token');

        $this->postJson('/api/v1/gm/announce', ['message' => '今晚 20:00 服务器维护'], ['X-GM-Key' => 'secret-key'])
            ->assertStatus(200);

        $this->assertNotNull(DB::table('game_commands')->where('type', 'GM_ANNOUNCE')->first());
        $resp = $this->getJson('/api/v1/state?owner_id=7', ['Authorization' => 'Bearer owner7-token']);
        $this->assertSame('今晚 20:00 服务器维护', $resp->json('announcement'));
    }

    public function testPlayersListsAndAuditReturnsGmRows(): void
    {
        config(['services.game.gm_key' => 'secret-key']);
        $this->seedOwner(7);

        $this->postJson('/api/v1/gm/grant', ['owner_id' => 7, 'M' => 10], ['X-GM-Key' => 'secret-key'])->assertStatus(200);

        $players = $this->getJson('/api/v1/gm/players?query=7', ['X-GM-Key' => 'secret-key'])->assertStatus(200)->json('players');
        $this->assertCount(1, $players);
        $this->assertSame(7, $players[0]['owner_id']);

        $audit = $this->getJson('/api/v1/gm/audit', ['X-GM-Key' => 'secret-key'])->assertStatus(200)->json('audit');
        $this->assertNotEmpty($audit);
        $this->assertSame('GM_RESOURCES', $audit[0]['type']);
    }
}
