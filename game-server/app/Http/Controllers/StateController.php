<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Civilization;
use App\Models\GameRuleset;
use App\Models\Planet;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * StateController：状态读面（API-01 §12 Draft 扩展，2026-09-23 登记）。
 *
 * 只读投影：原始状态字段直出（库存/等级/舰船/队列/科技），无任何 Balance 常数、
 * 无业务推导——展示口径由客户端计算。owner_id 鉴权属生产化前置（MVP 开发态直读）。
 */
class StateController extends Controller
{
    public function show(\Illuminate\Http\Request $request): JsonResponse
    {
        $ownerId = (int) $request->query('owner_id', '0');
        if ($ownerId <= 0) {
            return response()->json(['error' => 'owner_id 必填（正整数）'], 422);
        }
        // 鉴权后令牌 owner 与查询 owner 必须一致（读别人状态 = 越权）
        $authOwner = $request->attributes->get('game_owner_id');
        if ($authOwner !== null && (int) $authOwner !== $ownerId) {
            return response()->json(['error' => '禁止：令牌不属于该 owner。'], 403);
        }

        /** @var Civilization|null $civ */
        $civ = Civilization::query()->where('owner_id', $ownerId)->first();
        $planets = Planet::query()->where('owner_id', $ownerId)->orderBy('id')->get();
        if ($civ === null && $planets->isEmpty()) {
            return response()->json(['error' => "owner {$ownerId} 不存在"], 404);
        }

        return response()->json([
            'owner_id' => $ownerId,
            'generated_at' => now()->toIso8601String(),
            // 客户端提交命令时的 ruleset_version 依据（最新 frozen 的 balance_rc1；无则 null=fail-closed）
            'ruleset_version' => GameRuleset::query()
                ->where('ruleset_name', 'balance_rc1')->where('status', GameRuleset::STATUS_FROZEN)
                ->orderByDesc('id')->value('version'),
            'civilization' => $civ === null ? null : [
                'techs' => (array) ($civ->techs_json ?? []),
                'research_active' => $civ->research_active === null ? null : (array) $civ->research_active,
                'mission_slots_used' => (int) $civ->mission_slots_used,
            ],
            'planets' => $planets->map(fn (Planet $p) => [
                'id' => (int) $p->id,
                'coords' => "{$p->galaxy}:{$p->system_pos}:{$p->orbit}",
                'temp' => $p->temp === null ? null : (int) $p->temp,
                'is_homeworld' => (bool) $p->is_homeworld,
                'is_moon' => (bool) $p->is_moon,
                'inventory' => ['M' => (float) $p->inv_m, 'C' => (float) $p->inv_c, 'D' => (float) $p->inv_d],
                'reserved' => ['M' => (float) $p->reserved_m, 'C' => (float) $p->reserved_c, 'D' => (float) $p->reserved_d],
                'levels' => (array) ($p->levels_json ?? []),
                'ships' => (array) ($p->ships_json ?? []),
                'defense' => (array) ($p->defense_json ?? []),
                'queue_building' => (array) ($p->queue_building ?? []),
                'version' => (int) $p->version,
            ])->all(),
            // G10 运营公告：最新一条（客户端服务器模式顶部横幅展示）
            'announcement' => $this->latestAnnouncement(),
        ]);
    }

    private function latestAnnouncement(): ?string
    {
        $row = DB::table('announcements')->orderByDesc('id')->value('message');

        return $row === null ? null : (string) $row;
    }
}
