<?php

declare(strict_types=1);

namespace App\Domain\Governor;

use App\Domain\Command\CommandRejectedException;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * GovernorService：总督授权校验（GDD-06 / API-01 §3 GOVERNOR_*）。
 *
 * scope_json 字段（授权完整才合法）：planets / actions / budget_per_command /
 * budget_per_period / min_reserve / forbidden_resources / expires_at。
 * 撤销语义：阻止未承诺动作，不删在途舰队；已支付任务不无偿撤销。
 * 周期预算的原子占用选型属 API-01 §10 TBD#5——当前执行**单笔限额**硬校验，
 * 周期累计由 game_commands 总督行推导（§11 观察项 1），锁选型批准后收紧。
 */
class GovernorService
{
    public const SCOPE_REQUIRED = [
        'planets', 'actions', 'budget_per_command', 'budget_per_period',
        'min_reserve', 'forbidden_resources', 'expires_at',
    ];

    /** 授权字段完整性（GRANT 时校验）。 */
    public static function assertScopeComplete(array $scope): void
    {
        $missing = array_diff(self::SCOPE_REQUIRED, array_keys($scope));
        if ($missing !== []) {
            throw new CommandRejectedException('授权字段不完整：缺 ' . implode(', ', $missing));
        }
    }

    /**
     * 读取并校验当前授权（COMMAND 时）：存在、归 Owner、未撤销、版本匹配、未过期。
     *
     * @return object 授权行
     */
    public function activeAuthorization(int $authorizationId, int $version, int $ownerId): object
    {
        $auth = DB::table('governor_authorizations')
            ->where('id', $authorizationId)->lockForUpdate()->first();
        if ($auth === null || (int) $auth->owner_id !== $ownerId) {
            throw new CommandRejectedException('授权不存在或不归 Owner');
        }
        if ($auth->revoked_at !== null) {
            throw new CommandRejectedException('授权已撤销（未承诺动作禁止执行）');
        }
        if ((int) $auth->version !== $version) {
            throw new CommandRejectedException("授权版本不匹配：持有 v{$version}，当前 v{$auth->version}（意图基于旧版本，拒绝）");
        }
        $scope = (array) json_decode($auth->scope_json, true);
        if (isset($scope['expires_at']) && Carbon::parse($scope['expires_at'])->isPast()) {
            throw new CommandRejectedException('授权已过期');
        }
        return $auth;
    }

    /** 子命令是否在授权范围内（动作白名单 + 行星范围 + 单笔限额 + 禁止资源）。 */
    public function assertInScope(object $auth, string $subType, array $subPayload): void
    {
        $scope = (array) json_decode($auth->scope_json, true);
        if (!in_array($subType, (array) ($scope['actions'] ?? []), true)) {
            throw new CommandRejectedException("动作 {$subType} 不在授权范围");
        }
        if (isset($subPayload['planet_id'])
            && !in_array((int) $subPayload['planet_id'], array_map('intval', (array) ($scope['planets'] ?? [])), true)) {
            throw new CommandRejectedException('行星不在授权范围');
        }
        // 单笔限额与禁止资源的金额级校验在子命令扣费路径完成（金额在 handler 内才知道）；
        // 本层先卡口动作与行星范围。
    }
}
