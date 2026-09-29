<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * game_outbox（doc/db-schema-draft.sql）：同事务持久化，提交后发布；消息可重复、效果不重复。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_outbox', function (Blueprint $table) {
            $table->id();
            $table->char('command_id', 36);
            $table->string('event_type', 64);
            $table->json('payload_json');
            $table->dateTime('published_at', 6)->nullable();         // NULL=待发布，可重试
            $table->dateTime('created_at', 6)->useCurrent();

            $table->index('published_at', 'idx_unpublished');
            // 外键参照 command_id 唯一键（§11 观察项 3：InnoDB 合法，属设计意图）
            $table->foreign('command_id')->references('command_id')->on('game_commands');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_outbox');
    }
};
