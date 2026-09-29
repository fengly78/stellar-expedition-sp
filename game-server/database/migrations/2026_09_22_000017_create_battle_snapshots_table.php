<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * battle_snapshots（doc/db-schema-draft.sql）：battle_id = 业务幂等键；
 * snapshot_version 乐观锁——陈旧计算禁止覆盖（§07.2）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('battle_snapshots', function (Blueprint $table) {
            $table->id();
            // 前缀+uuid 形态：battle-{uuid}(43) / counteresp-{uuid}(48)——MariaDB 严格截断校验
            // 抓到 CHAR(36) 过短（2026-09-23 P0-4 验证；SQLite 不校验长度故漏网），取 64。
            $table->string('battle_id', 64);
            $table->char('command_id', 36);                          // 触发抵达的命令
            $table->unsignedBigInteger('ruleset_id');
            $table->string('engine_version', 32);                    // Rust Classic 模块版本 + 等价语料版本
            $table->unsignedBigInteger('seed');
            $table->json('participants_json');                       // 参战方+科技快照（协调器生成）
            $table->json('rounds_json')->nullable();                 // 引擎输出（结算前）
            $table->json('result_json')->nullable();                 // 损毁/存活/掠夺/残骸（结算后）
            $table->dateTime('snapshot_at', 6);                      // 防守方资产快照时刻
            $table->dateTime('settled_at', 6)->nullable();
            $table->unsignedBigInteger('snapshot_version');

            $table->unique('battle_id', 'uq_battle_id');
            $table->foreign('command_id')->references('command_id')->on('game_commands');
            $table->foreign('ruleset_id')->references('id')->on('game_rulesets');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('battle_snapshots');
    }
};
