<?php

declare(strict_types=1);

namespace App\Domain\Shipyard;

use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * ShipOrderCompletionService：到期造船批次结算——整批入港（ships_json 互斥口径：在建→在港）。
 * 重复触发幂等跳过；批次与库存变更同事务。
 */
class ShipOrderCompletionService
{
    public function complete(int $orderId): void
    {
        DB::transaction(function () use ($orderId) {
            $order = DB::table('ship_orders')->where('id', $orderId)->lockForUpdate()->first();
            if ($order === null || $order->status !== 'executing') {
                return;   // 幂等
            }
            /** @var Planet|null $planet */
            $planet = Planet::query()->where('id', $order->planet_id)->lockForUpdate()->first();
            if ($planet === null) {
                throw new \RuntimeException("ship_orders#{$orderId} 行星缺失");
            }

            $snapshot = json_decode((string) $order->cost_snapshot_json, true) ?? [];
            $kind = (string) ($snapshot['kind'] ?? 'ship');

            if ($kind === 'defense') {
                // 防御设施入 defense_json（SOURCE-02 防御玩法）
                $defense = $planet->defense_json ?? [];
                $defense[$order->ship] = (int) ($defense[$order->ship] ?? 0) + (int) $order->amount;
                $planet->defense_json = $defense;
            } else {
                $ships = $planet->ships_json ?? [];
                $ships[$order->ship] = (int) ($ships[$order->ship] ?? 0) + (int) $order->amount;
                $planet->ships_json = $ships;
            }
            $planet->version++;
            $planet->save();

            DB::table('ship_orders')->where('id', $orderId)->update(['status' => 'done']);
        });
    }
}
