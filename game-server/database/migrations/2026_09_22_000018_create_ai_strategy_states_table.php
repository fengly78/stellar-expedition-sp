<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ai_strategy_states（doc/db-schema-draft.sql）：GDD-05 两枚举分离——行为类别 ≠ 策略状态。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_strategy_states', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->enum('behavior_class', ['BUILD', 'SCOUT', 'RAID', 'RECOVER']);
            $table->enum('strategy_state', ['GROWTH', 'SCOUTING', 'RAIDING', 'DEFENSIVE', 'RECOVERY']);
            $table->dateTime('state_entered_at', 6);
            $table->json('context_json')->nullable();

            $table->index('owner_id', 'idx_owner');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_strategy_states');
    }
};
