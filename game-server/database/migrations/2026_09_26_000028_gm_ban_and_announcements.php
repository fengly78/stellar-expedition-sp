<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * G10 GM 后台：
 * - players.banned_at/ban_reason：封禁标记（GameTokenAuth 对 banned 玩家 403）。
 * - announcements：运营公告（玩家 state 投影最新一条；web 服务器模式顶部横幅展示）。
 *
 * 说明：GM 审计行落 game_commands（actor_kind='player' + type=GM_*，与 game:gm CLI
 * 先例一致）。曾尝试为 actor_kind 枚举增补 'gm'，但 SQLite 的 enum 是建表 CHECK，
 * 原位改需要整表重建，牵连 resource_transactions 等表的外键重写（PRAGMA 在事务内
 * 无效）——风险大于收益，放弃。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('players', function (Blueprint $table) {
            $table->timestamp('banned_at', 6)->nullable();
            $table->string('ban_reason', 200)->nullable();
        });

        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->string('message', 300);
            $table->timestamp('created_at', 6)->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcements');
        Schema::table('players', function (Blueprint $table) {
            $table->dropColumn(['banned_at', 'ban_reason']);
        });
    }
};
