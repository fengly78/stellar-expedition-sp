<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Debris\DebrisFieldService;
use App\Domain\Fleet\FlightService;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Production\ProductionSettlement;
use App\Domain\Ruleset\Ruleset;
use App\Models\Civilization;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * FLEET_DISPATCH（API-01 §3）：出发事务——移船+移货+燃料+占槽+任务创建，
 * 任一步失败整体回滚（总线事务保证）。
 *
 * 校验：舰船在港（在途不可再派）、货舱物理量（不用 V 折算）、槽位 F-06（2+COMPUTER）。
 * 出发保护校验挂钩：ProtectionService 细则属 API-01 §10 TBD#2（GDD-09），此处不留死代码，
 * 挂钩点在 handle() 内注释标明，细则批准后接入。
 *
 * payload: {"planet_id": int, "mission": "transport|colonize|raid|scout",
 *           "ships": {"LIGHT": 10, ...}, "cargo": {"M":..,"C":..,"D":..},
 *           "target": "g:s:p", "speed_pct": 100}
 */
class FleetDispatchHandler implements CommandHandler
{
    public function __construct(
        private readonly FlightService $flight,
        private readonly ProductionSettlement $production,
        private readonly LedgerWriter $ledger,
        private readonly DebrisFieldService $debris,
    ) {
    }

