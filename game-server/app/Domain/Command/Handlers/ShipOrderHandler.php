<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Prerequisites;
use App\Domain\Production\ProductionSettlement;
use App\Domain\Ruleset\Ruleset;
use App\Domain\Ruleset\RulesetRefusedException;
use App\Models\Civilization;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * SHIP_ORDER（API-01 §3）：整批扣费（GDD-04），批次号 = 业务幂等键。
 *
 * payload: {"planet_id": int, "ship": string, "amount": int, "batch_no": string}
 * batch_no 由调用方生成（uuid）；重复提交同 batch_no 直接拒绝（幂等由唯一约束+显式检查双层保证）。
 */
class ShipOrderHandler implements CommandHandler
{
    public function __construct(
        private readonly ProductionSettlement $production,
        private readonly LedgerWriter $ledger,
    ) {
    }

    public function type(): string
    {
        return 'SHIP_ORDER';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        $p = $cmd->payload;
        if (!isset($p['planet_id'], $p['ship'], $p['amount'], $p['batch_no'])) {
            throw new CommandRejectedException('缺少 planet_id/ship/amount/batch_no');
        }
        if ((int) $p['amount'] < 1) {
            throw new CommandRejectedException('amount 必须 ≥ 1');
        }
        if (DB::table('ship_orders')->where('batch_no', (string) $p['batch_no'])->exists()) {
            throw new CommandRejectedException('批次号已存在（重复提交）');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $planetId = (int) $cmd->payload['planet_id'];
        $ship = (string) $cmd->payload['ship'];
        $amount = (int) $cmd->payload['amount'];
        $batchNo = (string) $cmd->payload['batch_no'];

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

        // 对象族路由（SOURCE-02 防御玩法）：DEFENSE.<name> 存在 → 防御设施（入 defense_json）；
        // 否则舰船（入 ships_json）。两类名字全局不重叠。
        $isDefense = $this->isDefenseObject($ruleset, $ship);
        $family = $isDefense ? 'DEFENSE.' : 'SHIP.';

        // 船厂前置 + 对象专属前置（REQUIRES.SHIP.* / REQUIRES.DEFENSE.*，缺键 fail-closed）
        Prerequisites::check($ruleset, $family . $ship, $planet, $civ);

        // 穹顶类唯一限制：DEFENSE.<name>.max 存在时，现存量 + 在途量 + 本批 ≤ max
        // （经典：大小穹顶各 1；在途一并计数防并发下单绕过）
        $unit = $ruleset->get($family . $ship);
        if ($isDefense && isset($unit['max'])) {
            $have = (int) ($planet->defense_json[$ship] ?? 0);
            foreach (DB::table('ship_orders')
                ->where('planet_id', $planetId)->where('ship', $ship)->where('status', 'executing')->get() as $ord) {
                $snap = json_decode((string) $ord->cost_snapshot_json, true) ?? [];
                if (($snap['kind'] ?? 'ship') === 'defense') {
                    $have += (int) $ord->amount;
                }
            }
            if ($have + $amount > (int) $unit['max']) {
                throw new CommandRejectedException("{$ship} 数量超上限（现有+在途 {$have}，上限 {$unit['max']}）");
            }
        }

        $now = Carbon::now('UTC');
        $this->production->settle($planet, $ruleset, $now, $cmd->commandId);   // §06.1

        // 整批成本 = 单价 × amount（SHIP/DEFENSE 配置含 M/C/D 单价；speed/fuel/cargo 待 CR-003 B 回填）
        $cost = [
            'M' => (int) $unit['M'] * $amount,
            'C' => (int) $unit['C'] * $amount,
            'D' => (int) $unit['D'] * $amount,
        ];
        foreach (['M', 'C', 'D'] as $res) {
            if ($planet->spendable($res) < $cost[$res]) {
                throw new CommandRejectedException("当地资源不足：{$ship} ×{$amount}");
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
            'ship', null, "{$ship} ×{$amount} (batch {$batchNo})");

        DB::table('ship_orders')->insert([
            'planet_id' => $planetId,
            'batch_no' => $batchNo,
            'ship' => $ship,
            'amount' => $amount,
            'cost_snapshot_json' => json_encode(['unit' => ['M' => $unit['M'], 'C' => $unit['C'], 'D' => $unit['D']], 'amount' => $amount, 'total' => $cost, 'kind' => $isDefense ? 'defense' : 'ship']),
            'ruleset_id' => $ruleset->id,
            'status' => 'executing',
            'complete_at' => $now->copy()->addSeconds($this->shipTimeSeconds($cost, $ruleset)),
        ]);

        return ['batch_no' => $batchNo, 'ship' => $ship, 'amount' => $amount, 'total_cost' => $cost, 'kind' => $isDefense ? 'defense' : 'ship'];
    }

    /** DEFENSE.<name> 在规则集中存在 → 防御设施；否则舰船（名字两类全局不重叠）。 */
    private function isDefenseObject(Ruleset $ruleset, string $name): bool
    {
        try {
            $ruleset->get('DEFENSE.' . $name);
            return true;
        } catch (RulesetRefusedException) {
            return false;
        }
    }

    /**
     * 造船时长（秒）：F-08 同族 SHIP.TIME 配置（upstream 式：船厂/纳米机器人分母）。
     * 配置缺键/TBD → fail-closed。
     */
    private function shipTimeSeconds(array $cost, Ruleset $ruleset): int
    {
        $tm = $ruleset->get('SHIP.TIME');
        if (($tm['model'] ?? null) !== 'upstream') {
            throw new CommandRejectedException('SHIP.TIME.model 仅支持 upstream（F-08 口径）');
        }
        $denominator = $tm['constant'] * (1 + $tm['shipyard_level_S'])
            * 2 ** $tm['nanite_level_N'] * $tm['universe_speed'];
        return max((int) $tm['t_min_seconds'],
            (int) ceil(3600 * ($cost['M'] + $cost['C']) / $denominator));
    }
}
