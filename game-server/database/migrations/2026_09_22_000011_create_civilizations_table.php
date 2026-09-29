<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * civilizations（doc/db-schema-draft.sql）：科技属于文明；文明同时至多 1 项研究。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('civilizations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id')->unique();
            $table->json('techs_json');                              // 科技属于文明
            $table->json('research_active')->nullable();             // 文明同时至多 1 项（含锁）
            $table->unsignedSmallInteger('mission_slots_used')->default(0);  // F-06：2+COMPUTER
            $table->enum('protection_state', ['N0', 'N1', 'N2', 'N3'])->default('N0');
            $table->unsignedBigInteger('version')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('civilizations');
    }
};
