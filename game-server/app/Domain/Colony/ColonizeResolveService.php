<?php

declare(strict_types=1);

namespace App\Domain\Colony;

use App\Domain\Command\CommandRejectedException;
use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * ColonizeResolveService：殖民抵达结算（API-01 §3 COLONIZE_RESOLVE）。
 *
 * 纪律：**抵达时**再校验空轨道与殖民容量（出发时不保证）：
 * - 空轨道：uq_coords 唯一约束 + 显式检查双层。
 * - 容量 F-06：colony_cap = 1 + ceil(ASTRO/2)；当前行星数 ≥ 容量 → 拒绝（殖民舰随队返航，不损失）。
 * - 成功：消耗 1 艘殖民舰，建新行星，携带货物转入新行星库存。
 */
class ColonizeResolveService
{
    /**
     * 结算殖民抵达。返回 ['colonized' => bool, 'planet_id' => ?int]。
     * 失败（轨道占用/容量满）返回 colonized=false，由调用方转返航（舰队与货物不损失）。
     */
    public function resolve(object $task): array
    {
        return DB::transaction(function () use ($task) {
            [$g, $s, $o] = array_map('intval', explode(':', $task->target_coords));

            $occupied = Planet::query()->where('galaxy', $g)->where('system_pos', $s)->where('orbit', $o)
                ->where('is_moon', false)   // 月球与行星同槽共存（经典），不阻殖民
                ->exists();
            if ($occupied) {
                return ['colonized' => false, 'planet_id' => null, 'reason' => '轨道已被占用'];
            }

            $civ = DB::table('civilizations')->where('owner_id', $task->owner_id)->lockForUpdate()->first();
            if ($civ === null) {
                throw new CommandRejectedException('文明不存在');
            }
            $techs = (array) json_decode($civ->techs_json, true);
            $astro = (int) ($techs['ASTRO'] ?? 0);
            $cap = 1 + (int) ceil($astro / 2);   // F-06
            $planetCount = Planet::query()->where('owner_id', $task->owner_id)
                ->where('is_moon', false)   // F-06 上限只计行星（经典：月球不计）
                ->lockForUpdate()->count();
            if ($planetCount >= $cap) {
                return ['colonized' => false, 'planet_id' => null, 'reason' => "殖民容量已满（{$planetCount}/{$cap}，F-06）"];
            }

            // 消耗殖民舰（组成快照锁定，扣 COLONY 一艘）
            /** @var array<string,int> $ships */
            $ships = json_decode($task->ships_json, true);
            if ((int) ($ships['COLONY'] ?? 0) < 1) {
                return ['colonized' => false, 'planet_id' => null, 'reason' => '舰队无殖民舰'];
            }
            $ships['COLONY']--;

            $planet = new Planet();
            $planet->owner_id = (int) $task->owner_id;
            $planet->galaxy = $g;
            $planet->system_pos = $s;
            $planet->orbit = $o;
            $planet->is_homeworld = false;
            $planet->inv_m = (float) $task->cargo_m;   // 携带货物转入新行星
            $planet->inv_c = (float) $task->cargo_c;
            $planet->inv_d = (float) $task->cargo_d;
            $planet->reserved_m = $planet->reserved_c = $planet->reserved_d = 0;
            $planet->levels_json = [];
            $planet->ships_json = [];
            $planet->queue_building = [];
            $planet->production_checkpoint_at = now();
            $planet->version = 0;
            $planet->save();

            // 剩余舰船返航；货物已交付新行星
            DB::table('fleet_tasks')->where('task_id', $task->task_id)->update([
                'status' => 'returning',
                'settle_phase' => 'arrive',
                'ships_json' => json_encode($ships),
                'cargo_m' => 0, 'cargo_c' => 0, 'cargo_d' => 0,
                'arrive_at' => now()->addSeconds(
                    max(0, (int) \Carbon\Carbon::parse($task->depart_at)->diffInSeconds(\Carbon\Carbon::parse($task->arrive_at)))),
            ]);

            return ['colonized' => true, 'planet_id' => (int) $planet->id];
        });
    }
}
