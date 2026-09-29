<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * planets（doc/db-schema-draft.sql）：核心状态表。库存四态中 Inventory/Reserved 共享物理字段；
 * 可花费 = inv − reserved（GDD-13）。乐观锁 version（锁顺序：文明→行星→舰队→目标）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('planets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');                  // 首版兼容玩家账号字段（§07.1）
            $table->unsignedSmallInteger('galaxy');
            $table->unsignedSmallInteger('system_pos');
            $table->unsignedTinyInteger('orbit');
            $table->boolean('is_homeworld')->default(false);         // 主星保留/不可占领（GDD-09）
            $table->decimal('inv_m', 20, 4)->default(0);             // Inventory（可花费=inv−reserved）
            $table->decimal('inv_c', 20, 4)->default(0);
            $table->decimal('inv_d', 20, 4)->default(0);
            $table->decimal('reserved_m', 20, 4)->default(0);        // Reserved 共享物理字段
            $table->decimal('reserved_c', 20, 4)->default(0);
            $table->decimal('reserved_d', 20, 4)->default(0);
            $table->json('levels_json');                             // 建筑等级（建筑属于行星）
            $table->json('ships_json');                              // 在港舰船（与在途/在建互斥口径）
            $table->json('queue_building');                          // 3 待执行+1 执行（02.2）
            $table->dateTime('production_checkpoint_at', 6);         // 分段生产检查点（离线恢复）
            $table->unsignedBigInteger('version')->default(0);       // 乐观锁

            $table->unique(['galaxy', 'system_pos', 'orbit'], 'uq_coords');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('planets');
    }
};
