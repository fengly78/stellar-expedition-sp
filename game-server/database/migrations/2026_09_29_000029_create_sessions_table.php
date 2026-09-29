<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * sessions 表（2026-09-29 补）。
 *
 * `.env` 的 `SESSION_DRIVER=database`，但本项目从未建过 sessions 表
 * （全库 28 条迁移里没有它）。后果比"少一张表"严重：
 * **框架渲染任何错误页时都要读写 session**。于是——
 *
 *   - 未带 `Accept: application/json` 的客户端（例如直接 curl / 第三方脚本）
 *     提交一个形状非法的命令，Laravel 试图渲染 HTML 错误页 → 读 session → 表不存在
 *     → **500**，而不是本该返回的 422。
 *   - 叠加 `APP_DEBUG=true`，客户端拿到的是**完整的 Laravel 调试页**（含堆栈），
 *     而不是一个 422。
 *
 * 实测：`Accept: application/json` → 422（正确）；不带 Accept → 500 + HTML 调试页。
 *
 * 补这张表让错误渲染路径不再崩溃；JSON 化与中文文案由另外两处各自负责。
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sessions')) {
            return;
        }
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};
