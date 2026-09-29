<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameRuleset;
use Illuminate\Console\Command;

/**
 * game:seed-dev-ruleset：把「RC1 真值 + 分支候选」装配为开发/测试库的 frozen 规则集。
 *
 * 数值来源（全部有出处，零凭记忆填数）：
 * - 底座：config/rulesets/balance_rc1.json 的全部非 TBD 条目（value=null 跳过 → 保持 fail-closed）。
 * - 叠加：config/rulesets/branches/intel_mechanism_ogamex.json（CR-004 B 候选）。
 * - 叠加：config/rulesets/branches/classic_mechanisms_candidates.json（SOURCE-02 机制候选）。
 * - 经典出处补齐：TECH.* 成本倍率 g=2.0（OGame 0.84 techs.php:274-289：研究全族 factor=2）。
 * - TIME 三族（BUILD/RESEARCH/SHIP.TIME）：F-08 校准器结论 universe_speed=1（sim/reports f08）。
 *
 * 定位声明：**仅用于开发/测试环境让全链路可玩**。生产规则集的唯一合法路径仍是
 * 所有者批准 CR → 写入 balance_rc1.json → 重导 hash（§05.10/§09.2）。本命令不触碰任何冻结文件。
 */
class SeedDevRuleset extends Command
{
    protected $signature = 'game:seed-dev-ruleset {--ruleset-version=dev_seed : 规则集版本号}';

    protected $description = '装配 RC1+分支候选为开发库 frozen 规则集（仅开发/测试，生产仍走 CR）';

