<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\Ruleset;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * FLEET_RECALL（API-01 §3）：召回在途任务。锁定范围=舰队。
 * 燃料口径按已锁定任务契约（出发时已扣全程燃料，召回不重复计费）；
 * 返航时长 = 已飞行时长（上游同构语义）。
 *
 * payload: {"task_id": string}
 */
class FleetRecallHandler implements CommandHandler
{
    public function type(): string
    {
        return 'FLEET_RECALL';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        if (!isset($cmd->payload['task_id'])) {
            throw new CommandRejectedException('缺少 task_id');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $taskId = (string) $cmd->payload['task_id'];
        $task = DB::table('fleet_tasks')->where('task_id', $taskId)->lockForUpdate()->first();
        if ($task === null || (int) $task->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException("任务不存在或不归 Owner：{$taskId}");
        }
        if (!in_array($task->status, ['outbound', 'holding'], true)) {
            throw new CommandRejectedException("任务状态 {$task->status} 不可召回");
        }

        $now = Carbon::now('UTC');
        $departAt = Carbon::parse($task->depart_at, 'UTC');
        // Carbon 3 diffInSeconds 有符号（b−a）：已飞行 = depart→now
        $elapsed = max(0, (int) $departAt->diffInSeconds($now));
        $returnAt = $now->copy()->addSeconds($elapsed);   // 返航=已飞行时长

        DB::table('fleet_tasks')->where('task_id', $taskId)->update([
            'mission' => 'recall',
            'status' => 'returning',
            'arrive_at' => $returnAt,
            'settle_phase' => null,   // 抵达阶段键重置：返航抵达是新的业务阶段
        ]);

        return ['task_id' => $taskId, 'status' => 'returning', 'return_at' => $returnAt->toIso8601String()];
    }
}
