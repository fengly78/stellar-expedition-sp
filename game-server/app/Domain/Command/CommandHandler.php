<?php

declare(strict_types=1);

namespace App\Domain\Command;

use App\Domain\Ruleset\Ruleset;

/**
 * 命令处理器契约（API-01 §3 每命令一个实现）。
 * 支付/校验时点遵循 Core 02.2：排队不等于已支付，启动时必须再校验。
 */
interface CommandHandler
{
    /** 该处理器负责的命令类型（如 'BUILD_ENQUEUE'）。 */
    public function type(): string;

    /**
     * 业务校验。抛 CommandRejectedException = 业务拒绝（REJECTED，不重试）。
     * 其余异常由总线归为 FAILED（技术失败，可重试）。
     */
    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void;

    /**
     * 在总线开启的事务内执行：资产变更 + 业务任务 + Ledger + Outbox 同事务写入（§5）。
     *
     * @return array<string,mixed> 已记录结果（重放提交直接返回此结果）
     */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array;
}
