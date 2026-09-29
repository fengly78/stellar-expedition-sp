<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * game_commands：统一命令入口持久化（API-01 §1/§2）。
 * command_id 唯一 + payload_hash：同 ID 同 payload 返回已记录结果；同 ID 不同 payload 拒绝。
 */
class GameCommand extends Model
{
    protected $table = 'game_commands';

    public $timestamps = false;

    protected $fillable = [
        'command_id', 'payload_hash', 'actor_kind', 'actor_id', 'owner_id',
        'authorization_id', 'authorization_version', 'type', 'payload_json',
        'ruleset_id', 'status', 'reject_reason', 'error_class', 'attempt_count',
        'result_json', 'submitted_at', 'committed_at',
    ];

    protected $casts = [
        'payload_json' => 'array',
        'result_json' => 'array',
        'attempt_count' => 'integer',
        'submitted_at' => 'datetime',
        'committed_at' => 'datetime',
    ];
}
