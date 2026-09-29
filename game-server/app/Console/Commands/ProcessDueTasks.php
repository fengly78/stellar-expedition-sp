<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Research\ResearchCompletionService;
use App\Domain\Shipyard\ShipOrderCompletionService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:process-due —— 到期研究/造船任务 Worker（E1-S2；与 game:process-builds 同构）。
 * 按 complete_at 事件序推进；幂等由服务层状态检查保证。
 */
class ProcessDueTasks extends Command
{
    protected $signature = 'game:process-due';

    protected $description = '结算到期研究与造船任务（E1-S2）';

    public function __construct(
        private readonly ResearchCompletionService $research,
        private readonly ShipOrderCompletionService $shipyard,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $now = Carbon::now('UTC');
        $researchDone = 0;
        foreach (DB::table('research_tasks')->where('status', 'executing')
                     ->where('complete_at', '<=', $now)->orderBy('complete_at')->limit(500)->get() as $task) {
            $this->research->complete((int) $task->id);
            $researchDone++;
        }
        $shipDone = 0;
        foreach (DB::table('ship_orders')->where('status', 'executing')
                     ->where('complete_at', '<=', $now)->orderBy('complete_at')->limit(500)->get() as $order) {
            $this->shipyard->complete((int) $order->id);
            $shipDone++;
        }
        $this->info("结算研究 {$researchDone} 项、造船批次 {$shipDone} 批");
        return self::SUCCESS;
    }
}
