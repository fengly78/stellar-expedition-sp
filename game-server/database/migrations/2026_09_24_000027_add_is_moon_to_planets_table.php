<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * G7 月球生成（经典 0.84 同构）：planets 补 is_moon 列；
 * uq_coords 改为 (galaxy, system_pos, orbit, is_moon) 复合唯一——
 * 月球与行星**同坐标共存**（经典语义：同一槽位的行星+月球）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('planets', function (Blueprint $table) {
            $table->boolean('is_moon')->default(false)->after('is_homeworld');
            $table->dropUnique('uq_coords');
            $table->unique(['galaxy', 'system_pos', 'orbit', 'is_moon'], 'uq_coords_moon');
        });
    }

    public function down(): void
    {
        Schema::table('planets', function (Blueprint $table) {
            $table->dropUnique('uq_coords_moon');
            $table->unique(['galaxy', 'system_pos', 'orbit'], 'uq_coords');
            $table->dropColumn('is_moon');
        });
    }
};
