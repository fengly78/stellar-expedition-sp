<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * GameTokenAuth（发布 P0-2）：Bearer Token → owner 绑定。
 *
 * - 请求带 Authorization: Bearer <token> → 校验 sha256 命中 → attributes['game_owner_id']。
 * - 未带 token：GAME_AUTH_ENFORCED（默认 true）→ 401；false（开发应急开关）→ 放行走旧口径。
 * - 越权（token 与请求 owner 不符）由各端点按业务语义拒绝（403）——读面比对 query 参数，
 *   命令面比对信封 owner_id（总督命令的 owner 仍是资产所有者，语义不变）。
 */
class GameTokenAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $enforced = (bool) config('services.game.auth_enforced');
        $plain = $request->bearerToken();

        if ($plain === null || $plain === '') {
            if ($enforced) {
                return response()->json([
                    'error' => '未授权：缺少 Bearer Token。服务端执行 game:issue-token {owner_id} 获取，粘贴到客户端 Token 输入框。',
                ], 401);
            }

            return $next($request);   // 开发开关关闭：旧口径（owner_id 明文传递）
        }

        $row = DB::table('api_tokens')->where('token_hash', hash('sha256', $plain))->first();
        if ($row === null) {
            return response()->json(['error' => '未授权：令牌无效或已轮换。'], 401);
        }

        // G10 封禁：banned 玩家所有玩家面请求 403（读/写/命令全拒），文案带原因。
        $player = DB::table('players')->where('owner_id', (int) $row->owner_id)->first();
        if ($player !== null && $player->banned_at !== null) {
            $reason = (string) ($player->ban_reason ?? '');
            return response()->json(['error' => '账号已被封禁' . ($reason !== '' ? "：{$reason}" : '。')], 403);
        }

        DB::table('api_tokens')->where('id', $row->id)->update(['last_used_at' => now()]);
        $request->attributes->set('game_owner_id', (int) $row->owner_id);

        return $next($request);
    }
}
