<?php

declare(strict_types=1);

namespace App\Domain\Research;

use App\Models\Civilization;
use Illuminate\Support\Facades\DB;

/**
 * ResearchCompletionService：到期研究结算。
 * 文明锁释放在同事务内（research_active=null）；重复触发幂等跳过。
 */
class ResearchCompletionService
{
    /** 结算单个到期研究任务。 */
    public function complete(int $taskId): void
    {
        DB::transaction(function () use ($taskId) {
            $task = DB::table('research_tasks')->where('id', $taskId)->lockForUpdate()->first();
            if ($task === null || $task->status !== 'executing') {
                return;   // 幂等
            }
            /** @var Civilization|null $civ */
            $civ = Civilization::query()->where('owner_id', $task->owner_id)->lockForUpdate()->first();
            if ($civ === null) {
                throw new \RuntimeException("research_tasks#{$taskId} 文明缺失");
            }

            $techs = $civ->techs_json ?? [];
            $techs[$task->tech] = (int) $task->target_level;   // 以任务快照为准（GDD-10 锁定）
            $civ->techs_json = $techs;

            $active = $civ->research_active;
            if ($active !== null && (int) ($active['task_id'] ?? 0) === $taskId) {
                $civ->research_active = null;   // 释放文明研究锁
            }
            $civ->version++;
            $civ->save();

            DB::table('research_tasks')->where('id', $taskId)->update(['status' => 'done']);
        });
    }
}
