<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * planets：核心状态表。库存四态中 Inventory/Reserved 共享物理字段；
 * 可花费 = inv − reserved（GDD-13）。levels_json/ships_json/queue_building 为 JSON 快照列。
 */
class Planet extends Model
{
    protected $table = 'planets';

    public $timestamps = false;

    protected $fillable = [
        'owner_id', 'galaxy', 'system_pos', 'orbit', 'temp', 'is_homeworld', 'is_moon',
        'inv_m', 'inv_c', 'inv_d', 'reserved_m', 'reserved_c', 'reserved_d',
        'levels_json', 'ships_json', 'defense_json', 'queue_building',
        'production_checkpoint_at', 'version',
    ];

    protected $casts = [
        'is_homeworld' => 'boolean',
        'is_moon' => 'boolean',
        'temp' => 'integer',
        'inv_m' => 'float', 'inv_c' => 'float', 'inv_d' => 'float',
        'reserved_m' => 'float', 'reserved_c' => 'float', 'reserved_d' => 'float',
        'levels_json' => 'array',
        'ships_json' => 'array',
        'defense_json' => 'array',
        'queue_building' => 'array',
        'production_checkpoint_at' => 'datetime',
        'version' => 'integer',
    ];

    /** 建筑等级（缺键=0 级；等级口径缺省 0 不是 TBD 静默——等级天然从 0 起）。 */
    public function level(string $building): int
    {
        return (int) ($this->levels_json[$building] ?? 0);
    }

    /** 可花费库存（GDD-13：Reserved 不重复计入）。 */
    public function spendable(string $res): float
    {
        $inv = match ($res) { 'M' => $this->inv_m, 'C' => $this->inv_c, 'D' => $this->inv_d,
            default => throw new \InvalidArgumentException("未知资源：{$res}") };
        $rsv = match ($res) { 'M' => $this->reserved_m, 'C' => $this->reserved_c, 'D' => $this->reserved_d };
        return $inv - $rsv;
    }
}
