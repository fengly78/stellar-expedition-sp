<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * 强制 API 一律按 JSON 应答。
 *
 * 2026-09-29（ALPHA 试玩报「422 文案是英文」时顺带查出的更严重问题）：
 * 客户端若**不带** `Accept: application/json`（curl、第三方脚本、某些 SDK），
 * Laravel 会把形状校验失败当成 web 请求去渲染 HTML 错误页；而错误渲染要读写 session，
 * `sessions` 表当时并不存在（`SESSION_DRIVER=database` 却无对应迁移），
 * 于是本该 422 的请求变成 **500 + 完整 Laravel 调试页**（APP_DEBUG=true 时含堆栈）。
 *
 * API 是纯机器接口，不存在"要 HTML 页面"这一诉求，因此直接强制 JSON：
 * 既杜绝调试页外泄，也让状态码语义与 Accept 头无关（客户端更稳）。
 */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
