<?php

declare(strict_types=1);

namespace App\Domain\Gm;

use App\Domain\CanonicalJson;
use App\Domain\Ledger\LedgerWriter;
use App\Models\GameRuleset;
use App\Models\Planet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * GmService（G10）：GM 操作的唯一实现，CLI（game:gm）与 HTTP（/api/v1/gm/*）共用。
 *
 * 审计纪律：每次操作落一条 game_commands 系统命令行（type=GM_*，actor_kind=gm）
 * + 资源变动入台账（operation=gm）——game_commands 表即 GM 操作日志，可追溯。
 * 数值纪律：不读任何 Balance 键（发放量/等级由运营指令显式给出）。
 */
class GmService
{
    public function __construct(private readonly LedgerWriter $ledger)
    {
    }

    /** 发放资源（默认母星；可指定行星；可为负=扣回，守恒红线：扣后库存不得为负）。 */
    public function grantResources(int $ownerId, array $deltas, ?int $planetId = null): array
    {
        $planet = $this->resolvePlanet($ownerId, $planetId);
        if ($planet === null) {
            return ['ok' => false, 'error' => "行星不存在或不属于 owner {$ownerId}"];
        }
        $d = ['M' => (float) ($deltas['M'] ?? 0), 'C' => (float) ($deltas['C'] ?? 0), 'D' => (float) ($deltas['D'] ?? 0)];
        if ($d['M'] == 0.0 && $d['C'] == 0.0 && $d['D'] == 0.0) {
            return ['ok' => false, 'error' => '未指定增量（M/C/D 至少一项非零）'];
        }

        return DB::transaction(function () use ($planet, $ownerId, $d) {
            $ruleset = $this->frozenRuleset();
            if ($ruleset === null) {
                return ['ok' => false, 'error' => '无 frozen 规则集（命令归因需要）'];
            }

            $planet->inv_m = (float) $planet->inv_m + $d['M'];
            $planet->inv_c = (float) $planet->inv_c + $d['C'];
            $planet->inv_d = (float) $planet->inv_d + $d['D'];
            if ($planet->inv_m < 0 || $planet->inv_c < 0 || $planet->inv_d < 0) {
                return ['ok' => false, 'error' => '扣回后库存为负——拒绝（守恒红线）'];
            }
            $planet->version++;
            $planet->save();

            $commandId = Str::uuid()->toString();
            $payload = ['planet_id' => (int) $planet->id, 'delta' => $d];
            $this->audit($commandId, $ownerId, 'GM_RESOURCES', $payload, $ruleset->id, ['after' => [
                'M' => $planet->inv_m, 'C' => $planet->inv_c, 'D' => $planet->inv_d,
            ]]);
            $this->ledger->record($commandId, $ownerId, (int) $planet->id, null, $d, 'gm', 'gm-console', (string) $planet->id);

            return ['ok' => true, 'command_id' => $commandId, 'planet_id' => (int) $planet->id, 'after' => [
                'M' => (float) $planet->inv_m, 'C' => (float) $planet->inv_c, 'D' => (float) $planet->inv_d,
            ]];
        });
    }

    /** 直接设置建筑等级（事件/运营修复）。 */
    public function setLevel(int $ownerId, string $building, int $level, ?int $planetId = null): array
    {
        if ($building === '' || $level < 0) {
            return ['ok' => false, 'error' => 'building 与 level（≥0）必填'];
        }
        $planet = $this->resolvePlanet($ownerId, $planetId);
        if ($planet === null) {
            return ['ok' => false, 'error' => "行星不存在或不属于 owner {$ownerId}"];
        }

        return DB::transaction(function () use ($planet, $ownerId, $building, $level) {
            $ruleset = $this->frozenRuleset();
            if ($ruleset === null) {
                return ['ok' => false, 'error' => '无 frozen 规则集（命令归因需要）'];
            }

            $levels = $planet->levels_json ?? [];
            $before = (int) ($levels[$building] ?? 0);
            $levels[$building] = $level;
            $planet->levels_json = $levels;
            $planet->version++;
            $planet->save();

            $commandId = Str::uuid()->toString();
            $payload = ['planet_id' => (int) $planet->id, 'building' => $building, 'from' => $before, 'to' => $level];
            $this->audit($commandId, $ownerId, 'GM_LEVEL', $payload, $ruleset->id, ['after' => ['levels' => $levels]]);

            return ['ok' => true, 'command_id' => $commandId, 'planet_id' => (int) $planet->id, 'from' => $before, 'to' => $level];
        });
    }

    /** 封禁/解封：banned 玩家在 GameTokenAuth 处 403，无法再做任何玩家操作。 */
    public function setBanned(int $ownerId, bool $banned, string $reason = ''): array
    {
        $row = DB::table('players')->where('owner_id', $ownerId)->first();
        if ($row === null) {
            return ['ok' => false, 'error' => "owner {$ownerId} 不存在"];
        }
        DB::table('players')->where('owner_id', $ownerId)->update([
            'banned_at' => $banned ? now() : null,
            'ban_reason' => $banned ? mb_substr($reason, 0, 200) : null,
        ]);

        return ['ok' => true, 'owner_id' => $ownerId, 'banned' => $banned];
    }

    /** 运营公告：玩家 state 投影最新一条。 */
    public function announce(string $message): array
    {
        $message = trim($message);
        if ($message === '' || mb_strlen($message) > 300) {
            return ['ok' => false, 'error' => '公告需 1-300 字'];
        }
        $id = (int) DB::table('announcements')->insertGetId(['message' => $message, 'created_at' => now()]);

        return ['ok' => true, 'id' => $id, 'message' => $message];
    }

    private function resolvePlanet(int $ownerId, ?int $planetId): ?Planet
    {
        /** @var Planet|null $planet */
        $planet = $planetId !== null
            ? Planet::query()->where('id', $planetId)->lockForUpdate()->first()
            : Planet::query()->where('owner_id', $ownerId)->where('is_homeworld', true)->first();
        if ($planet === null || (int) $planet->owner_id !== $ownerId) {
            return null;
        }

        return $planet;
    }

    private function frozenRuleset(): ?GameRuleset
    {
        /** @var GameRuleset|null $r */
        $r = GameRuleset::query()->where('status', GameRuleset::STATUS_FROZEN)->orderByDesc('id')->first();

        return $r;
    }

    private function audit(string $commandId, int $ownerId, string $type, array $payload, int $rulesetId, array $result): void
    {
        DB::table('game_commands')->insert([
            'command_id' => $commandId,
            'payload_hash' => CanonicalJson::hash($payload),
            // actor_kind 沿用 game:gm CLI 先例（'player' + GM_* 类型区分）；枚举含 CHECK
            // 且 SQLite 原位扩枚举需整表重建（外键牵连），不值当。
            'actor_kind' => 'player', 'actor_id' => $ownerId, 'owner_id' => $ownerId,
            'type' => $type,
            'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'ruleset_id' => $rulesetId,
            'status' => 'committed', 'attempt_count' => 1,
            'submitted_at' => now(), 'committed_at' => now(),
            'result_json' => json_encode($result, JSON_UNESCAPED_UNICODE),
        ]);
    }
}
