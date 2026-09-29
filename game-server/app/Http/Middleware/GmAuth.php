<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * GmAuth（G10 GM 后台）：X-GM-Key 头与 GM_KEY 配置 hash_equals 比对。
 *
 * fail-closed：GM_KEY 未配置 → 一律 403（生产忘配密钥时 GM 面不可用而不是裸奔）。
 * GM 操作独立于玩家 Bearer Token——运营凭据不与玩家凭据混用。
 */
class GmAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.game.gm_key');
        if ($expected === '') {
            return response()->json(['error' => 'GM 后台未启用：服务端未配置 GM_KEY。'], 403);
        }
        $given = (string) $request->header('X-GM-Key', '');
        if ($given === '' || !hash_equals($expected, $given)) {
            return response()->json(['error' => 'GM 密钥无效。'], 403);
        }

        return $next($request);
    }
}
