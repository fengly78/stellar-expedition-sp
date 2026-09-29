<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Fleet\FleetArrivalService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:process-fleets —— 到期舰队任务 Worker（E1-S3）。
 * 按 arrive_at 事件序推进；抵达形态分派在 FleetArrivalService（raid/colonize/scout 显式未实现即抛）。
 */
class ProcessDueFleets extends Command
{
    protected $signature = 'game:process-fleets';

    protected $description = '结算到期舰队任务（E1-S3：transport 交付 + 返航落地）';

    public function __construct(
        private readonly FleetArrivalService $arrival,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $now = Carbon::now('UTC');
        $due = DB::table('fleet_tasks')
            ->whereIn('status', ['outbound', 'holding', 'returning'])
            ->where('arrive_at', '<=', $now)
            ->orderBy('arrive_at')
            ->limit(200)
            ->get();

        $done = 0;
        foreach ($due as $task) {
            $this->arrival->arrive((string) $task->task_id);
            $done++;
        }
        $this->info("结算 {$done} 个到期舰队任务");
        return self::SUCCESS;
    }
}
