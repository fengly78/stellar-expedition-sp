<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\PreserveFloatJson;
use Illuminate\Database\Eloquent\Model;

/**
 * game_rulesets：版本化配置（GDD-10：版本/哈希/生效时点/废弃状态）。
 * content_json 为完整参数集；content_hash 为 sha256（canonical JSON），缺失/TBD 拒绝启用。
 * cast 用 PreserveFloatJson：整值浮点（如 g=2.0）必须保留 ".0"，否则入库往返后哈希失配。
 */
class GameRuleset extends Model
{
    protected $table = 'game_rulesets';

    public $timestamps = false;

    public const STATUS_CANDIDATE = 'candidate';
    public const STATUS_TESTING = 'testing';
    public const STATUS_FROZEN = 'frozen';
    public const STATUS_DEPRECATED = 'deprecated';

    protected $fillable = [
        'ruleset_name', 'version', 'content_hash', 'status',
        'effective_at', 'deprecated_at', 'content_json', 'created_at',
    ];

    protected $casts = [
        'content_json' => PreserveFloatJson::class,
        'effective_at' => 'datetime',
        'deprecated_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}
