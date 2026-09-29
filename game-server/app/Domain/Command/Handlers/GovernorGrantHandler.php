<?php

declare(strict_types=1);

namespace App\Domain\Command\Handlers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Governor\GovernorService;
use App\Domain\Ruleset\Ruleset;
use Illuminate\Support\Facades\DB;

/**
 * GOVERNOR_GRANT（API-01 §3）：授权版本化创建。版本 = 该 Owner 现有最大版本 + 1。
 * payload: {"scope": {...七字段...}}
 */
class GovernorGrantHandler implements CommandHandler
{
    public function type(): string
    {
        return 'GOVERNOR_GRANT';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
        $scope = $cmd->payload['scope'] ?? null;
        if (!is_array($scope)) {
            throw new CommandRejectedException('缺少 scope');
        }
        GovernorService::assertScopeComplete($scope);
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $nextVersion = (int) DB::table('governor_authorizations')
            ->where('owner_id', $cmd->ownerId)->max('version') + 1;
        $id = DB::table('governor_authorizations')->insertGetId([
            'owner_id' => $cmd->ownerId,
            'version' => $nextVersion,
            'scope_json' => json_encode($cmd->payload['scope'], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
        ]);
        return ['authorization_id' => $id, 'version' => $nextVersion];
    }
}
