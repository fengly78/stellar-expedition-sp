<?php

declare(strict_types=1);

namespace App\Domain\Combat;

use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * MoonService：月球生成（G7；经典 0.84 battle.php:926-930 同构）。
 *
 * 规则：残骸总量（M+C）每 100,000 → 1% 概率，上限 20%；
 * 目标是月球或同坐标已有月球 → 不生成；概率判定用确定性种子（moon-{battleId}）——
 * 同一战斗重放不产生第二颗月球（battle_snapshots 幂等本就保证，此处双保险）。
 * 月球：同坐标 is_moon=true、owner=防守方、温度=行星最低温 −(20~30)（确定性）、库存/建筑/舰船全空。
 */
class MoonService
{
    public const DEBRIS_PER_PERCENT = 100000;
    public const MAX_CHANCE = 20;

    /** 残骸量 → 月球概率%（钳 20 上限；战斗结算与测试共用）。 */
    public static function chanceFor(float $debrisTotal): int
    {
        return (int) min(intdiv((int) floor($debrisTotal), self::DEBRIS_PER_PERCENT), self::MAX_CHANCE);
    }

    /**
     * 战斗残骸入场后调用。返回新建月球 planet_id 或 null。
     *
     * @param array{M:float,C:float} $debris
     */
    public function maybeCreateMoon(Planet $defenderPlanet, array $debris, string $battleId): ?int
    {
        if ((bool) $defenderPlanet->is_moon) {
            return null;
        }
        $chance = (int) min(
            intdiv((int) floor($debris['M'] + $debris['C']), self::DEBRIS_PER_PERCENT),
            self::MAX_CHANCE,
        );
        if ($chance <= 0) {
            return null;
        }
        if ($this->moonExistsAt((int) $defenderPlanet->galaxy, (int) $defenderPlanet->system_pos, (int) $defenderPlanet->orbit)) {
            return null;
        }
        if (self::seedMod100("moon-{$battleId}") >= $chance) {
            return null;
        }

        $moon = new Planet();
        $moon->owner_id = (int) $defenderPlanet->owner_id;
        $moon->galaxy = (int) $defenderPlanet->galaxy;
        $moon->system_pos = (int) $defenderPlanet->system_pos;
        $moon->orbit = (int) $defenderPlanet->orbit;
        $moon->temp = $defenderPlanet->temp === null ? null : (int) $defenderPlanet->temp - 20 - self::seedMod100("moontemp-{$battleId}") % 11;
        $moon->is_homeworld = false;
        $moon->is_moon = true;
        $moon->inv_m = 0.0;
        $moon->inv_c = 0.0;
        $moon->inv_d = 0.0;
        $moon->levels_json = [];
        $moon->ships_json = [];
        $moon->defense_json = [];
        $moon->queue_building = [];
        $moon->production_checkpoint_at = now();
        $moon->version = 0;
        $moon->save();

        return (int) $moon->id;
    }

    private function moonExistsAt(int $galaxy, int $systemPos, int $orbit): bool
    {
        return Planet::query()
            ->where('galaxy', $galaxy)->where('system_pos', $systemPos)->where('orbit', $orbit)
            ->where('is_moon', true)
            ->exists();
    }

    /** 确定性判定种子：sha256 前 4 字节（大端）mod 100（与修复/反侦察同口径）。 */
    private static function seedMod100(string $key): int
    {
        return unpack('N', hash('sha256', $key, true))[1] % 100;
    }
}
