<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameRuleset;

/**
 * 合成 frozen 规则集（测试专用）：机制全量，数值取 RC1 同值或上游同构候选值。
 * 仅用于测试环境——生产唯一入口仍是 config/rulesets + RulesetLoader（GDD-10）。
 * 舰船属性用 RC1 口径 A/S/H；unit_id 可切换以测试回退路径。
 */
class TestRuleset
{
    /** @return array<string,mixed> */
    public static function content(bool $withIntel = false, bool $withUnitId = true, array $patches = []): array
    {
        $uid = static fn (?int $id): ?array => $withUnitId ? ['unit_id' => $id] : null;
        $dropNull = static function (array $a): array {
            foreach ($a as $k => $v) {
                if ($v === null) {
                    unset($a[$k]);
                }
            }
            return $a;
        };

        $content = [
            'RESOURCE' => [
                'M' => ['PRODUCTION' => ['p' => 30, 'a' => 1.12]],
                'C' => ['PRODUCTION' => ['p' => 20, 'a' => 1.12]],
                'D' => ['PRODUCTION' => ['p' => 10, 'a' => 1.10]],
            ],
            'ENERGY' => [
                'SOLAR' => ['base' => 25, 'factor' => 1.10],
                'M_DEMAND' => ['base' => 10, 'factor' => 1.10],
                'C_DEMAND' => ['base' => 10, 'factor' => 1.10],
                'D_DEMAND' => ['base' => 15, 'factor' => 1.10],
            ],
            'STORAGE' => ['CURVE' => ['S0' => 10000, 'S1' => 10000, 'g' => 1.60]],
            'QUEUE' => ['BUILD' => ['PENDING' => 3]],
            'BUILD' => [
                'METAL_MINE' => ['M' => 60, 'C' => 15, 'D' => 0, 'g' => 1.5],
                'CRYSTAL_MINE' => ['M' => 48, 'C' => 24, 'D' => 0, 'g' => 1.6],
                'DEUT_SYNTH' => ['M' => 225, 'C' => 75, 'D' => 0, 'g' => 1.5],
                'SOLAR' => ['M' => 75, 'C' => 30, 'D' => 0, 'g' => 1.5],
            ],
            'TECH' => [
                'ENERGY' => ['M' => 0, 'C' => 800, 'D' => 400, 'g' => 2.0],
                'COMBUSTION' => ['M' => 400, 'C' => 0, 'D' => 600, 'g' => 2.0],
                'IMPULSE' => ['M' => 1000, 'C' => 2000, 'D' => 300, 'g' => 2.0],
                'COMPUTER' => ['M' => 0, 'C' => 400, 'D' => 600, 'g' => 2.0],
                'ASTRO' => ['M' => 4000, 'C' => 8000, 'D' => 4000, 'g' => 2.0],
                'ESPIONAGE' => ['M' => 200, 'C' => 1000, 'D' => 200, 'g' => 2.0],
                'WEAPONS' => ['M' => 800, 'C' => 200, 'D' => 0, 'g' => 2.0],
                'SHIELD' => ['M' => 200, 'C' => 600, 'D' => 0, 'g' => 2.0],
                'ARMOUR' => ['M' => 1000, 'C' => 0, 'D' => 0, 'g' => 2.0],
            ],
            'FLEET' => ['FORMULA' => [
                'universe_speed' => 1,
                'distance' => ['same_system' => 5, 'per_orbit' => 5, 'orbit_base' => 1000,
                    'per_system' => 95, 'system_base' => 2700, 'per_galaxy' => 20000],
                'duration' => ['constant' => 35000, 'base_overhead_s' => 10, 'speed_factor_divisor' => 10],
                'fuel' => ['divisor' => 35000, 'speed_term_base' => 10, 'minimum' => 1],
            ]],
            'SHIP' => [
                'LIGHT' => $dropNull(['M' => 3000, 'C' => 1000, 'D' => 0, 'cargo' => 50,
                    'A' => 50, 'S' => 10, 'H' => 400, 'speed' => 12500, 'fuel' => 20] + ($uid(204) ?? [])),
                'HEAVY' => $dropNull(['M' => 6000, 'C' => 4000, 'D' => 0, 'cargo' => 100,
                    'A' => 150, 'S' => 25, 'H' => 1200, 'speed' => 10000, 'fuel' => 75] + ($uid(205) ?? [])),
                'SCOUT' => $dropNull(['M' => 1000, 'C' => 1500, 'D' => 0, 'cargo' => 5,
                    'A' => 1, 'S' => 1, 'H' => 100, 'speed' => 20000, 'fuel' => 1] + ($uid(210) ?? [])),
            ],
            'COMBAT' => ['LOOT_RATE' => 0.50, 'DEBRIS_RATE' => 0.30, 'TECH_GAIN' => 0.05],
        ];

        if ($withIntel) {
            // CR-20260923-004 D 候选（上游 OGameX CounterEspionageService 同构值）
            $content['INTEL'] = [
                'COUNTER_ESP' => ['divisor' => 4, 'level_offset' => 1],
                'REVEAL' => [
                    'gap_exponent' => 2,
                    'fields' => [
                        'ships' => ['probes' => 2, 'level' => 1],
                        'defense' => ['probes' => 3, 'level' => 2],
                        'buildings' => ['probes' => 5, 'level' => 3],
                        'research' => ['probes' => 7, 'level' => 4],
                    ],
                ],
            ];
        }

        foreach ($patches as $path => $value) {
            self::setByPath($content, $path, $value);
        }

        return $content;
    }

    /** 点分路径写入（路径中间节点不存在则创建）。 */
    private static function setByPath(array &$data, string $path, mixed $value): void
    {
        $segs = explode('.', $path);
        $node = &$data;
        foreach (array_slice($segs, 0, -1) as $seg) {
            if (! isset($node[$seg]) || ! is_array($node[$seg])) {
                $node[$seg] = [];
            }
            $node = &$node[$seg];
        }
        $node[end($segs)] = $value;
    }

    /** 指定名字的 frozen 规则集是否已存在（测试内幂等 seed 用）。 */
    public static function exists(string $name = 'test_synthetic'): bool
    {
        return GameRuleset::query()->where('ruleset_name', $name)->where('version', 'e2e')->exists();
    }

    /** 建一个 frozen 规则集行，返回 id（hash 按 canonical 口径计算，可直接过 RulesetLoader）。 */
    public static function create(bool $withIntel = false, bool $withUnitId = true, array $patches = [], string $name = 'test_synthetic'): int
    {
        $content = self::content($withIntel, $withUnitId, $patches);
        foreach ($patches as $path => $value) {
            self::setByPath($content, $path, $value);
        }
        $row = new GameRuleset();
        $row->ruleset_name = $name;
        $row->version = 'e2e';
        $row->content_hash = RulesetLoader::hashContent($content);
        $row->status = GameRuleset::STATUS_FROZEN;
        $row->content_json = $content;
        $row->created_at = now();
        $row->save();
        return (int) $row->id;
    }
}
