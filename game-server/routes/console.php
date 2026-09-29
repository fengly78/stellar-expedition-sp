<?php

use Illuminate\Support\Facades\Schedule;

/*
| Worker 调度（dev/prod 通用）：到期任务按 complete_at/arrive_at 事件序推进，
| Worker 全部幂等（settle_phase / battle_id / 状态机双层），重复触发安全。
| AI tick 自身按 AI.TICK 配置节流（economy 600s / fleet 1800s / strategy 7200s）。
*/
Schedule::command('game:process-builds')->everyMinute();
Schedule::command('game:process-due')->everyMinute();
Schedule::command('game:process-fleets')->everyMinute();
// 2026-09-29 补：产出必须由 worker 自主推进。此前 settle() 只在玩家下命令时
// 被顺带调用，导致玩家一旦闲置产出恒为 0（实测闲置 25 秒增量为 0.000）。
// 频率高于其余三项是合理的——产出是连续量，分钟级会让小数截断误差观感明显。
Schedule::command('game:process-production')->everyTenSeconds();
Schedule::command('game:ai-tick')->everyFiveMinutes();
