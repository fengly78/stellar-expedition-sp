<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * debris_fields（CR-20260923-004 C 候选；上游 OGameX debris_fields 同构）：
 * 战斗残骸按坐标独立成表（非行星列，行星可被废弃而残骸场留存）。
 * 氘不成残骸（GDD-04），列保留与上游同构但 MVP 恒 0；回收机制属 Post-MVP。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('debris_fields', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('galaxy');
            $table->unsignedSmallInteger('system_pos');
            $table->unsignedTinyInteger('orbit');
            $table->decimal('metal', 20, 4)->default(0);
            $table->decimal('crystal', 20, 4)->default(0);
            $table->decimal('deuterium', 20, 4)->default(0);
            $table->unsignedBigInteger('version')->default(0);

            $table->unique(['galaxy', 'system_pos', 'orbit'], 'uq_debris_coords');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('debris_fields');
    }
};
