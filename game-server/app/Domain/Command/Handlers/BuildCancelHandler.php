<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * BUILD_CANCEL：取消建造队列中的某一项（2026-09-29 补）。
 *
 * ## 为什么必须有它（多人对抗实测，三名 agent 各自独立复现）
 *
 * 队列是 FIFO、上限 3，且此前**没有任何取消/跳过命令**。于是队首一旦不可启动，
 * 后面所有项永远轮不到，该星球的建造能力**永久报废且不可自愈**。
 * 三条互不相同的触发路径，全部不需要「发错建筑 id」：
 *
 *  1. 队首建筑付不起（DELTA）：为追产量把 M_STORAGE 点到 L7（需 16778M），
 *     随后金属花光 → `BUILD_START` 持续 409 → 按 50M/h 收入需 **181 小时**才解封。
 *  2. 重复 ENQUEUE 灌满 3 槽（BRAVO）：用**合法 id** 反复入队。
 *  3. 不存在的 id 静默入队（DELTA/ALPHA 均确认 `BuildEnqueueHandler` 只校验队列长度，
 *     不校验 id），错误延迟到 `BUILD_START` 才以 503「配置键缺失」爆出。
 *
 * 三条路径的共同点是**玩家完全没有自救手段，也收不到任何告警**。
 *
 * ## 语义
 *
 * payload: {"planet_id": int, "index": int}
 *   index 为 queue_building 数组下标（0 = 队首）。
 *   未给 index 时默认为 0（取消队首）——那正是最常见的死锁位置。
 *
 * **不能取消执行中的建造**（那属于 build_tasks，由既有的完成/结算流程管），
 * 只取消「排队中」的项。已扣的建造费用**不退还**：
 * 建造是入队即扣费的口径（§02.2），取消只是撤回「还没开始的那一段」，
 * 退款会与已扣费用重复计账。此处保持与既有 refund 语义分离。
 */
class BuildCancelHandler implements CommandHandler
{
    public function type(): string
    {
        return 'BUILD_CANCEL';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        $planet = $this->planet($cmd);
        $index = (int) ($cmd->payload['index'] ?? 0);
        $queue = $planet->queue_building ?? [];
        if (!array_key_exists($index, $queue)) {
            throw new CommandRejectedException("队列中没有第 {$index} 项（当前 " . count($queue) . ' 项）');
        }
    }

    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $planet = $this->planet($cmd);
        $index = (int) ($cmd->payload['index'] ?? 0);
        $queue = $planet->queue_building ?? [];
        $cancelled = $queue[$index] ?? null;
        unset($queue[$index]);
        // unset 会留下稀疏键，这里重建为连续数组，保证后续 array_shift / count 语义正确。
        $planet->queue_building = array_values($queue);
        $planet->version++;
        $planet->save();

        return [
            'planet_id' => (int) $planet->id,
            'cancelled_index' => $index,
            'cancelled' => $cancelled,
            'queue_depth' => count($planet->queue_building),
        ];
    }

    private function planet(CommandEnvelope $cmd): Planet
    {
        $planetId = (int) ($cmd->payload['planet_id'] ?? 0);
        /** @var Planet|null $planet */
        $planet = Planet::query()->where('id', $planetId)->lockForUpdate()->first();
        if ($planet === null || (int) $planet->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException("行星不存在或不归 Owner：{$planetId}");
        }
        $executing = DB::table('build_tasks')
            ->where('planet_id', $planetId)->where('status', 'executing')->exists();
        if ($executing) {
            throw new CommandRejectedException('该行星有执行中的建造，先等待其完成或完成后再取消排队项');
        }

        return $planet;
    }
}
