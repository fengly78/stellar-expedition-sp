<?php

declare(strict_types=1);

namespace App\Domain\Ledger;

use App\Models\ResourceTransaction;

/**
 * Ledger 写入器：同事务内解释来源去向（§07.3）。
 * 不是可花费钱包——权威余额永远在 planets/fleet_tasks 实际状态列。
 */
class LedgerWriter
{
    /**
     * @param array{M?:float,C?:float,D?:float} $amounts 正=入，负=出
     */
    public function record(
        string $commandId,
        int $ownerId,
        ?int $planetId,
        ?int $fleetId,
        array $amounts,
        string $operation,
        ?string $sourceRef = null,
        ?string $targetRef = null,
    ): void {
        foreach (['M', 'C', 'D'] as $res) {
            $amount = $amounts[$res] ?? 0.0;
            if ($amount == 0.0) {
                continue;
            }
            $tx = new ResourceTransaction();
            $tx->command_id = $commandId;
            $tx->owner_id = $ownerId;
            $tx->planet_id = $planetId;
            $tx->fleet_id = $fleetId;
            $tx->resource = $res;
            $tx->amount_signed = $amount;
            $tx->operation = $operation;
            $tx->source_ref = $sourceRef;
            $tx->target_ref = $targetRef;
            $tx->created_at = now();
            $tx->save();
        }
    }
}
