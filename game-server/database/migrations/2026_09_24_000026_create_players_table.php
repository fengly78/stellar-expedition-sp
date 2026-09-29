<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * players（G1 自助注册）：owner_id ↔ 指挥官代号（展示名；身份凭证是 api_tokens）。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('players', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->string('name', 32);
            $table->timestamp('created_at', 6)->useCurrent();

            $table->unique('owner_id');
            $table->unique('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('players');
    }
};
