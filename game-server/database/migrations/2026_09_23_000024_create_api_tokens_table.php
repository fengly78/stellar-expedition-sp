<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * api_tokens（发布 P0-2 鉴权）：owner ↔ 访问令牌（sha256 哈希落库，明文只在签发时展示一次）。
 * 每 owner 单有效令牌（重签即轮换）；last_used_at 供审计。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_tokens', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->char('token_hash', 64);                 // sha256(明文)
            $table->timestamp('last_used_at', 6)->nullable();
            $table->timestamp('created_at', 6)->useCurrent();

            $table->unique('owner_id');                      // 每 owner 一枚有效令牌
            $table->unique('token_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_tokens');
    }
};
