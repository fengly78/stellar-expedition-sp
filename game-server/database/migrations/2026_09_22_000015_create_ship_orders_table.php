<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ship_orders（doc/db-schema-draft.sql）：整批扣费（GDD-04），批次号=业务幂等键。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ship_orders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('planet_id');
            $table->char('batch_no', 36);                            // 批次号=业务幂等键
            $table->string('ship', 32);
            $table->unsignedInteger('amount');
            $table->json('cost_snapshot_json');                      // 整批扣费快照（GDD-04）
            $table->unsignedBigInteger('ruleset_id');
            $table->enum('status', ['executing', 'done', 'cancelled']);
            $table->dateTime('complete_at', 6);

            $table->unique('batch_no', 'uq_batch');
            $table->index(['status', 'complete_at'], 'idx_ship_due');
            $table->foreign('planet_id')->references('id')->on('planets');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ship_orders');
    }
};
