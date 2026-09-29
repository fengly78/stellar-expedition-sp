<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * planets 补 defense_json（SOURCE-02 经典防御玩法）：
 * 防御设施（火箭/激光/高斯/离子/等离子/护盾穹顶）按名字=>数量存于本列，
 * 与 ships_json（在港舰队）互为独立内容——战斗中防御以第二防守舰队编入（经典语义）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('planets', function (Blueprint $table) {
            $table->json('defense_json')->nullable()->after('ships_json');
        });
    }

    public function down(): void
    {
        Schema::table('planets', function (Blueprint $table) {
            $table->dropColumn('defense_json');
        });
    }
};
