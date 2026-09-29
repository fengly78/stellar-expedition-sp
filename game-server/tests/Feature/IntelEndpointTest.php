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
 * GET /api/v1/intel（G6 模拟器回填源）：按 owner 列最新侦察快照；
 * 鉴权同 state（401/403/422 语义）；可见字段原样透传。
 */
class IntelEndpointTest extends TestCase
{
    use RefreshDatabase;

    private array $auth;

    private function seedWorld(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 7])->assertExitCode(0);
        DB::table('api_tokens')->updateOrInsert(
            ['owner_id' => 7],
            ['token_hash' => hash('sha256', 'intel-token'), 'created_at' => now()],
        );
        $this->auth = ['Authorization' => 'Bearer intel-token'];
    }

    private function makeSpySnapshot(int $owner, array $visible, string $target = '1:1:2'): void
    {
        $rulesetId = (int) DB::table('game_rulesets')->where('status', 'frozen')->orderByDesc('id')->value('id');
        DB::table('game_commands')->insert([
            'command_id' => \Illuminate\Support\Str::uuid()->toString(),
            'payload_hash' => str_repeat('b', 64),
            'actor_kind' => 'player', 'actor_id' => $owner, 'owner_id' => $owner,
            'type' => 'FLEET_DISPATCH', 'payload_json' => '{}', 'ruleset_id' => $rulesetId,
            'status' => 'committed', 'attempt_count' => 1,
            'submitted_at' => now(), 'committed_at' => now(),
        ]);
        DB::table('intel_snapshots')->insert([
            'owner_id' => $owner, 'target_ref' => $target, 'observed_at' => now(),
            'visible_fields_json' => json_encode($visible, JSON_UNESCAPED_UNICODE),
            'ruleset_id' => $rulesetId,
            'source_command' => \Illuminate\Support\Str::uuid()->toString(),
        ]);
    }

    public function testListsLatestSnapshotsForOwner(): void
    {
        $this->seedWorld();
        $this->makeSpySnapshot(7, ['target_exists' => true, 'resources' => ['M' => 123, 'C' => 45, 'D' => 6], 'ships' => ['LIGHT' => 8, '204' => 2]]);

        $resp = $this->getJson('/api/v1/intel?owner_id=7', $this->auth);
        $resp->assertStatus(200)->assertJsonPath('count', 1);
        $snap = $resp->json('snapshots.0');
        $this->assertSame('1:1:2', $snap['target']);
        $this->assertSame(['LIGHT' => 8, '204' => 2], $snap['visible']['ships']);
    }

    public function testAuthAndValidationSemantics(): void
    {
        $this->seedWorld();
        $this->getJson('/api/v1/intel?owner_id=7')->assertStatus(401);                  // 无令牌
        $this->getJson('/api/v1/intel?owner_id=8', $this->auth)->assertStatus(403);     // 他人 owner
        $this->getJson('/api/v1/intel', $this->auth)->assertStatus(422);                // 缺参数
        $this->getJson('/api/v1/intel?owner_id=7', $this->auth)->assertStatus(200)->assertJsonPath('count', 0); // 空态
    }
}
