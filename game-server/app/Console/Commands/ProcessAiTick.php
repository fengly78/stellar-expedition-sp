<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:ai-tick —— 海盗 AI 决策 tick 骨架（GDD-05 / SIM-04 口径）。
 *
 * 零作弊红线（SIM-04 已验证语义）：
 * - AI 只能花自己产出的资源（注入恒 0——本命令不做任何资源注入）；
 * - AI 的一切资产变更走同一命令总线（actor_kind='pirate_ai'），无旁路；
 * - 决策依据只能是本 Owner 合法情报（intel_snapshots），无全图视野。
 *
 * 当前为状态机骨架：读 ai_strategy_states，按 AI.TICK 配置节拍推进；
 * 具体 BUILD/SCOUT/RAID/RECOVER 决策细则（AI.PERSONALITY/BUDGET/RAID_MARGIN 等配置族）
 * 在 RC1 批准相应 AI.* 参数后实现——配置缺键时本 tick 空转并计数（显式，不静默造决策）。
 */
class ProcessAiTick extends Command
{
    protected $signature = 'game:ai-tick';

    protected $description = '海盗 AI 决策 tick（E1-S5 骨架；零作弊：无注入、走总线、只用合法情报）';

    public function handle(): int
    {
        $states = DB::table('ai_strategy_states')->orderBy('id')->limit(200)->get();
        $skipped = 0;
        foreach ($states as $state) {
            // 决策细则待 AI.* 配置批准（GDD-05 两枚举分离已在表结构保证：
            // behavior_class 与 strategy_state 独立存储、独立迁移）
            $skipped++;
        }
        $this->info("AI tick：{$skipped} 个 AI 实体扫描（决策细则待 AI.* 配置批准，本轮空转）");
        return self::SUCCESS;
    }
}
