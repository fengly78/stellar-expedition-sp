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
 * 月球生成（G7；经典 battle.php:926-930 同构）：
 * 残骸 ≥10 万/1% 上限 20%；确定性种子判定；月球与行星同坐标共存（is_moon 复合唯一）；
 * 目标是月球或不满足概率 → 不生成。
 */
class MoonTest extends TestCase
{
    use RefreshDatabase;

    private function planet(int $owner, string $coords, bool $isMoon = false, float $invM = 0, float $invC = 0, float $invD = 0): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g;
        $p->system_pos = $s;
        $p->orbit = $o;
        $p->temp = 30;
        $p->is_homeworld = ! $isMoon;
        $p->is_moon = $isMoon;
        $p->inv_m = $invM;
        $p->inv_c = $invC;
        $p->inv_d = $invD;
        $p->levels_json = [];
        $p->ships_json = [];
        $p->defense_json = [];
        $p->queue_building = [];
        $p->production_checkpoint_at = now();
        $p->version = 0;
        $p->save();
        return (int) $p->id;
    }

    /** 直接驱动 MoonService（绕过战斗；月球生成是残骸量的纯函数）。 */
    private function maybeMoon(int $defenderPlanetId, float $debrisTotal, string $battleId): ?int
    {
        $svc = $this->app->make(\App\Domain\Combat\MoonService::class);
        $planet = Planet::find($defenderPlanetId);

        return $svc->maybeCreateMoon($planet, ['M' => $debrisTotal, 'C' => 0.0], $battleId);
    }

    public function testLargeDebrisCanCreateCoLocatedMoon(): void
    {
        $pid = $this->planet(7, '1:1:5', invD: 3000000);   // 攻击者燃料需要
        $this->planet(8, '1:1:6', invM: 5000000);
        $this->planet(7, '1:1:4');   // 侦察兵母星（本测试不发舰队，仅驱动 MoonService）

        // 直接以足额残骸驱动：either 掷中与否由确定性种子决定——断言两种结果都合法
        // 先找一个必中 battleId（种子 mod100 < 20 必有：0..19）
        $svc = $this->app->make(\App\Domain\Combat\MoonService::class);
        $defender = Planet::find($pid);
        $battleId = '';
        for ($i = 0; $i < 500; $i++) {
            $candidate = "moon-test-{$i}";
            if (\App\Domain\Combat\MoonService::chanceFor(5000000) === 50) {
                // 上限 20：5M 残骸=50% 被钳到 20
            }
            if (self::seedMod100ForTest("moon-{$candidate}") < 20) {
                $battleId = $candidate;
                break;
            }
        }
        $this->assertNotSame('', $battleId, '500 个候选内必有一个命中（20% 概率）');

        $moonId = $svc->maybeCreateMoon($defender, ['M' => 5000000.0, 'C' => 0.0], $battleId);
        $this->assertNotNull($moonId, '足额残骸+命中种子必须生成月球');

        $moon = Planet::find($moonId);
        $this->assertTrue((bool) $moon->is_moon);
        $this->assertSame((int) $defender->owner_id, (int) $moon->owner_id);
        $this->assertSame((int) $defender->galaxy, (int) $moon->galaxy);
        $this->assertSame((int) $defender->orbit, (int) $moon->orbit);
        $this->assertLessThan((int) $defender->temp, (int) $moon->temp, '月球温度必须低于行星');

        // 同坐标共存：行星与月球都在
        $this->assertSame(2, Planet::query()->where('galaxy', $defender->galaxy)
            ->where('system_pos', $defender->system_pos)->where('orbit', $defender->orbit)->count());

        // 幂等：已有月球 → 不再生成
        $again = $svc->maybeCreateMoon($defender, ['M' => 5000000.0, 'C' => 0.0], 'moon-test-another');
        $this->assertNull($again);
    }

    public function testMoonTargetNeverGeneratesMoon(): void
    {
        $pid = $this->planet(7, '1:1:5');
        $this->planet(7, '1:1:5', true);   // 同坐标已有月球

        $svc = $this->app->make(\App\Domain\Combat\MoonService::class);
        $defender = Planet::find($pid);
        // 找必中种子
        $battleId = '';
        for ($i = 0; $i < 500; $i++) {
            if (self::seedMod100ForTest("moon-test-{$i}") < 20) {
                $battleId = "moon-test-{$i}";
                break;
            }
        }
        $this->assertNull($svc->maybeCreateMoon($defender, ['M' => 5000000.0, 'C' => 0.0], $battleId), '目标已有月球→不生成');
    }

    public function testBelowThresholdNeverGenerates(): void
    {
        $pid = $this->planet(7, '1:1:5');
        $svc = $this->app->make(\App\Domain\Combat\MoonService::class);
        $defender = Planet::find($pid);
        // 99999 残骸 < 10 万 → 0% 概率，任何 battleId 都不生成
        for ($i = 0; $i < 20; $i++) {
            $this->assertNull($svc->maybeCreateMoon($defender, ['M' => 99999.0, 'C' => 0.0], "below-{$i}"));
        }
    }

    private static function seedMod100ForTest(string $key): int
    {
        return unpack('N', hash('sha256', $key, true))[1] % 100;
    }
}
