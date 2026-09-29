<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Planet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 自助注册（G1）矩阵：201 开档+令牌即用 / 409 重名 / 422 形状 / 503 无规则集 /
 * CLI 引导与新内核等价（BootstrapPlayer 复用 PlayerProvisioner）。
 */
class RegisterTest extends TestCase
{
    use RefreshDatabase;

    public function testRegisterCreatesPlayerPlanetAndUsableToken(): void
    {
        TestRuleset::create(name: 'balance_rc1');

        $resp = $this->postJson('/api/v1/register', ['name' => '星海指挥官']);
        $resp->assertStatus(201);
        $body = $resp->json();

        $this->assertSame('星海指挥官', $body['name']);
        $this->assertGreaterThan(0, $body['owner_id']);
        $this->assertMatchesRegularExpression('/^1:\d+:(4|5|6|7|8|9|10|11|12)$/', $body['coords'], '经典环带选址');
        $this->assertNotNull($body['temp']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $body['token']);

        // 令牌即用：state 直读自己的新档
        $this->getJson("/api/v1/state?owner_id={$body['owner_id']}", ['Authorization' => "Bearer {$body['token']}"])
            ->assertStatus(200)
            ->assertJsonPath('owner_id', $body['owner_id']);

        // 开档落库：players 行 + 母星 + init 台账 + BOOTSTRAP 命令行
        $this->assertSame(1, DB::table('players')->count());
        $this->assertSame(1, Planet::query()->where('owner_id', $body['owner_id'])->count());
        $this->assertSame(1, DB::table('game_commands')->where('type', 'BOOTSTRAP')->count());
        $this->assertSame(2, DB::table('resource_transactions')->where('operation', 'init')->count()); // M+C（D=0 不记）
    }

    public function testRegisterRejectsDuplicateName(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->postJson('/api/v1/register', ['name' => '独一号'])->assertStatus(201);
        $this->postJson('/api/v1/register', ['name' => '独一号'])->assertStatus(409);
    }

    public function testRegisterValidatesShape(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->postJson('/api/v1/register', [])->assertStatus(422);
        $this->postJson('/api/v1/register', ['name' => str_repeat('长', 33)])->assertStatus(422);
    }

    public function testRegisterFailsClosedWithoutFrozenRuleset(): void
    {
        $this->postJson('/api/v1/register', ['name' => '无规则集'])->assertStatus(503);
    }

    public function testCliBootstrapUsesSameProvisioner(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $this->artisan('game:bootstrap-player', ['owner_id' => 42])->assertExitCode(0);
        $this->assertSame(1, Planet::query()->where('owner_id', 42)->count());
        // 重开拒绝（ProvisionException → CLI FAILURE）
        $this->artisan('game:bootstrap-player', ['owner_id' => 42])->assertExitCode(1);
    }

    public function testRegisterAllocatesSequentialOwners(): void
    {
        TestRuleset::create(name: 'balance_rc1');
        $a = $this->postJson('/api/v1/register', ['name' => '甲'])->assertStatus(201)->json();
        $b = $this->postJson('/api/v1/register', ['name' => '乙'])->assertStatus(201)->json();
        $this->assertSame($a['owner_id'] + 1, $b['owner_id']);
    }
}
