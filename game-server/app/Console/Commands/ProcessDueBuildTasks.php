<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Build\BuildCompletionService;
use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Command\GameCommandBus;
use App\Domain\Ruleset\RulesetLoader;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:process-builds —— 到期建造任务 Worker（API-01 §4：到期队列按服务器事件时间推进，
 * 延迟 Worker 不改写本应更早的结果——结算以 complete_at 为准而非处理时刻）。
 *
 * 完成后续排：对每个完成任务派发系统 BUILD_START 命令（走总线、留审计），
 * command_id 确定性派生 = "buildstart-{task_id}"，Worker 重试天然幂等。
 */
class ProcessDueBuildTasks extends Command
{
    protected $signature = 'game:process-builds';

    protected $description = '结算到期建造任务并续排队列（E1-S1）';

    public function __construct(
        private readonly BuildCompletionService $completion,
        private readonly GameCommandBus $bus,
        private readonly RulesetLoader $rulesets,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $now = Carbon::now('UTC');
        $due = DB::table('build_tasks')
            ->where('status', 'executing')
            ->where('complete_at', '<=', $now)
            ->orderBy('complete_at')     // 按事件时间推进，不按发现顺序
            ->limit(500)
            ->get();

        $done = 0;
        foreach ($due as $task) {
            $ruleset = $this->rulesets->load((int) $task->ruleset_id);
            $next = $this->completion->complete((int) $task->id, $ruleset);
            $done++;

            if ($next !== null) {
                $ownerId = (int) DB::table('planets')->where('id', $task->planet_id)->value('owner_id');
                try {
                    $this->bus->dispatch(new CommandEnvelope(
                        commandId: "buildstart-{$task->id}",
                        actorKind: 'player',
                        actorId: $ownerId,
                        ownerId: $ownerId,
                        type: 'BUILD_START',
                        payload: ['planet_id' => (int) $task->planet_id],
                    ), $ruleset->id);
                } catch (CommandRejectedException) {
                    // 付不起/状态冲突：队列保留，下次玩家补充资源后手动或再触发（02.2）
                }
            }
        }

        $this->info("结算 {$done} 个到期建造任务");
        return self::SUCCESS;
    }
}
