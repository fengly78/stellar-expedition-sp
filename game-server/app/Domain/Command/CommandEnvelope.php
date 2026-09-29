<?php

declare(strict_types=1);

namespace App\Domain\Command;

/**
 * 统一命令信封（API-01 §1）：玩家/海盗 AI/总督的资产变更只能经此入口进入。
 */
class CommandEnvelope
{
    /**
     * @param array<string,mixed> $payload
     * @param 'player'|'pirate_ai'|'governor' $actorKind
     */
    public function __construct(
        public readonly string $commandId,       // UUID v4，调用方生成的幂等键
        public readonly string $actorKind,
        public readonly int $actorId,
        public readonly int $ownerId,            // 资产所有者（Actor≠Owner 时须授权）
        public readonly string $type,            // API-01 §3 命令清单
        public readonly array $payload,
        public readonly ?int $authorizationId = null,     // 总督命令必填
        public readonly ?int $authorizationVersion = null,
        public readonly ?int $submittedAtMicros = null,   // null 时由总线填服务器时间
    ) {
    }

    /** 同 ID 不同 payload → 拒绝（GDD-13：不能当作新指令）。 */
    public function payloadHash(): string
    {
        return \App\Domain\CanonicalJson::hash($this->payload);
    }
}
