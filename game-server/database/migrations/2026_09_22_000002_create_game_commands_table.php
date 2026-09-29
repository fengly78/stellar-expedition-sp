<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * game_commands（doc/db-schema-draft.sql）：统一命令入口，提交幂等键。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_commands', function (Blueprint $table) {
            $table->id();
            $table->char('command_id', 36);                          // UUID，调用方生成
            $table->char('payload_hash', 64);                        // 同 ID 不同 payload → 拒绝
            $table->enum('actor_kind', ['player', 'pirate_ai', 'governor']);
            $table->unsignedBigInteger('actor_id');
            $table->unsignedBigInteger('owner_id');                  // Actor≠Owner 时须授权
            $table->unsignedBigInteger('authorization_id')->nullable();   // 总督命令必填
            $table->unsignedInteger('authorization_version')->nullable();
            $table->string('type', 40);                              // API-01 §3 命令清单
            $table->json('payload_json');
            $table->unsignedBigInteger('ruleset_id');                // 提交时解析并锁定
            $table->enum('status', ['received', 'validated', 'committed', 'rejected', 'failed']);
            $table->string('reject_reason', 255)->nullable();        // 业务拒绝（不重试）
            $table->string('error_class', 64)->nullable();           // 技术失败分类（可重试）
            $table->unsignedSmallInteger('attempt_count')->default(0);
            $table->json('result_json')->nullable();                 // 已记录结果：重放直接返回
            $table->dateTime('submitted_at', 6);                     // 事件时序以此为准
            $table->dateTime('committed_at', 6)->nullable();

            $table->unique('command_id', 'uq_command_id');
            $table->index(['owner_id', 'submitted_at'], 'idx_owner_time');
            $table->foreign('ruleset_id')->references('id')->on('game_rulesets');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_commands');
    }
};