    public function handle(RulesetLoader $loader): int
    {
        $root = dirname(base_path());
        $baseFile = $root.'/config/rulesets/balance_rc1.json';
        $branchFiles = [
            $root.'/config/rulesets/branches/intel_mechanism_ogamex.json',
            $root.'/config/rulesets/branches/classic_mechanisms_candidates.json',
            $root.'/config/rulesets/branches/defense_classic_084.json',
        ];

        $content = [];
        $base = json_decode((string) file_get_contents($baseFile), true, 512, JSON_THROW_ON_ERROR);
        $applied = 0;
        $skippedTbd = 0;
        foreach ($base['parameters'] as $entry) {
            if ($entry['value'] === null) {
                $skippedTbd++;   // TBD 保持缺席 → 业务层 fail-closed
                continue;
            }
            self::setByPath($content, $entry['key'], $entry['value']);
            $applied++;
        }

        foreach ($branchFiles as $file) {
            $branch = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            foreach ($branch['parameters'] as $entry) {
                self::setByPath($content, $entry['key'], $entry['value']);
                $applied++;
            }
            $this->line("  叠加分支：{$branch['meta']['name']}");
        }

        // 经典出处补齐：研究全族 factor=2（0.84 techs.php:274-289）
        foreach ($content['TECH'] ?? [] as $tech => $cfg) {
            if (is_array($cfg) && ! isset($cfg['g'])) {
                $content['TECH'][$tech]['g'] = 2.0;
                $applied++;
            }
        }

        // 经典出处补齐（SOURCE-02 §六）：五舰 speed/fuel/cargo（双源一致）——
        // 缺失时舰队派遣 fail-closed，游戏无法进行。
        $classicShips = [
            'LIGHT' => ['speed' => 12500, 'fuel' => 20, 'cargo' => 50],
            'HEAVY' => ['speed' => 10000, 'fuel' => 75, 'cargo' => 100],
            'SMALL_CARGO' => ['speed' => 5000, 'fuel' => 10, 'cargo' => 5000],
            'COLONY' => ['speed' => 2500, 'fuel' => 1000, 'cargo' => 7500],
            'SCOUT' => ['speed' => 100000000, 'fuel' => 1, 'cargo' => 5],
        ];
        foreach ($classicShips as $ship => $fills) {
            if (! isset($content['SHIP'][$ship]) || ! is_array($content['SHIP'][$ship])) {
                continue;
            }
            foreach ($fills as $k => $v) {
                if (! isset($content['SHIP'][$ship][$k]) || $content['SHIP'][$ship][$k] === null) {
                    $content['SHIP'][$ship][$k] = $v;
                    $applied++;
                }
            }
        }

        // 前置表补齐：MVP 简化——TECH/SHIP/DEFENSE 全族无前置（经典部分对象有实验室/船厂依赖，
        // 正式前置表随 CR 收紧）。
        //
        // 2026-09-29 两处修正（并行审计发现）：
        // ① **DEFENSE 族原先没有兜底**。而 `REQUIRES.DEFENSE.*` 同时依赖 RC1 底座（8 条）
        //    与分支 `defense_classic_084.json`（8 条）。任一侧被「清理冗余」而另一侧缺失，
        //    `SHIP_ORDER` 造该防御设施就会因 `Ruleset::get` 缺键而 **503**，
        //    且 8 个防御对象**全体**受影响——不是单个对象坏掉。
        // ② 原先的 `array_keys($content['SHIP'])` 会把 **`SHIP.TIME`（造船时长公式配置）**
        //    当成一艘船，补出全仓无人引用、无语义的 `REQUIRES.SHIP.TIME`。
        //    任何 `.TIME` 结尾的族配置都要跳过。
        foreach (['TECH' => 'TECH.', 'SHIP' => 'SHIP.', 'DEFENSE' => 'DEFENSE.'] as $fam => $prefix) {
            foreach (array_keys($content[$fam] ?? []) as $name) {
                // 族配置不是对象：`SHIP.TIME` / `TECH.TIME` 是公式配置，不该有前置
                if (str_ends_with((string) $name, '.TIME')) {
                    continue;
                }
                if (! isset($content['REQUIRES'][$fam][$name])) {
                    self::setByPath($content, "REQUIRES.{$fam}.{$name}", []);
                    $applied++;
                }
            }
        }

        // TIME 三族（F-08 校准：universe_speed=1；常数 2500/1000/2500 为上游式常数）
        self::setByPath($content, 'BUILD.TIME', ['model' => 'upstream', 'constant' => 2500,
            'universe_speed' => 1, 't_min_seconds' => 30, 'robotics_level_R' => 0, 'nanite_level_N' => 0]);
        self::setByPath($content, 'RESEARCH.TIME', ['model' => 'upstream', 'constant' => 1000,
            'lab_factor' => 0, 'universe_speed' => 1, 't_min_seconds' => 30]);
        self::setByPath($content, 'SHIP.TIME', ['model' => 'upstream', 'constant' => 2500,
            'shipyard_level_S' => 0, 'nanite_level_N' => 0, 'universe_speed' => 1, 't_min_seconds' => 30]);

        // 舰队飞行公式族（审计 §1.1-1.3 上游式；FlightService 同一常数来源）
        self::setByPath($content, 'FLEET.FORMULA', [
            'universe_speed' => 1,
            'distance' => ['same_system' => 5, 'per_orbit' => 5, 'orbit_base' => 1000,
                'per_system' => 95, 'system_base' => 2700, 'per_galaxy' => 20000],
            'duration' => ['constant' => 35000, 'base_overhead_s' => 10, 'speed_factor_divisor' => 10],
            'fuel' => ['divisor' => 35000, 'speed_term_base' => 10, 'minimum' => 1],
        ]);

        $version = (string) $this->option('ruleset-version');
        $row = GameRuleset::query()->firstOrNew([
            'ruleset_name' => 'balance_rc1', 'version' => $version,
        ]);
        $row->content_hash = RulesetLoader::hashContent($content);
        $row->status = GameRuleset::STATUS_FROZEN;
        $row->content_json = $content;
        $row->created_at = now();
        $row->save();

        // 自检：必须能通过正式装载器（frozen+hash+无 TBD）
        $loader->load((int) $row->id);

        $this->info("DEV 规则集已冻结入库：balance_rc1@{$version}（#{$row->id}，参数 {$applied} 项，跳过 TBD {$skippedTbd} 项）");
        $this->warn('仅开发/测试使用——生产规则集仍需所有者批准 CR 后从 balance_rc1.json 正式回填。');

        return self::SUCCESS;
    }

    /** 点分路径写入（中间节点不存在则创建）。 */
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
}
