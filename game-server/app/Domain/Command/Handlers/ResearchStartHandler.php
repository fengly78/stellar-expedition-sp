<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Formulas;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Prerequisites;
use App\Domain\Production\ProductionSettlement;
use App\Domain\Ruleset\Ruleset;
use App\Models\Civilization;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * RESEARCH_START（API-01 §3）：文明同时至多 1 项研究；启动时扣**当地**库存。
 *
 * 锁顺序 §4：文明行 FOR UPDATE 在前（研究锁），行星行在后（库存）。
 * payload: {"planet_id": int, "tech": string}
 */
class ResearchStartHandler implements CommandHandler
{
    public function __construct(
        private readonly ProductionSettlement $production,
        private readonly LedgerWriter $ledger,
    ) {
    }

    public function type(): string
    {
        return 'RESEARCH_START';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        if (!isset($cmd->payload['planet_id'], $cmd->payload['tech'])) {
            throw new CommandRejectedException('缺少 planet_id 或 tech');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $planetId = (int) $cmd->payload['planet_id'];
        $tech = (string) $cmd->payload['tech'];

        /** @var Civilization|null $civ */
        $civ = Civilization::query()->where('owner_id', $cmd->ownerId)->lockForUpdate()->first();
        if ($civ === null) {
            throw new CommandRejectedException('文明不存在');
        }
        if ($civ->research_active !== null) {
            throw new CommandRejectedException('文明已有进行中的研究（同时至多 1 项）');
        }

        /** @var Planet|null $planet */
        $planet = Planet::query()->where('id', $planetId)->lockForUpdate()->first();
        if ($planet === null || (int) $planet->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException("行星不存在或不归 Owner：{$planetId}");
        }

        Prerequisites::check($ruleset, 'TECH.' . $tech, $planet, $civ);

        $now = Carbon::now('UTC');
        $this->production->settle($planet, $ruleset, $now, $cmd->commandId);   // §06.1：先结算再支付

        $targetLevel = $civ->techLevel($tech) + 1;
        $cost = Formulas::upgradeCost($ruleset->get('TECH.' . $tech), $targetLevel);
        foreach (['M', 'C', 'D'] as $res) {
            if ($planet->spendable($res) < $cost[$res]) {
                throw new CommandRejectedException("当地库存不足，无法启动 {$tech} L{$targetLevel}");
            }
        }
        foreach (['M', 'C', 'D'] as $res) {
            $col = 'inv_' . strtolower($res);
            $planet->$col -= $cost[$res];
        }
        $planet->version++;
        $planet->save();

        $this->ledger->record($cmd->commandId, $cmd->ownerId, $planetId, null,
            ['M' => -$cost['M'], 'C' => -$cost['C'], 'D' => -$cost['D']],
            'research', null, "{$tech} L{$targetLevel}");

        $taskId = DB::table('research_tasks')->insertGetId([
            'owner_id' => $cmd->ownerId,
            'tech' => $tech,
            'target_level' => $targetLevel,
            'cost_snapshot_json' => json_encode($cost),
            'ruleset_id' => $ruleset->id,
            'status' => 'executing',
            'complete_at' => $now->copy()->addSeconds($this->researchTimeSeconds($cost, $ruleset)),
        ]);

        // 文明研究锁：任务引用即锁，完成 Worker 释放（E1-S2 Worker 与建筑同构）
        $civ->research_active = ['task_id' => $taskId, 'tech' => $tech, 'since' => $now->toIso8601String()];
        $civ->version++;
        $civ->save();

        return ['task_id' => $taskId, 'tech' => $tech, 'target_level' => $targetLevel, 'cost' => $cost];
    }

    /**
     * 研究时长（秒）：F-08 同族 RESEARCH.TIME 配置（upstream 式，分子按上游研究口径 M+C）。
     * 配置缺键/TBD → fail-closed（与 BuildStartHandler 同纪律）。
     */
    private function researchTimeSeconds(array $cost, Ruleset $ruleset): int
    {
        $tm = $ruleset->get('RESEARCH.TIME');
        if (($tm['model'] ?? null) !== 'upstream') {
            throw new CommandRejectedException('RESEARCH.TIME.model 仅支持 upstream（F-08 口径）');
        }
        $denominator = $tm['constant'] * (1 + $tm['lab_factor'])
            * $tm['universe_speed'];
        return max((int) $tm['t_min_seconds'],
            (int) ceil(3600 * ($cost['M'] + $cost['C']) / $denominator));
    }
}
