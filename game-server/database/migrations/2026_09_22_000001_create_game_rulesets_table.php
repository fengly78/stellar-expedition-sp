<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * game_rulesets（doc/db-schema-draft.sql）：版本化配置，GDD-10。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_rulesets', function (Blueprint $table) {
            $table->id();                                            // BIGINT UNSIGNED AUTO_INCREMENT
            $table->string('ruleset_name', 64);                      // 如 'balance_rc1'
            $table->string('version', 32);
            $table->char('content_hash', 64);                        // sha256，缺失/TBD 拒绝启用
            $table->enum('status', ['candidate', 'testing', 'frozen', 'deprecated']);
            $table->dateTime('effective_at', 6)->nullable();         // 生效时点；任务锁定快照用
            $table->dateTime('deprecated_at', 6)->nullable();
            $table->json('content_json');                            // 完整参数集
            $table->dateTime('created_at', 6)->useCurrent();

            $table->unique(['ruleset_name', 'version'], 'uq_ruleset_ver');
            $table->unique('content_hash', 'uq_ruleset_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_rulesets');
    }
};
