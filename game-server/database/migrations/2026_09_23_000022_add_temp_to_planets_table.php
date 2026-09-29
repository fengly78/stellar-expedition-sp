<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * planets 补温度列（SOURCE-02 经典 0.84 同构；CR 候选 RESOURCE.D.TEMPERATURE 的数据前提）。
 * 经典语义：temp 为该星**最低温度**，驱动重氢产量系数 (1.28−0.002×(temp+40)) 与太阳能卫星产能。
 * 可空：旧行未定温时按无系数处理（fail-closed 不改变既有数值行为）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('planets', function (Blueprint $table) {
            $table->smallInteger('temp')->nullable()->after('orbit');   // 最低温度（摄氏）
        });
    }

    public function down(): void
    {
        Schema::table('planets', function (Blueprint $table) {
            $table->dropColumn('temp');
        });
    }
};
