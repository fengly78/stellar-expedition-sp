<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * resource_transactions（doc/db-schema-draft.sql）：Ledger——解释来源去向，不是可花费钱包。
 * 权威余额在行星/舰队实际状态表（设计纪律 1）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('resource_transactions', function (Blueprint $table) {
            $table->id();
            $table->char('command_id', 36);
            $table->unsignedBigInteger('owner_id');
            $table->unsignedBigInteger('planet_id')->nullable();     // 舰队在途时为空 + fleet_id
            $table->unsignedBigInteger('fleet_id')->nullable();      // §11 观察项 2：业务键参照，有意不建 FK
            $table->enum('resource', ['M', 'C', 'D']);
            $table->decimal('amount_signed', 20, 4);                 // 正=入，负=出
            $table->string('operation', 32);                         // production/build/research/ship/fuel/transport/plunder/debris/init…
            $table->string('source_ref', 64)->nullable();            // 显式来源
            $table->string('target_ref', 64)->nullable();
            $table->dateTime('created_at', 6)->useCurrent();

            $table->index(['owner_id', 'resource', 'created_at'], 'idx_owner_res');
            $table->foreign('command_id')->references('command_id')->on('game_commands');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resource_transactions');
    }
};
