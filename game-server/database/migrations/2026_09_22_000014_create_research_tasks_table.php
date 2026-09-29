<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * research_tasks（doc/db-schema-draft.sql）：文明锁——同事务 FOR UPDATE civilization 行。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('research_tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->string('tech', 32);
            $table->unsignedSmallInteger('target_level');
            $table->json('cost_snapshot_json');
            $table->unsignedBigInteger('ruleset_id');
            $table->enum('status', ['executing', 'done', 'cancelled']);
            $table->dateTime('complete_at', 6);

            $table->index(['status', 'complete_at'], 'idx_research_due');
            $table->foreign('ruleset_id')->references('id')->on('game_rulesets');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_tasks');
    }
};