    public function type(): string
    {
        return 'FLEET_DISPATCH';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        $p = $cmd->payload;
        if (!isset($p['planet_id'], $p['mission'], $p['ships'], $p['target'])) {
            throw new CommandRejectedException('缺少 planet_id/mission/ships/target');
        }
        if (!in_array($p['mission'], ['transport', 'colonize', 'raid', 'scout', 'recycle'], true)) {
            throw new CommandRejectedException("非法任务类型：{$p['mission']}");
        }
        if (!is_array($p['ships']) || $p['ships'] === []) {
            throw new CommandRejectedException('ships 为空');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $p = $cmd->payload;
        $planetId = (int) $p['planet_id'];
        /** @var array<string,int> $ships */
        $ships = $p['ships'];
        /** @var array{M?:float,C?:float,D?:float} $cargo */
        $cargo = $p['cargo'] ?? [];
        $speedPct = (float) ($p['speed_pct'] ?? 100);

        /** @var Planet|null $planet */
        $planet = Planet::query()->where('id', $planetId)->lockForUpdate()->first();
        if ($planet === null || (int) $planet->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException("行星不存在或不归 Owner：{$planetId}");
        }
        /** @var Civilization|null $civ */
        $civ = Civilization::query()->where('owner_id', $cmd->ownerId)->lockForUpdate()->first();
        if ($civ === null) {
            throw new CommandRejectedException('文明不存在');
        }

        // 槽位 F-06：2 + COMPUTER
        $slots = 2 + $civ->techLevel('COMPUTER');
        if ($civ->mission_slots_used >= $slots) {
            throw new CommandRejectedException("任务槽已满（{$civ->mission_slots_used}/{$slots}，F-06）");
        }

        // 舰船在港校验（在途/在建不可再派——ships_json 互斥口径）
        $inPort = $planet->ships_json ?? [];
        foreach ($ships as $ship => $n) {
            if ((int) ($inPort[$ship] ?? 0) < $n) {
                throw new CommandRejectedException("在港 {$ship} 不足：需 {$n}，有 " . (int) ($inPort[$ship] ?? 0));
            }
        }

        // 货舱物理量校验（不用 V 折算，API-01 §3）；引擎科技映射（SOURCE-02，配置驱动缺键即关）
        $capacity = 0.0;
        $slowest = PHP_FLOAT_MAX;
        $baseFuel = [];
        $speeds = [];
        foreach ($ships as $ship => $n) {
            $unit = $ruleset->get('SHIP.' . $ship);   // speed/fuel/cargo 待 CR-003 B，缺键 fail-closed
            $capacity += (float) $unit['cargo'] * $n;
            $speeds[$ship] = (float) $unit['speed'];
            $baseFuel[$ship] = (float) $unit['fuel'];
        }
        $engines = $this->flight->applyEngineTechs($ships, $speeds, $baseFuel, (array) $civ->techs_json, $ruleset);
        $speeds = $engines['speeds'];
        $baseFuel = $engines['fuel'];
        $slowest = min($speeds);
        $cargoTotal = (float) ($cargo['M'] ?? 0) + (float) ($cargo['C'] ?? 0) + (float) ($cargo['D'] ?? 0);
        if ($cargoTotal > $capacity) {
            throw new CommandRejectedException("货舱超限：载货 {$cargoTotal} > 容量 {$capacity}");
        }

        $now = Carbon::now('UTC');
        $this->production->settle($planet, $ruleset, $now, $cmd->commandId);   // §06.1：先结算再移货

        // 库存校验（货 + 燃料）
        foreach (['M', 'C', 'D'] as $res) {
            if ($planet->spendable($res) < (float) ($cargo[$res] ?? 0)) {
                throw new CommandRejectedException("库存不足：{$res} 货载超出可花费量");
            }
        }
        $from = ['galaxy' => (int) $planet->galaxy, 'system' => (int) $planet->system_pos, 'orbit' => (int) $planet->orbit];
        $to = FlightService::parseCoords((string) $p['target']);

        // 出发时目标校验（2026-09-24 修复：抵达结算遇不存在目标会抛错滞留任务）：
        // transport/raid/scout 需目标行星存在；colonize 需空轨道（抵达仍再校验，防竞态）
        $targetExists = Planet::query()->where('galaxy', $to['galaxy'])
            ->where('system_pos', $to['system'])->where('orbit', $to['orbit'])->exists();
        if (in_array($p['mission'], ['transport', 'raid', 'scout'], true) && ! $targetExists) {
            throw new CommandRejectedException("目标行星不存在：{$p['target']}");
        }
        if ($p['mission'] === 'colonize' && $targetExists) {
            throw new CommandRejectedException("殖民目标坐标已被占用：{$p['target']}");
        }
        // 2026-09-29 补 recycle（残骸回收）：目标**不需要有行星**，但必须有残骸。
        // 在出发侧就挡住空跑一趟——否则玩家白烧燃料、白等一个来回。
        if ($p['mission'] === 'recycle') {
            $at = $this->debris->at($to['galaxy'], $to['system'], $to['orbit']);
            if ($at === null || ($at['M'] <= 0.0 && $at['C'] <= 0.0)) {
                throw new CommandRejectedException("该坐标没有可回收的残骸：{$p['target']}");
            }
        }

        $distance = $this->flight->distance($from, $to, $ruleset);
        $fuel = $this->flight->fuelCost($ships, $baseFuel, $speeds, $distance, $speedPct, $ruleset);
        if ($planet->spendable('D') < (float) ($cargo['D'] ?? 0) + $fuel) {
            throw new CommandRejectedException("氘不足：货载+燃料需 " . ((float) ($cargo['D'] ?? 0) + $fuel));
        }

        // 出发事务：移船 + 移货 + 燃料 + 占槽 + 任务创建
        foreach ($ships as $ship => $n) {
            $inPort[$ship] = (int) $inPort[$ship] - $n;
        }
        $planet->ships_json = $inPort;
        foreach (['M', 'C', 'D'] as $res) {
            $col = 'inv_' . strtolower($res);
            $planet->$col -= (float) ($cargo[$res] ?? 0);
        }
        $planet->inv_d -= $fuel;
        $planet->version++;
        $planet->save();

        $civ->mission_slots_used++;
        $civ->version++;
        $civ->save();

        $taskId = \Illuminate\Support\Str::uuid()->toString();
        $duration = $this->flight->durationSeconds($distance, $slowest, $speedPct, $ruleset);
        DB::table('fleet_tasks')->insert([
            'task_id' => $taskId,
            'command_id' => $cmd->commandId,
            'owner_id' => $cmd->ownerId,
            'mission' => (string) $p['mission'],
            'status' => 'outbound',
            'ships_json' => json_encode($ships),
            'cargo_m' => (float) ($cargo['M'] ?? 0),
            'cargo_c' => (float) ($cargo['C'] ?? 0),
            'cargo_d' => (float) ($cargo['D'] ?? 0),
            'origin_planet_id' => $planetId,
            'target_coords' => (string) $p['target'],
            'ruleset_snapshot_json' => json_encode([
                'ruleset_id' => $ruleset->id, 'distance' => $distance, 'fuel' => $fuel,
                'duration_s' => $duration, 'speed_pct' => $speedPct,
            ]),
            'depart_at' => $now,
            'arrive_at' => $now->copy()->addSeconds($duration),
        ]);

        $this->ledger->record($cmd->commandId, $cmd->ownerId, $planetId, null,
            ['M' => -(float) ($cargo['M'] ?? 0), 'C' => -(float) ($cargo['C'] ?? 0),
             'D' => -((float) ($cargo['D'] ?? 0) + $fuel)],
            'transport', (string) $p['planet_id'], (string) $p['target']);

        return ['task_id' => $taskId, 'distance' => $distance, 'fuel' => $fuel,
                'duration_seconds' => $duration];
    }
}
