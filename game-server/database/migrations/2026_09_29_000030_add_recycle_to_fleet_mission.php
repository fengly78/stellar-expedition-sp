<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * fleet_tasks.mission 增加 recycle（残骸回收），2026-09-29。
 *
 * ## 为什么需要这条迁移
 *
 * 残骸回收功能本身已在 `FleetArrivalService::recycleArrive` /
 * `DebrisFieldService::collect` 落地，但 `mission` 列建表时是
 * `enum('transport','colonize','raid','scout','recall')`——**不含 recycle**。
 * 结果是插任务时直接撞 CHECK 约束：
 *   `SQLSTATE[23000]: Integrity constraint violation: 19 CHECK constraint failed: mission`
 * 也就是「代码能走到、但任务根本建不出来」。
 *
 * ## 为什么必须整表重建
 *
 * SQLite 的 `enum` 是**建表时写死在表定义里的 CHECK 约束**，
 * 没有 `ALTER TABLE ... ALTER COLUMN` 能改它，只能重建表。
 * 已确认**没有任何外键引用 fleet_tasks**（`resource_transactions.fleet_id`
 * 按 §11 观察项 2 的既定设计「有意不建 FK」），所以重建不会牵连其他表。
 *
 * 与 `2026_09_26_000028` 里那条注释（曾想给 actor_kind 增补 'gm' 但放弃，
 * 因为牵连外键重写）不同——这里没有外键牵连，风险可控。
 *
 * 重建时**逐列照搬**原定义（含两个唯一索引、事件序索引、外键），
 * 避免「顺手改表」把幂等键或外键弄丢。
 */
