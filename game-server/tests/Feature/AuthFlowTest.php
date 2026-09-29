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
 * 鉴权与越权矩阵（发布 P0-2，2026-09-23 落地）：
 * 默认强制（GAME_AUTH_ENFORCED）——401 无令牌 / 401 伪造令牌 / 200 本人令牌
 * / 403 读他人状态 / 403 令牌 owner≠信封 owner 的命令提交；health 公开；签发命令轮换语义。
 */
class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    private function seedOwner(int $owner): int
    {
        // 同一测试内多次 seed 只建一次规则集（content_hash 唯一约束）
        if (TestRuleset::exists('balance_rc1') === false) {
            TestRuleset::create(name: 'balance_rc1');
        }
        $this->artisan('game:bootstrap-player', ['owner_id' => $owner])->assertExitCode(0);

        return (int) Planet::query()->where('owner_id', $owner)->first()->id;
    }

    /** 直插一枚确定明文的令牌（测试可复现）。 */
    private function tokenFor(int $owner, string $plain): void
    {
        DB::table('api_tokens')->updateOrInsert(
            ['owner_id' => $owner],
            ['token_hash' => hash('sha256', $plain), 'created_at' => now()],
        );
    }

    public function testHealthStaysPublic(): void
    {
        $this->getJson('/api/v1/health')->assertStatus(200);
    }

    public function testMissingTokenRejectedWhenEnforced(): void
    {
        $this->seedOwner(7);
        $resp = $this->getJson('/api/v1/state?owner_id=7');
        $resp->assertStatus(401);
        $this->assertStringContainsString('game:issue-token', (string) $resp->json('error'));
    }

    public function testForgedTokenRejected(): void
    {
        $this->seedOwner(7);
        $this->getJson('/api/v1/state?owner_id=7', ['Authorization' => 'Bearer not-a-real-token'])
            ->assertStatus(401);
    }

    public function testValidTokenReadsOwnState(): void
    {
        $this->seedOwner(7);
        $this->tokenFor(7, 'owner7-token');
        $this->getJson('/api/v1/state?owner_id=7', ['Authorization' => 'Bearer owner7-token'])
            ->assertStatus(200)
            ->assertJsonPath('owner_id', 7);
    }

    public function testCrossOwnerStateReadForbidden(): void
    {
        $this->seedOwner(7);
        $this->seedOwner(8);
        $this->tokenFor(7, 'owner7-token');
        // owner7 的令牌读 owner8 的状态 → 403
        $this->getJson('/api/v1/state?owner_id=8', ['Authorization' => 'Bearer owner7-token'])
            ->assertStatus(403);
        $this->getJson('/api/v1/reports?owner_id=8', ['Authorization' => 'Bearer owner7-token'])
            ->assertStatus(403);
    }

    public function testCrossOwnerCommandResultReadForbidden(): void
    {
        $this->seedOwner(7);
        $this->seedOwner(8);
        $this->tokenFor(7, 'owner7-token');
        $this->tokenFor(8, 'owner8-token');

        $commandId = (string) DB::table('game_commands')->where('owner_id', 8)->value('command_id');
        $url = '/api/v1/commands/'.$commandId;

        $this->getJson($url, ['Authorization' => 'Bearer owner7-token'])->assertStatus(403);
        $this->getJson($url, ['Authorization' => 'Bearer owner8-token'])->assertStatus(200);
    }

    public function testCommandEnvelopeOwnerMustMatchToken(): void
    {
        $planetId = $this->seedOwner(7);
        $this->seedOwner(8);
        $this->tokenFor(7, 'owner7-token');

        $body = [
            'command_id' => '12345678-1234-4123-8123-123456789abc',
            'actor' => ['kind' => 'player', 'actor_id' => 8],
            'owner_id' => 8,   // 冒充 owner8 提交
            'type' => 'BUILD_ENQUEUE',
            'payload' => ['planet_id' => $planetId, 'building' => 'METAL_MINE'],
            'ruleset_version' => 'e2e',
        ];

        // 无令牌 → 401
        $this->postJson('/api/v1/commands', $body)->assertStatus(401);
        // owner7 令牌 + 信封 owner8 → 403（不得代提他人命令）
        $this->postJson('/api/v1/commands', $body, ['Authorization' => 'Bearer owner7-token'])
            ->assertStatus(403);
    }

    public function testIssueTokenCommandRotates(): void
    {
        $this->seedOwner(7);
        $this->artisan('game:issue-token', ['owner_id' => 7])->assertExitCode(0);
        $hash1 = (string) DB::table('api_tokens')->where('owner_id', 7)->value('token_hash');
        $this->assertSame(64, strlen($hash1));

        $this->artisan('game:issue-token', ['owner_id' => 7])->assertExitCode(0);
        $hash2 = (string) DB::table('api_tokens')->where('owner_id', 7)->value('token_hash');
        $this->assertNotSame($hash1, $hash2, '重签必须轮换哈希');
        $this->assertSame(1, DB::table('api_tokens')->where('owner_id', 7)->count(), '每 owner 单有效令牌');
    }

    public function testAuthOffFallsBackToLegacyMode(): void
    {
        config(['services.game.auth_enforced' => false]);
        $this->seedOwner(7);
        // 关闭强制（开发应急开关）→ 旧口径可用
        $this->getJson('/api/v1/state?owner_id=7')->assertStatus(200);
    }
}
