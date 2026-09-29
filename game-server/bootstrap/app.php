<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'game.auth' => \App\Http\Middleware\GameTokenAuth::class,
            'gm.auth' => \App\Http\Middleware\GmAuth::class,
        ]);
        // 2026-09-29：API 一律按 JSON 应答。不带 Accept: application/json 的客户端
        // 原本会走 HTML 错误渲染路径，而该路径依赖 session（当时 sessions 表不存在）
        // → 本该 422 的请求变成 500 + 完整 Laravel 调试页。
        $middleware->api(append: [\App\Http\Middleware\ForceJsonResponse::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
