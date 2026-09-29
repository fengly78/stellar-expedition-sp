<?php

declare(strict_types=1);

namespace App\Domain\Combat;

use App\Domain\Command\CommandRejectedException;
use App\Domain\Debris\DebrisFieldService;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Ruleset\Ruleset;
use App\Domain\Ruleset\RulesetRefusedException;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * CombatResolveService：raid 抵达的战斗结算（API-01 §3 COMBAT_RESOLVE）。
 *
 * 职责划分（FFI spec §8）：模块只算战斗；本服务负责协调器+结算层——
 * 快照化防守资产 → 科技增益预乘入 spec → 调引擎 → 提交损毁/存活/掠夺/残骸/月球。
 * runBattle() 亦供反侦察战斗复用（ScoutArrivalService，上游 EspionageMission 同构）。
 *
 * 纪律：
 * - battle_id = "battle-{task_id}" 业务幂等键；已结算直接跳过（重放安全）。
 * - snapshot_version 乐观版本：陈旧计算禁止覆盖（§07.2）。
 * - 掠夺三重限制：合法库存 × COMBAT.LOOT_RATE × 存活剩余货舱。
 * - 残骸：损毁舰船的 M/C 成本 × COMBAT.DEBRIS_RATE，氘不成残骸（GDD-04）。
 *   残骸入 result_json 并追加至 debris_fields 残骸场（上游同构独立表，CR-004 C）。
 * - unit_id：FFI 规格与语料要求数值 ID（上游 204/205/210 等）。SHIP.*.unit_id 配置存在则用之
 *   （CR-004 A 回填），否则以 crc32(舰名) 作确定性内部 ID；引擎输出经映射还原为舰名落库。
 */
class CombatResolveService
{
    public function __construct(
        private readonly CombatEngine $engine,
        private readonly LedgerWriter $ledger,
        private readonly DebrisFieldService $debrisFields,
        private readonly MoonService $moons,
    ) {
    }

