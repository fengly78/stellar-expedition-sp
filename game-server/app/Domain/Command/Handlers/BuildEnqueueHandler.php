<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\Ruleset;
use App\Models\Planet;

/**
 * BUILD_ENQUEUE（API-01 §3）：入待执行队列，**不支付**（Core 02.2）。
 * 校验：行星归属、前置、队列空位（上限 3 = QUEUE.BUILD.PENDING）。
 *
 * payload: {"planet_id": int, "building": string}
 */
class BuildEnqueueHandler implements CommandHandler
{
    /** 队列上限走配置；配置缺键即抛（不静默默认）。 */
    private const PENDING_KEY = 'QUEUE.BUILD.PENDING';

    public function type(): string
    {
        return 'BUILD_ENQUEUE';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        $planet = $this->planet($cmd);
        $building = (string) ($cmd->payload['building'] ?? '');
        if ($building === '') {
            throw new CommandRejectedException('缺少 building');
        }
        // 2026-09-29 补（多人对抗实测，三名 agent 各自独立复现队列死锁）：
        // 原先这里**不校验 building 是否真实存在**，错 id 也能 200 入队，
        // 错误延迟到 BUILD_START 才以 503「配置键缺失：BUILD.xxx」爆出。
        // 而队列是 FIFO、上限 3 且（补 BUILD_CANCEL 前）无任何取消手段
        // → 一条坏队首会让该星球的建造能力**永久报废**。
        // 现在在入队这一侧就拒绝，把「200 成功入队、之后才炸」变成当场明确报错。
        if (!array_key_exists($building, (array) $ruleset->get('BUILD'))) {
            throw new CommandRejectedException("未知建筑：{$building}");
        }
        $max = (int) $ruleset->get(self::PENDING_KEY);
        $queue = $planet->queue_building ?? [];
        if (count($queue) >= $max) {
            throw new CommandRejectedException("待执行队列已满（上限 {$max}）");
        }
        // 2026-09-29：同名校验缺失时重复入队会占满槽位，配合队列不可取消即可毁掉星球
        // （BRAVO 用合法 C_STORAGE 反复入队就把自己锁死了）。这里直接拒绝重复项。
        foreach ($queue as $item) {
            if ((string) ($item['building'] ?? '') === $building) {
                throw new CommandRejectedException("队列中已有待建的 {$building}，请先启动或取消");
            }
        }
        // 前置校验留口：前置表（REQUIRES.*）随 S2 科技/船厂接入；当前建筑集无前置
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $planet = $this->planet($cmd);
        $queue = $planet->queue_building ?? [];
        $queue[] = ['building' => (string) $cmd->payload['building'], 'queued_by' => $cmd->commandId];
        $planet->queue_building = $queue;
        $planet->version++;
        $planet->save();

        return ['planet_id' => $planet->id, 'queue_depth' => count($queue)];
    }

    private function planet(CommandEnvelope $cmd): Planet
    {
        $planetId = (int) ($cmd->payload['planet_id'] ?? 0);
        /** @var Planet|null $planet */
        $planet = Planet::query()->find($planetId);
        if ($planet === null) {
            throw new CommandRejectedException("行星不存在：{$planetId}");
        }
        if ((int) $planet->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException('行星不归该 Owner 所有');
        }
        return $planet;
    }
}
