<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * ReportController：战报读面（API-01 §12 Draft 扩展）。
 *
 * 2026-09-29 修复（多人对抗实测，攻守双方各自独立复现）：
 * 原实现用 `battle_snapshots JOIN game_commands ON command_id` 再按
 * `game_commands.owner_id` 过滤，而 `command_id` 属于**发起方**的命令——
 * 于是**被攻击方永远查不到自己的战报**。实测：被突袭方
 * `GET /reports?owner_id=N` 恒为 `count:0`，而 `battle_snapshots` 里明明有
 * 以它为防守方的战斗。三名 agent 分别从攻方/守方视角独立确认。
 *
 * 改为按 `participants_json` 里的**参与方 owner_id** 匹配：
 * 攻防双方都能查到涉及其舰队的战斗，并在每条战报上标注 `perspective`
 * （attacker / defender / both），客户端可直接按视角筛选。
 *
 * 只读投影，无数值常数；owner 鉴权属生产化前置（同 state 读面）。
 */
class ReportController extends Controller
{
    /**
     * 参与方匹配采用「取近期快照 + PHP 侧精确解析」，而非 SQL LIKE。
     * 原因：`participants_json` 的编码是否带空格并无契约保证，
     * 用 `LIKE '"owner_id":N'` 会在格式变化时**静默漏查**（退回被袭方失明的老问题）。
     * 代价是要解析 JSON——本表只保留近期快照、且已限量，代价可控。
     */
    private const PARTICIPANT_SCAN_LIMIT = 500;

    public function index(\Illuminate\Http\Request $request): JsonResponse
    {
        $ownerId = (int) $request->query('owner_id', '0');
        if ($ownerId <= 0) {
            return response()->json(['error' => 'owner_id 必填（正整数）'], 422);
        }
        // 鉴权后令牌 owner 与查询 owner 必须一致（读别人战报 = 越权）
        $authOwner = $request->attributes->get('game_owner_id');
        if ($authOwner !== null && (int) $authOwner !== $ownerId) {
            return response()->json(['error' => '禁止：令牌不属于该 owner。'], 403);
        }

        $rows = DB::table('battle_snapshots')
            ->leftJoin('game_commands', 'game_commands.command_id', '=', 'battle_snapshots.command_id')
            ->orderByDesc('battle_snapshots.id')
            ->limit(self::PARTICIPANT_SCAN_LIMIT)
            ->get([
                'battle_snapshots.id',
                'battle_snapshots.battle_id',
                'battle_snapshots.command_id',
                'battle_snapshots.participants_json',
                'battle_snapshots.result_json',
                'battle_snapshots.snapshot_at',
                'game_commands.owner_id as command_owner_id',
            ]);

        $battles = [];
        foreach ($rows as $r) {
            $role = $this->roleInBattle((string) $r->participants_json, $ownerId);
            if ($role === null) {
                // 归因回退：participants_json 缺失/为空/无法解析的历史或异常数据，
                // 仍按原口径（发起方 owner）可见，避免"修归属"反而让旧战报消失。
                $role = ((int) ($r->command_owner_id ?? 0) === $ownerId) ? 'attacker' : null;
                if ($role === null) {
                    continue;
                }
            }
            $battles[] = [
                'battle_id' => (string) $r->battle_id,
                'command_id' => (string) $r->command_id,
                // 'battle-*' = 战斗，'counteresp-*' = 反侦察交战。原先两者混列且无字段可区分。
                'kind' => str_starts_with((string) $r->battle_id, 'counteresp-') ? 'counterespionage' : 'battle',
                'perspective' => $role,
                'at' => $r->snapshot_at ? \Carbon\Carbon::parse($r->snapshot_at)->toIso8601String() : null,
                'result' => json_decode((string) $r->result_json, true),
            ];
            if (count($battles) >= 20) {
                break;
            }
        }

        return response()->json([
            'owner_id' => $ownerId,
            'count' => count($battles),
            'battles' => $battles,
        ]);
    }

    /**
     * 该 owner 在这场战斗里的视角：'attacker' / 'defender' / 'both'；
     * 与这场战斗无关时返回 null。
     */
    private function roleInBattle(string $participantsJson, int $ownerId): ?string
    {
        $p = json_decode($participantsJson, true);
        if (!is_array($p)) {
            return null;
        }
        $hit = static function (array $fleets) use ($ownerId): bool {
            foreach ($fleets as $f) {
                if (is_array($f) && (int) ($f['owner_id'] ?? 0) === $ownerId) {
                    return true;
                }
            }
            return false;
        };
        $asAttacker = $hit($p['attacker_fleets'] ?? []);
        $asDefender = $hit($p['defender_fleets'] ?? []);
        if ($asAttacker && $asDefender) {
            return 'both';
        }

        return $asAttacker ? 'attacker' : ($asDefender ? 'defender' : null);
    }

    /** GET /api/v1/intel?owner_id=N —— 最新侦察快照（G6 模拟器回填源）。 */
    public function intel(\Illuminate\Http\Request $request): JsonResponse
    {
        $ownerId = (int) $request->query('owner_id', '0');
        if ($ownerId <= 0) {
            return response()->json(['error' => 'owner_id 必填（正整数）'], 422);
        }
        $authOwner = $request->attributes->get('game_owner_id');
        if ($authOwner !== null && (int) $authOwner !== $ownerId) {
            return response()->json(['error' => '禁止：令牌不属于该 owner。'], 403);
        }

        $rows = DB::table('intel_snapshots')
            ->where('owner_id', $ownerId)
            ->orderByDesc('id')
            ->limit(10)
            ->get(['id', 'target_ref', 'observed_at', 'visible_fields_json']);

        $items = $rows->map(fn ($r) => [
            'id' => (int) $r->id,
            'target' => (string) $r->target_ref,
            'observed_at' => $r->observed_at ? \Carbon\Carbon::parse($r->observed_at)->toIso8601String() : null,
            'visible' => json_decode((string) $r->visible_fields_json, true),
        ])->values()->all();

        return response()->json(['owner_id' => $ownerId, 'count' => count($items), 'snapshots' => $items]);
    }
}
