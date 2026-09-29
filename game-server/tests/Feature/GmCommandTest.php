<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * GM/客服工具（G10）：资源发放/等级设置——每次操作必须有 GM_* 命令行留痕 + gm 台账；
 * 扣回至负库存拒绝（守恒红线）。
 */
class GmCommandTest extends TestCase
{
    use RefreshDatabase;

    private function seedWorld(): int
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 7])->assertExitCode(0);

        return (int) Planet::query()->where('owner_id', 7)->first()->id;
    }

    public function testGrantResourcesAddsInventoryWithAuditTrail(): void
    {
        $planetId = $this->seedWorld();

        $this->artisan('game:gm', ['verb' => 'resources', 'owner_id' => 7, '--M' => '1000', '--D' => '50'])
            ->assertExitCode(0);

        $p = Planet::find($planetId);
        $this->assertEqualsWithDelta(1500.0, (float) $p->inv_m, 1e-6);   // 500 初始 + 1000
        $this->assertEqualsWithDelta(50.0, (float) $p->inv_d, 1e-6);

        // 审计：GM_RESOURCES 命令行 + gm 台账（M/D 两行）
        $this->assertSame(1, DB::table('game_commands')->where('type', 'GM_RESOURCES')->count());
        $ops = DB::table('resource_transactions')->where('operation', 'gm')->pluck('amount_signed', 'resource');
        $this->assertEqualsWithDelta(1000.0, (float) ($ops['M'] ?? 0), 1e-6);
        $this->assertEqualsWithDelta(50.0, (float) ($ops['D'] ?? 0), 1e-6);
    }

    public function testGrantRejectsNegativeResultingInventory(): void
    {
        $planetId = $this->seedWorld();

        $this->artisan('game:gm', ['verb' => 'resources', 'owner_id' => 7, '--M' => '-999999'])
            ->assertExitCode(1);

        $p = Planet::find($planetId);
        $this->assertEqualsWithDelta(500.0, (float) $p->inv_m, 1e-6, '拒绝时库存不得变动');
        $this->assertSame(0, DB::table('game_commands')->where('type', 'GM_RESOURCES')->count());
    }

    public function testSetLevelUpdatesAndAudits(): void
    {
        $planetId = $this->seedWorld();

        $this->artisan('game:gm', [
            'verb' => 'level', 'owner_id' => 7,
            '--planet' => (string) $planetId, '--building' => 'METAL_MINE', '--level' => '5',
        ])->assertExitCode(0);

        $this->assertSame(5, Planet::find($planetId)->level('METAL_MINE'));
        $row = DB::table('game_commands')->where('type', 'GM_LEVEL')->first();
        $this->assertNotNull($row);
        $payload = (array) json_decode((string) $row->payload_json, true);
        $this->assertSame(0, $payload['from']);
        $this->assertSame(5, $payload['to']);
    }

    public function testUnknownVerbAndForeignPlanetRejected(): void
    {
        $this->seedWorld();
        $this->artisan('game:gm', ['verb' => 'nuke', 'owner_id' => 7])->assertExitCode(1);
        $this->artisan('game:gm', [
            'verb' => 'level', 'owner_id' => 7,
            '--planet' => '999', '--building' => 'SOLAR', '--level' => '1',
        ])->assertExitCode(1);
    }
}
