<?php

declare(strict_types=1);

use App\Http\Controllers\CommandController;
use App\Http\Controllers\GmController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\StateController;
use Illuminate\Support\Facades\Route;

/*
| 新OGame MVP API（API-01 命令契约的 HTTP 面）
| 资产变更唯一入口：POST /api/v1/commands（统一命令信封，§1）
| 状态读面：GET /api/v1/state；战报读面：GET /api/v1/reports（§12 扩展）
| 自助注册：POST /api/v1/register（G1；开档+令牌一次性返回）
| 鉴权：Bearer Token（game:issue-token 或注册下发）；限流 60/分。
*/
Route::prefix('v1')->group(function () {
    Route::get('/health', fn () => ['status' => 'ok', 'ts' => now()->toIso8601String()]);   // 公开探针

    Route::middleware(['game.auth', 'throttle:60,1'])->group(function () {
        Route::post('/commands', [CommandController::class, 'submit']);
        Route::get('/commands/{commandId}', [CommandController::class, 'show']);   // 重放/查询已记录结果
        Route::get('/state', [StateController::class, 'show']);                    // 状态读面（owner_id 查询参数）
        Route::get('/reports', [ReportController::class, 'index']);                // 战报读面（owner_id 查询参数）
        Route::get('/intel', [ReportController::class, 'intel']);                  // 最新侦察快照（G6 模拟器回填）
    });

    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/register', [RegisterController::class, 'store']);            // 自助注册（严限流）
    });

    /*
    | G10 GM 管理后台：X-GM-Key 鉴权（fail-closed，未配置 GM_KEY 即 403）。
    | 独立于玩家 Bearer Token——运营凭据不与玩家凭据混用。
    */
    Route::prefix('gm')->middleware(['gm.auth', 'throttle:60,1'])->group(function () {
        Route::get('/players', [GmController::class, 'players']);
        Route::post('/grant', [GmController::class, 'grant']);
        Route::post('/level', [GmController::class, 'level']);
        Route::post('/ban', [GmController::class, 'ban']);
        Route::post('/unban', [GmController::class, 'unban']);
        Route::post('/announce', [GmController::class, 'announce']);
        Route::get('/audit', [GmController::class, 'audit']);
    });
});
