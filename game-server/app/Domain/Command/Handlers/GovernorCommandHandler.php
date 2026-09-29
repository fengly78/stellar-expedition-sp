<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Command\GameCommandBus;
use App\Domain\Governor\GovernorService;
use App\Domain\Ruleset\Ruleset;

/**
 * GOVERNOR_COMMAND（API-01 §3）：总督执行子命令。
 *
 * 执行时读**当前**授权（§3）：撤销后未承诺动作禁止执行；版本不匹配即拒
 * （意图基于旧授权版本，防止"授权刚收窄、旧意图仍执行"）。
 * 子命令经总线转发（command_id 派生 "{parent}/sub"），总督日志 = 父子命令行
 * （game_commands 留意图/授权版本/结果/失败原因，§3 产物）。
 *
 * payload: {"sub_type": string, "sub_payload": {...}}
 * 信封必须带 authorization_id + authorization_version。
 */
class GovernorCommandHandler implements CommandHandler
{
    public function __construct(
        private readonly GovernorService $governor,
        private readonly GameCommandBus $bus,
    ) {
    }

    public function type(): string
    {
        return 'GOVERNOR_COMMAND';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        if (!isset($cmd->payload['sub_type'], $cmd->payload['sub_payload'])) {
            throw new CommandRejectedException('缺少 sub_type/sub_payload');
        }
        if ($cmd->authorizationId === null || $cmd->authorizationVersion === null) {
            throw new CommandRejectedException('总督命令必须带授权引用（GDD-06）');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $auth = $this->governor->activeAuthorization(
            $cmd->authorizationId, $cmd->authorizationVersion, $cmd->ownerId);
        $subType = (string) $cmd->payload['sub_type'];
        /** @var array<string,mixed> $subPayload */
        $subPayload = $cmd->payload['sub_payload'];
        $this->governor->assertInScope($auth, $subType, $subPayload);

        // 子命令走同一总线（同事务、留审计）；command_id 派生保证重放幂等
        $sub = new CommandEnvelope(
            commandId: "{$cmd->commandId}/sub",
            actorKind: 'governor',
            actorId: $cmd->actorId,
            ownerId: $cmd->ownerId,
            type: $subType,
            payload: $subPayload,
            authorizationId: $cmd->authorizationId,
            authorizationVersion: $cmd->authorizationVersion,
        );
        $result = $this->bus->dispatch($sub, $ruleset->id);

        return ['sub_type' => $subType, 'authorization_version' => $cmd->authorizationVersion, 'result' => $result];
    }
}
