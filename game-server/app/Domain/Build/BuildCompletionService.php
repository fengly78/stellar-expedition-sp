<?php

declare(strict_types=1);

namespace App\Domain\Build;

use App\Domain\Production\ProductionSettlement;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * BuildCompletionService：到期建造任务结算（§4 锁顺序：行星行锁）。
 *
 * 纪律（§06.1）：先 settle 生产到 complete_at，再升级建筑等级——
 * 升级前后的时段按各自速率分段，绝不用新速率回溯旧时段。
 * 完成后续排由调用方（Worker）以系统 BUILD_START 命令走总线，
 * 命令幂等键确定性派生（buildstart-{task_id}），重试不重复扣费。
 */
class BuildCompletionService
{
    public function __construct(
        private readonly ProductionSettlement $production,
    ) {
    }

    /**
     * 结算单个到期任务。返回下一待建建筑（无则 null），供 Worker 决定是否触发 BUILD_START。
     */
    public function complete(int $taskId, Ruleset $ruleset): ?string
    {
        return DB::transaction(function () use ($taskId, $ruleset) {
            $task = DB::table('build_tasks')->where('id', $taskId)->lockForUpdate()->first();
            if ($task === null || $task->status !== 'executing') {
                return null;    // 幂等：重复触发/已取消不重复结算
            }
            /** @var Planet|null $planet */
            $planet = Planet::query()->where('id', $task->planet_id)->lockForUpdate()->first();
            if ($planet === null) {
                throw new \RuntimeException("build_tasks#{$taskId} 行星缺失");
            }

            $completeAt = Carbon::parse($task->complete_at, 'UTC');
            // 先结算到完成时刻（旧速率），再升级
            $this->production->settle($planet, $ruleset, $completeAt);

            $levels = $planet->levels_json ?? [];
            $levels[$task->building] = (int) ($levels[$task->building] ?? 0) + 1;
            if ($levels[$task->building] !== (int) $task->target_level) {
                // 快照与状态分叉：以任务快照为准并留痕（防御性，正常不会发生）
                $levels[$task->building] = (int) $task->target_level;
            }
            $planet->levels_json = $levels;
            $planet->version++;
            $planet->save();

            DB::table('build_tasks')->where('id', $taskId)
                ->update(['status' => 'done']);

            $queue = $planet->queue_building ?? [];
            return $queue === [] ? null : (string) $queue[0]['building'];
        });
    }
}
