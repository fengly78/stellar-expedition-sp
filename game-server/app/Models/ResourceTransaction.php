<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** resource_transactions：Ledger——解释来源去向，不是可花费钱包（设计纪律 1）。 */
class ResourceTransaction extends Model
{
    protected $table = 'resource_transactions';

    public $timestamps = false;

    protected $fillable = [
        'command_id', 'owner_id', 'planet_id', 'fleet_id', 'resource',
        'amount_signed', 'operation', 'source_ref', 'target_ref', 'created_at',
    ];

    protected $casts = [
        'amount_signed' => 'float',
        'created_at' => 'datetime',
    ];
}
