<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** civilizations：科技属于文明；文明同时至多 1 项研究（research_active 含锁）。 */
class Civilization extends Model
{
    protected $table = 'civilizations';

    public $timestamps = false;

    protected $fillable = [
        'owner_id', 'techs_json', 'research_active',
        'mission_slots_used', 'protection_state', 'version',
    ];

    protected $casts = [
        'techs_json' => 'array',
        'research_active' => 'array',
        'mission_slots_used' => 'integer',
        'version' => 'integer',
    ];

    public function techLevel(string $tech): int
    {
        return (int) ($this->techs_json[$tech] ?? 0);
    }
}