return new class extends Migration
{
    /** 任务类型全集。新增类型必须同时改这里。 */
    private const MISSIONS = ['transport', 'colonize', 'raid', 'scout', 'recall', 'recycle'];

    public function up(): void
    {
        // 已有 recycle 行说明 schema 已是新集合，可重入直接跳过
        if (DB::table('fleet_tasks')->where('mission', 'recycle')->exists()) {
            return;
        }

        Schema::disableForeignKeyConstraints();
        Schema::rename('fleet_tasks', 'fleet_tasks_mission_migration_tmp');

        // SQLite 的索引**跟着表走且保留原名**——`ALTER TABLE ... RENAME TO` 不会给索引改名。
        // 所以必须先删掉旧索引，否则下面建新表时同名索引会直接撞车。
        // （实测踩过：index uq_task_id already exists，整库 104 个用例全挂。）
        // 数据已随表改名保留在临时表里，删索引不影响数据。
        $this->dropIndexes('fleet_tasks_mission_migration_tmp');

        Schema::create('fleet_tasks', function (Blueprint $table) {
            $table->id();
            $table->char('task_id', 36);
            $table->char('command_id', 36);
            $table->unsignedBigInteger('owner_id');
            $table->enum('mission', self::MISSIONS);
            $table->enum('status', ['outbound', 'holding', 'returning', 'done', 'cancelled']);
            $table->json('ships_json');                              // 在途舰船（锁定组成快照）
            $table->decimal('cargo_m', 20, 4)->default(0);           // InTransit；战利品返航前不可花费
            $table->decimal('cargo_c', 20, 4)->default(0);
            $table->decimal('cargo_d', 20, 4)->default(0);
            $table->unsignedBigInteger('origin_planet_id');
            $table->string('target_coords', 24);
            $table->json('ruleset_snapshot_json');                   // 成本/航时/燃料/规则版本锁定（GDD-10）
            $table->dateTime('depart_at', 6);
            $table->dateTime('arrive_at', 6);                        // 服务器事件时间推进
            $table->string('settle_phase', 24)->nullable();          // 业务阶段幂等键：arrive/return 等
            $table->unique('task_id', 'uq_task_id');
            $table->unique(['task_id', 'settle_phase'], 'uq_task_phase');
            $table->index('arrive_at', 'idx_fleet_due');
            $table->foreign('command_id')->references('command_id')->on('game_commands');
        });

        // 列顺序照搬原表，避免 AUTOINCREMENT 主键与列序错位
        DB::statement(
            'INSERT INTO fleet_tasks (id, task_id, command_id, owner_id, mission, status, ships_json,
                cargo_m, cargo_c, cargo_d, origin_planet_id, target_coords, ruleset_snapshot_json,
                depart_at, arrive_at, settle_phase)
             SELECT id, task_id, command_id, owner_id,
                CASE mission
                    WHEN \'recall\' THEN \'recall\'
                    ELSE mission
                END,
                status, ships_json, cargo_m, cargo_c, cargo_d, origin_planet_id, target_coords,
                ruleset_snapshot_json, depart_at, arrive_at, settle_phase
             FROM fleet_tasks_mission_migration_tmp'
        );

        Schema::drop('fleet_tasks_mission_migration_tmp');
        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // 回退需要把 recycle 任务从表里清掉，否则重建时插不进去。
        DB::table('fleet_tasks')->where('mission', 'recycle')->delete();

        Schema::disableForeignKeyConstraints();
        Schema::rename('fleet_tasks', 'fleet_tasks_mission_rollback_tmp');
        $this->dropIndexes('fleet_tasks_mission_rollback_tmp');
        Schema::create('fleet_tasks', function (Blueprint $table) {
            $table->id();
            $table->char('task_id', 36);
            $table->char('command_id', 36);
            $table->unsignedBigInteger('owner_id');
            $table->enum('mission', ['transport', 'colonize', 'raid', 'scout', 'recall']);
            $table->enum('status', ['outbound', 'holding', 'returning', 'done', 'cancelled']);
            $table->json('ships_json');
            $table->decimal('cargo_m', 20, 4)->default(0);
            $table->decimal('cargo_c', 20, 4)->default(0);
            $table->decimal('cargo_d', 20, 4)->default(0);
            $table->unsignedBigInteger('origin_planet_id');
            $table->string('target_coords', 24);
            $table->json('ruleset_snapshot_json');
            $table->dateTime('depart_at', 6);
            $table->dateTime('arrive_at', 6);
            $table->string('settle_phase', 24)->nullable();
            $table->unique('task_id', 'uq_task_id');
            $table->unique(['task_id', 'settle_phase'], 'uq_task_phase');
            $table->index('arrive_at', 'idx_fleet_due');
            $table->foreign('command_id')->references('command_id')->on('game_commands');
        });
        DB::statement(
            'INSERT INTO fleet_tasks (id, task_id, command_id, owner_id, mission, status, ships_json,
                cargo_m, cargo_c, cargo_d, origin_planet_id, target_coords, ruleset_snapshot_json,
                depart_at, arrive_at, settle_phase)
             SELECT id, task_id, command_id, owner_id, mission, status, ships_json,
                cargo_m, cargo_c, cargo_d, origin_planet_id, target_coords, ruleset_snapshot_json,
                depart_at, arrive_at, settle_phase
             FROM fleet_tasks_mission_rollback_tmp'
        );
        Schema::drop('fleet_tasks_mission_rollback_tmp');
        Schema::enableForeignKeyConstraints();
    }

    private function dropIndexes(string $table): void
    {
        $driver = DB::connection()->getDriverName();
        if ($driver === 'mysql') {
            // MariaDB keeps foreign-key constraint names at schema scope when a
            // table is renamed. Remove the old constraint before recreating the
            // table, otherwise the new fleet_tasks constraint collides with it.
            DB::statement("ALTER TABLE `{$table}` DROP FOREIGN KEY `fleet_tasks_command_id_foreign`");
        }
        foreach (['uq_task_id', 'uq_task_phase', 'idx_fleet_due'] as $index) {
            if ($driver === 'mysql') {
                DB::statement("DROP INDEX IF EXISTS `{$index}` ON `{$table}`");
            } else {
                DB::statement('DROP INDEX IF EXISTS "'.$index.'"');
            }
        }
    }
};
