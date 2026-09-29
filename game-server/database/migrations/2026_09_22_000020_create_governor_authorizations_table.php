<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * governor_authorizations（doc/db-schema-draft.sql）：GDD-06 授权版本化；
 * 撤销阻止未承诺动作，不删在途舰队。
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('governor_authorizations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->unsignedInteger('version');
            $table->json('scope_json');                              // 行星/动作/单笔+周期预算/最低储备/禁止资源/有效期
            $table->dateTime('revoked_at', 6)->nullable();
            $table->dateTime('created_at', 6)->useCurrent();

            $table->unique(['owner_id', 'version'], 'uq_owner_ver');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('governor_authorizations');
    }
};
