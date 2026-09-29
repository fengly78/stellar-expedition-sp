<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * build_tasks（doc/db-schema-draft.sql）：每行星至多 1 执行中——由事务内
 * SELECT ... FOR UPDATE 行星行保证（锁顺序 §4），不另建函数索引。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('build_tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('planet_id');
            $table->string('building', 32);
            $table->unsignedSmallInteger('target_level');
            $table->decimal('cost_m', 20, 4);                        // 启动时实际扣费快照
            $table->decimal('cost_c', 20, 4);
            $table->decimal('cost_d', 20, 4);
            $table->unsignedBigInteger('ruleset_id');
            $table->enum('status', ['executing', 'done', 'cancelled']);
            $table->dateTime('complete_at', 6);

            $table->index(['status', 'complete_at'], 'idx_build_due');
            $table->foreign('planet_id')->references('id')->on('planets');
            $table->foreign('ruleset_id')->references('id')->on('game_rulesets');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('build_tasks');
    }
};
