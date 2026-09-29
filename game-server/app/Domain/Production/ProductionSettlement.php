<?php

declare(strict_types=1);

namespace App\Domain\Production;

use App\Domain\CanonicalJson;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Records the inventory effect of every production settlement in the same transaction. */
class ProductionSettlement
{
    public function __construct(
        private readonly ProductionService $production,
        private readonly LedgerWriter $ledger,
    ) {
    }

    /** @return array{M?:float,C?:float,D?:float} */
    public function settle(Planet $planet, Ruleset $ruleset, Carbon $to, ?string $commandId = null): array
    {
        $before = ['M' => (float) $planet->inv_m, 'C' => (float) $planet->inv_c, 'D' => (float) $planet->inv_d];
        $this->production->settle($planet, $ruleset, $to);

        $delta = [];
        foreach (['M' => 'inv_m', 'C' => 'inv_c', 'D' => 'inv_d'] as $res => $column) {
            $amount = (float) $planet->$column - $before[$res];
            if (abs($amount) > 1e-9) {
                $delta[$res] = $amount;
            }
        }
        if ($delta === []) {
            return [];
        }

        if ($commandId === null) {
            $commandId = (string) Str::uuid();
            $payload = ['planet_id' => (int) $planet->id, 'at' => $to->toIso8601String()];
            DB::table('game_commands')->insert([
                'command_id' => $commandId,
                'payload_hash' => CanonicalJson::hash($payload),
                'actor_kind' => 'player', 'actor_id' => 0, 'owner_id' => (int) $planet->owner_id,
                'type' => 'PRODUCTION_SETTLE',
                'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'ruleset_id' => $ruleset->id,
                'status' => 'committed', 'attempt_count' => 1,
                'submitted_at' => now(), 'committed_at' => now(),
            ]);
        }

        $this->ledger->record($commandId, (int) $planet->owner_id, (int) $planet->id, null,
            $delta, 'production', 'mine', (string) $planet->id);
        return $delta;
    }
}