    /** 结算 raid 抵达。返回 battle_id。 */
    public function resolve(object $task, Ruleset $ruleset): string
    {
        $battleId = "battle-{$task->task_id}";
        if (DB::table('battle_snapshots')->where('battle_id', $battleId)->exists()) {
            return $battleId;   // 幂等：已结算
        }

        /** @var Planet|null $defender */
        $defender = Planet::query()
            ->where('galaxy', explode(':', $task->target_coords)[0])
            ->where('system_pos', explode(':', $task->target_coords)[1])
            ->where('orbit', explode(':', $task->target_coords)[2])
            ->lockForUpdate()->first();
        if ($defender === null) {
            throw new CommandRejectedException('目标行星不存在：' . $task->target_coords);
        }

        $now = Carbon::now('UTC');
        /** @var array<string,int> $attackShips */
        $attackShips = json_decode($task->ships_json, true);
        /** @var array<string,int> $defendShips */
        $defendShips = $defender->ships_json ?? [];
        /** @var array<string,int> $defendDefense */
        $defendDefense = $defender->defense_json ?? [];   // 防御设施以第二防守舰队参战（经典语义）

        $battle = $this->runBattle(
            $attackShips, (string) $task->task_id, (int) $task->owner_id, $this->techsOf((int) $task->owner_id),
            $defendShips, (string) $defender->id, (int) $defender->owner_id, $this->techsOf((int) $defender->owner_id),
            $battleId, $ruleset, $defendDefense,
        );
        $input = $battle['input'];
        /** @var array<string,int> $attSurv */ $attSurv = $battle['att_survivors'];
        /** @var array<string,int> $attLost */ $attLost = $battle['att_losses'];
        // 守方输出按名字域拆分：舰队名 → ships_json；防御名 → defense_json（两类名字全局不重叠）
        /** @var array<string,int> $defSurv */ $defSurv = array_diff_key($battle['def_survivors'], $defendDefense);
        /** @var array<string,int> $defDefSurv */ $defDefSurv = array_intersect_key($battle['def_survivors'], $defendDefense);
        /** @var array<string,int> $defLost */ $defLost = array_diff_key($battle['def_losses'], $defendDefense);
        /** @var array<string,int> $defDefLost */ $defDefLost = array_intersect_key($battle['def_losses'], $defendDefense);

        // 掠夺：三重限制 + 分配模式（COMBAT.LOOT_SPLIT=classic_thirds 为经典比例装舱，缺省顺序装舱）
        $loot = $this->plunder($defender, $attSurv, $ruleset);

        // 残骸：损毁舰船的 M/C 成本 × 比率（氘不成残骸）；
        // 防御残骸走独立比率 COMBAT.DEFENSE_DEBRIS_RATE（CR-005；键缺失=0——含 DEFENSE 族
        // 未配置的合成规则集，行为与经典 did=0 一致）
        $debrisRate = $ruleset->getFloat('COMBAT.DEBRIS_RATE');
        $debris = self::debrisOf($attLost, $ruleset, $debrisRate);
        foreach (self::debrisOf($defLost, $ruleset, $debrisRate) as $k => $v) {
            $debris[$k] += $v;
        }
        try {
            $defenseDebrisRate = $ruleset->getFloat('COMBAT.DEFENSE_DEBRIS_RATE');
        } catch (RulesetRefusedException) {
            $defenseDebrisRate = 0.0;
        }
        foreach (self::debrisOf($defDefLost, $ruleset, $defenseDebrisRate, 'DEFENSE.') as $k => $v) {
            $debris[$k] += $v;
        }
        $this->debrisFields->append(
            (int) $defender->galaxy, (int) $defender->system_pos, (int) $defender->orbit,
            $debris['M'], $debris['C'], 0.0,
        );

        // 月球生成（G7；经典 1%/10 万残骸上限 20%，确定性种子）：同坐标 is_moon 新行星
        $moonPlanetId = $this->moons->maybeCreateMoon($defender, $debris, $battleId);

        // 结算落库：防守方存活舰船；防御 = 存活 + 经修复恢复的损毁（经典 70%±10 修复，确定性种子）
        $repaired = [];
        try {
            $repairCfg = $ruleset->get('COMBAT.DEFENSE_REPAIR');
        } catch (RulesetRefusedException) {
            $repairCfg = null;   // 未配置 → 无修复，损毁即永久损失
        }
        if (is_array($repairCfg)) {
            $base = (int) $repairCfg['base'];
            $delta = (int) ($repairCfg['delta'] ?? 0);
            foreach ($defDefLost as $name => $lost) {
                $pct = $base + ($this->seedMod100("repaird-{$battleId}-{$name}") % (2 * $delta + 1)) - $delta;
                for ($i = 1; $i <= (int) $lost; $i++) {
                    if ($this->seedMod100("repair-{$battleId}-{$name}-{$i}") < $pct) {
                        $repaired[$name] = ($repaired[$name] ?? 0) + 1;
                    }
                }
            }
        }
        $defenseFinal = $defDefSurv;
        foreach ($repaired as $name => $n) {
            $defenseFinal[$name] = ((int) ($defenseFinal[$name] ?? 0)) + (int) $n;
        }
        $defender->defense_json = $defenseFinal;
        $defender->ships_json = $defSurv;
        $defender->version++;
        $defender->save();

        // 攻方存活舰随队返航（战利品入 cargo）
        // 2026-09-29 修复（ALPHA 读码发现，本局 duration_s=2s 与实耗同量级故未观测到差异）：
        // 返程时长原先取 `ruleset_snapshot_json.duration_s`——那是**配置的总时长**，
        // 不是去程实际耗时。而 transport/scout/colonize 分支统一用
        // `diffInSeconds(depart_at, arrive_at)` 实耗，同一语义两套算法。
        // 这里改成实耗，与其余分支一致。
        $outboundSeconds = max(0, (int) $now->floatDiffInSeconds(
            \Carbon\Carbon::parse((string) $task->arrive_at),
        ));
        DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
            'status' => 'returning',
            'settle_phase' => 'arrive',
            'ships_json' => json_encode($attSurv),
            'cargo_m' => $loot['M'], 'cargo_c' => $loot['C'], 'cargo_d' => $loot['D'],
            'arrive_at' => $now->copy()->addSeconds($outboundSeconds),
        ]);

        $result = [
            'loot' => $loot, 'debris' => $debris,
            'attacker_survivors' => $attSurv, 'defender_survivors' => $defSurv,
            'attacker_losses' => $attLost, 'defender_losses' => $defLost,
            'defense_survivors' => $defDefSurv, 'defense_losses' => $defDefLost, 'defense_repaired' => $repaired,
            'moon_chance' => (int) min(
                intdiv((int) floor($debris['M'] + $debris['C']), MoonService::DEBRIS_PER_PERCENT),
                MoonService::MAX_CHANCE,
            ),
            'moon_created' => $moonPlanetId,
        ];
        DB::table('battle_snapshots')->insert([
            'battle_id' => $battleId,
            'command_id' => $task->command_id,
            'ruleset_id' => $ruleset->id,
            'engine_version' => 'rust-classic-ffi-spec-v0.1',
            'seed' => $input['seed'],
            'participants_json' => json_encode($input, JSON_UNESCAPED_UNICODE),
            'rounds_json' => json_encode($battle['output']['rounds'] ?? [], JSON_UNESCAPED_UNICODE),
            'result_json' => json_encode($result, JSON_UNESCAPED_UNICODE),
            'snapshot_at' => $now,
            'settled_at' => $now,
            'snapshot_version' => (int) $defender->version,
        ]);

        // 2026-09-29 修复（多人对抗实测，BRAVO 与 DELTA 各自独立发现）：
        // 原先这里只记了**攻方**的一条正向 plunder 流水，却把**防守方**的 planet_id 盖在上面，
        // 且防守方的支出侧完全没有流水。后果是按 owner 对账会得出「防守方凭空进账」，
        // 被掠夺方无法从自己的账本审计战损。改为双边记账：攻方入账为正、守方出账为负。
        $this->ledger->record($task->command_id, (int) $task->owner_id, (int) $defender->id, null,
            ['M' => $loot['M'], 'C' => $loot['C'], 'D' => $loot['D']],
            'plunder', (string) $defender->id, $battleId);
        $this->ledger->record($task->command_id, (int) $defender->owner_id, (int) $defender->id, null,
            ['M' => -$loot['M'], 'C' => -$loot['C'], 'D' => -$loot['D']],
            'plunder', (string) $task->owner_id, $battleId);

        // 2026-09-29：被袭方此前没有任何形式的被袭通知——战报读面按发起方归因（已另行修复），
        // announcements / game_outbox 全空，玩家只能靠轮询 state 做 diff 才察觉被打。
        // 这里补一条入站事件，让「被打了」成为可观测事实。
        $this->notifyDefender($defender, (string) $task->command_id, $battleId, $loot, $input);

        return $battleId;
    }

    /**
     * 被袭通知（入站事件）。
     *
     * 落 `game_outbox`（事件流，供客户端增量拉取）而不是 `announcements`
     * ——后者是运营广播位（GM 全服公告），语义不同，不该混用。
     *
     * ⚠ `game_outbox.command_id` 有指向 `game_commands.command_id` 的**外键**
     * （migration 2026_09_22_000003 注释里明写「InnoDB 合法，属设计意图」），
     * 所以这里必须写真实的发起方 command_id，不能写 battle_id——
     * 首次实现时误写 battle_id，5 个 raid 测试全挂在 FK 上。
     *
     * 攻方 owner 从 `$input['attacker_fleets'][*]['owner_id']` 取（runBattle 的真实入参结构），
     * 目标坐标从被守 Planet 的 galaxy/system_pos/orbit 组装。
     */
    private function notifyDefender(Planet $defender, string $commandId, string $battleId, array $loot, array $input): void
    {
        $attackerOwnerId = 0;
        foreach (($input['attacker_fleets'] ?? []) as $f) {
            if (is_array($f) && (int) ($f['owner_id'] ?? 0) > 0) {
                $attackerOwnerId = (int) $f['owner_id'];
                break;
            }
        }
        $loss = ['M' => 0.0, 'C' => 0.0, 'D' => 0.0];
        foreach (['M', 'C', 'D'] as $res) {
            $loss[$res] = -1.0 * (float) ($loot[$res] ?? 0.0);
        }
        DB::table('game_outbox')->insert([
            'command_id' => $commandId,
            'event_type' => 'player.raid_inbound',
            'payload_json' => json_encode([
                'owner_id' => (int) $defender->owner_id,
                'attacker_owner_id' => $attackerOwnerId,
                'battle_id' => $battleId,
                'target_coords' => sprintf('%d:%d:%d', (int) $defender->galaxy, (int) $defender->system_pos, (int) $defender->orbit),
                'loss' => $loss,
            ], JSON_UNESCAPED_UNICODE),
            'published_at' => now(),
            'created_at' => now(),
        ]);
    }

    /**
     * 掠夺结算（GDD-04 三重限制：合法库存 × LOOT_RATE × 存活剩余货舱），两种分配模式：
     * - 缺省 sequential：M→C→D 顺序装舱（既有口径）。
     * - COMBAT.LOOT_SPLIT=classic_thirds（经典 0.84 battle.php:108-150 同构）：
     *   货舱按 1/3 金属、1/2 晶体、余量重氢设上限装舱，不足部分回流按序再分配。
     * 同时扣减防守方库存。
     *
     * @param array<string,int> $attSurv
     * @return array{M:float,C:float,D:float}
     */
    private function plunder(Planet $defender, array $attSurv, Ruleset $ruleset): array
    {
        $lootRate = $ruleset->getFloat('COMBAT.LOOT_RATE');
        $cargoRoom = 0.0;
        foreach ($attSurv as $ship => $n) {
            $cargoRoom += (float) $ruleset->get('SHIP.' . $ship)['cargo'] * $n;
        }

        $available = [];
        foreach (['M', 'C', 'D'] as $res) {
            $col = 'inv_' . strtolower($res);
            $legal = (float) $defender->$col - (float) $defender->{'reserved_' . strtolower($res)};
            $available[$res] = max(0.0, $legal) * $lootRate;
        }

        $split = null;
        try {
            $split = $ruleset->get('COMBAT.LOOT_SPLIT');
        } catch (RulesetRefusedException) {
            // 键缺失（真实 RC1）→ sequential
        }
        $loot = ['M' => 0.0, 'C' => 0.0, 'D' => 0.0];

        if ($split === 'classic_thirds') {
            $capM = $cargoRoom / 3.0;
            $capC = $cargoRoom / 2.0;
            $caps = ['M' => $capM, 'C' => $capC, 'D' => max(0.0, $cargoRoom - $capM - $capC)];
            foreach (['M', 'C', 'D'] as $res) {
                $loot[$res] = min($available[$res], $caps[$res]);
            }
            // 不足部分回流：剩余舱位按 M→C→D 顺序二次填装
            $left = $cargoRoom - array_sum($loot);
            foreach (['M', 'C', 'D'] as $res) {
                if ($left <= 0.0) {
                    break;
                }
                $add = min(max(0.0, $available[$res] - $loot[$res]), $left);
                $loot[$res] += $add;
                $left -= $add;
            }
        } else {
            foreach (['M', 'C', 'D'] as $res) {
                $take = min($available[$res], $cargoRoom - array_sum($loot));
                $loot[$res] = max(0.0, $take);
            }
        }

        foreach ($loot as $res => $take) {
            $col = 'inv_' . strtolower($res);
            $defender->$col -= $take;
        }
        return $loot;
    }

    /**
     * 统一战斗入口（raid 与反侦察共用）：构造 BattleInput（spec §3）→ 调引擎 → 输出键还原舰名。
     * 科技增益由协调器预乘入 stat×(1+TECH_GAIN×L)。种子 = sha256(battleId) 前 4 字节（确定性）。
     *
     * @param array<string,int> $attShips @param array<string,int> $defShips
     * @param array<string,int> $attTechs @param array<string,int> $defTechs
     * @return array{input:array,output:array,att_survivors:array,def_survivors:array,att_losses:array,def_losses:array}
     */
    public function runBattle(array $attShips, string $attFleetRef, int $attOwnerId, array $attTechs,
                              array $defShips, string $defFleetRef, int $defOwnerId, array $defTechs,
                              string $battleId, Ruleset $ruleset, array $defDefense = []): array
    {
        $k = $ruleset->getFloat('COMBAT.TECH_GAIN');
        [$attUnits, $attMap] = $this->mkUnits($attShips, $attTechs, $ruleset, $k, 'SHIP.');
        [$defUnits, $defMap] = $this->mkUnits($defShips, $defTechs, $ruleset, $k, 'SHIP.');

        // 防御设施以第二防守舰队编入（经典语义：防御参战、无速射）
        $defenderFleets = [['fleet_mission_id' => $defFleetRef, 'owner_id' => $defOwnerId, 'units' => $defUnits]];
        if ($defDefense !== []) {
            [$defDefUnits, $defDefMap] = $this->mkUnits($defDefense, $defTechs, $ruleset, $k, 'DEFENSE.');
            $defenderFleets[] = ['fleet_mission_id' => 'defense', 'owner_id' => $defOwnerId, 'units' => $defDefUnits];
            $defMap += $defDefMap;
        }

        $input = [
            'attacker_fleets' => [['fleet_mission_id' => $attFleetRef, 'owner_id' => $attOwnerId, 'units' => $attUnits]],
            'defender_fleets' => $defenderFleets,
            // 种子确定性派生（spec §3 null 行为由引擎侧 hash32 实现；此处显式传 u32）
            'seed' => unpack('N', hash('sha256', $battleId, true))[1] & 0x7FFFFFFF,
            'max_rounds' => 6,
        ];
        $output = $this->engine->simulate($input);

        return [
            'input' => $input,
            'output' => $output,
            'att_survivors' => $this->toNames($output['attacker_survivors'] ?? [], $attMap),
            'def_survivors' => $this->toNames($output['defender_survivors'] ?? [], $defMap),
            'att_losses' => $this->toNames($output['attacker_losses'] ?? [], $attMap),
            'def_losses' => $this->toNames($output['defender_losses'] ?? [], $defMap),
        ];
    }

    /**
     * 损毁对象 → 残骸 {M, C}：M/C 成本 × 比率（氘不成残骸，GDD-04）。
     * $family = 'SHIP.' 或 'DEFENSE.'（两族造价键同名异域）。
     *
     * @param array<string,int> $losses 对象名 => 数量
     * @return array{M:float,C:float}
     */
    public static function debrisOf(array $losses, Ruleset $ruleset, float $rate, string $family = 'SHIP.'): array
    {
        $debris = ['M' => 0.0, 'C' => 0.0];
        foreach ($losses as $ship => $n) {
            $n = (int) $n;
            if ($n <= 0) {
                continue;
            }
            $u = $ruleset->get($family . $ship);
            $debris['M'] += (float) $u['M'] * $n * $rate;
            $debris['C'] += (float) $u['C'] * $n * $rate;
        }
        return $debris;
    }

    /**
     * 舰船表 → 引擎 units 映射。返回 [units, 舰名→unit_id 映射]。
     * $family = 'SHIP.' 或 'DEFENSE.'（防御设施同规格参战）；unit_id 读配置
     * （CR-004 A 回填上游数值 ID）；缺省回退 crc32(名字)（引擎契约要求数值）。
     *
     * @param array<string,int> $ships @param array<string,int> $techs
     * @return array{0:array<string,mixed>,1:array<string,int>}
     */
    private function mkUnits(array $ships, array $techs, Ruleset $ruleset, float $k, string $family = 'SHIP.'): array
    {
        $units = [];
        $idOf = [];
        foreach ($ships as $ship => $n) {
            $n = (int) $n;
            if ($n <= 0) {
                continue;
            }
            $u = $ruleset->get($family . $ship);
            // 引擎契约：unit_id 必须为数值（as_i64）。配置有数值则归一取整（CR-004 A 回填上游
            // 204/205/210 等）；否则以 crc32(舰名) 作确定性内部 ID（纯标识、非 Balance 常数），
            // 输出经 idOf 映射还原舰名，落库/快照无 ID 泄漏。
            $raw = $u['unit_id'] ?? null;
            $uid = is_int($raw) ? $raw
                : (is_string($raw) && preg_match('/^\d+$/', $raw) ? (int) $raw : crc32($ship));
            $idOf[$ship] = $uid;
            $idOf[$ship] = $uid;
            // RC1 舰船属性键为 A/S/H（审计口径）；spec 键为 attack/shield/hull——两者兼容读取，
            // 同值异名非 TBD（CR-004 A 统一命名候选）。
            $units[$uid] = ['spec' => [
                'unit_id' => $uid,
                'attack' => (float) ($u['attack'] ?? $u['A']) * (1 + $k * ($techs['WEAPONS'] ?? 0)),
                'shield' => (float) ($u['shield'] ?? $u['S']) * (1 + $k * ($techs['SHIELD'] ?? 0)),
                'hull' => (float) ($u['hull'] ?? $u['H']) * (1 + $k * ($techs['ARMOUR'] ?? 0)),
                'rapidfire' => $u['rapidfire'] ?? new \stdClass(),
            ], 'amount' => $n];
        }
        return [$units, $idOf];
    }

    /** 引擎输出（unit_id 键）→ 舰名键；未知 ID 原样保留。 */
    private function toNames(array $byUnitId, array $idOf): array
    {
        $nameOf = array_map('strval', array_flip($idOf));
        $out = [];
        foreach ($byUnitId as $uid => $n) {
            $name = $nameOf[(string) $uid] ?? (string) $uid;
            $out[$name] = ((int) ($out[$name] ?? 0)) + (int) $n;
        }
        return array_filter($out, fn ($n) => $n > 0);
    }

    /** @return array<string,int> */
    private function techsOf(int $ownerId): array
    {
        $row = DB::table('civilizations')->where('owner_id', $ownerId)->first();
        return $row ? (array) json_decode($row->techs_json, true) : [];
    }

    /** 确定性判定种子：sha256 前 4 字节（大端）mod 100（与 ScoutArrivalService 同口径）。 */
    private static function seedMod100(string $key): int
    {
        return unpack('N', hash('sha256', $key, true))[1] % 100;
    }
}
