<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Ruleset\Ruleset;
use Illuminate\Support\Facades\DB;

/**
 * GOVERNOR_REVOKE（API-01 §3）：撤销授权——阻止未承诺动作，不删在途舰队，
 * 已支付任务不无偿撤销（GDD-06）。
 * payload: {"authorization_id": int}
 */
class GovernorRevokeHandler implements CommandHandler
{
    public function type(): string
    {
        return 'GOVERNOR_REVOKE';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        if (!isset($cmd->payload['authorization_id'])) {
            throw new CommandRejectedException('缺少 authorization_id');
        }
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $authId = (int) $cmd->payload['authorization_id'];
        $auth = DB::table('governor_authorizations')->where('id', $authId)->lockForUpdate()->first();
        if ($auth === null || (int) $auth->owner_id !== $cmd->ownerId) {
            throw new CommandRejectedException('授权不存在或不归 Owner');
        }
        if ($auth->revoked_at !== null) {
            return ['authorization_id' => $authId, 'revoked' => true, 'already' => true];   // 幂等
        }
        DB::table('governor_authorizations')->where('id', $authId)->update(['revoked_at' => now()]);
        return ['authorization_id' => $authId, 'revoked' => true];
    }
}
