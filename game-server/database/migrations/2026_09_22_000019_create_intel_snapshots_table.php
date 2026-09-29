<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * intel_snapshots（doc/db-schema-draft.sql）：GDD-12 快照制，无实时订阅；
 * 只读本 Owner 合法情报；observed_at 为新鲜度评价基准。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('intel_snapshots', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->string('target_ref', 64);
            $table->dateTime('observed_at', 6);
            $table->json('visible_fields_json');                     // 可见字段+精度说明
            $table->unsignedBigInteger('ruleset_id');
            $table->char('source_command', 36);                      // 侦察任务实际派船产生（§11 观察项 2：无 FK）

            $table->index(['owner_id', 'target_ref', 'observed_at'], 'idx_owner_target');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intel_snapshots');
    }
};
