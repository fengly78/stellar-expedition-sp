<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * fleet_tasks（doc/db-schema-draft.sql）：业务任务状态机，与命令状态分离。
 * 幂等业务键：task_id 唯一 + (task_id, settle_phase) 唯一（重复结算同阶段 → 拒绝）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fleet_tasks', function (Blueprint $table) {
            $table->id();
            $table->char('task_id', 36);
            $table->char('command_id', 36);
            $table->unsignedBigInteger('owner_id');
            $table->enum('mission', ['transport', 'colonize', 'raid', 'scout', 'recall']);
            $table->enum('status', ['outbound', 'holding', 'returning', 'done', 'cancelled']);
            $table->json('ships_json');                              // 在途舰船（锁定组成快照）
            $table->decimal('cargo_m', 20, 4)->default(0);           // InTransit；战利品返航前不可花费
            $table->decimal('cargo_c', 20, 4)->default(0);
            $table->decimal('cargo_d', 20, 4)->default(0);
            $table->unsignedBigInteger('origin_planet_id');
            $table->string('target_coords', 24);
            $table->json('ruleset_snapshot_json');                   // 成本/航时/燃料/规则版本锁定（GDD-10）
            $table->dateTime('depart_at', 6);
            $table->dateTime('arrive_at', 6);                        // 服务器事件时间推进
            $table->string('settle_phase', 24)->nullable();          // 业务阶段幂等键：arrive/return 等
            $table->unique('task_id', 'uq_task_id');
            $table->unique(['task_id', 'settle_phase'], 'uq_task_phase');
            $table->index('arrive_at', 'idx_fleet_due');
            $table->foreign('command_id')->references('command_id')->on('game_commands');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fleet_tasks');
    }
};
