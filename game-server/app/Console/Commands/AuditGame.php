<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:audit —— 运行时完整性/守恒审计（发布 P1-9 监控；可挂调度定时跑）。
 *
 * 检查面（全部状态层，不重算引擎）：
 * 1. 库存/预留非负；舰船/防御 JSON 计数非负。
 * 2. 任务槽守恒：civilizations.mission_slots_used == 在途舰队任务数（outbound/holding/returning）。
 * 3. 研究锁一致性：research_active ⇔ 唯一 executing 研究任务，且 task_id 匹配。
 * 4. 建造单执行：每行星至多 1 个 executing build_task。
 * 5. 卡死命令：received/validated（非终态）超过 5 分钟——总线事务语义下应为瞬态。
 * 6. 残骸场非负。
 *
 * 退出码：0=全部通过；1=有发现（逐条打印 owner/行星与修复提示）。
 */
class AuditGame extends Command
{
    protected $signature = 'game:audit';

    protected $description = '运行时完整性/守恒审计（库存/任务槽/研究锁/单执行/卡死命令）';

    /** @var list<string> */
    private array $findings = [];

    public function handle(): int
    {
        $this->auditInventories();
        $this->auditMissionSlots();
        $this->auditResearchLocks();
        $this->auditBuildTasks();
        $this->auditStuckCommands();
        $this->auditDebris();

        if ($this->findings === []) {
            $this->info('审计通过：库存/任务槽/研究锁/建造单执行/命令终态/残骸 全部一致。');

            return self::SUCCESS;
        }

        foreach ($this->findings as $i => $f) {
            $this->warn(($i + 1) . '. ' . $f);
        }
        $this->error('共 ' . count($this->findings) . ' 项发现（详见上行；修复后重跑本命令验证）。');

        return self::FAILURE;
    }

    private function add(string $finding): void
    {
        $this->findings[] = $finding;
    }

    private function auditInventories(): void
    {
        foreach (DB::table('planets')->get(['id', 'owner_id', 'inv_m', 'inv_c', 'inv_d', 'reserved_m', 'reserved_c', 'reserved_d', 'ships_json', 'defense_json']) as $p) {
            foreach (['inv_m', 'inv_c', 'inv_d', 'reserved_m', 'reserved_c', 'reserved_d'] as $col) {
                if ((float) $p->$col < 0.0) {
                    $this->add("planets#{$p->id}（owner {$p->owner_id}）{$col} 为负：{$p->$col}");
                }
            }
            foreach ([['ships_json', '舰船'], ['defense_json', '防御']] as [$jsonCol, $label]) {
                $counts = json_decode((string) $p->$jsonCol, true) ?? [];
                foreach ($counts as $name => $n) {
                    if ((int) $n < 0) {
                        $this->add("planets#{$p->id} {$label} {$name} 计数为负：{$n}");
                    }
                }
            }
        }
    }

    private function auditMissionSlots(): void
    {
        $active = DB::table('fleet_tasks')
            ->whereIn('status', ['outbound', 'holding', 'returning'])
            ->selectRaw('owner_id, COUNT(*) AS n')
            ->groupBy('owner_id')
            ->pluck('n', 'owner_id');

        foreach (DB::table('civilizations')->get(['owner_id', 'mission_slots_used']) as $civ) {
            $actual = (int) ($active[$civ->owner_id] ?? 0);
            if ((int) $civ->mission_slots_used !== $actual) {
                $this->add(
                    "civilizations(owner {$civ->owner_id}) 任务槽漂移：记录 {$civ->mission_slots_used}，在途任务 {$actual}" .
                    '（修复：UPDATE civilizations SET mission_slots_used=' . $actual . ' WHERE owner_id=' . $civ->owner_id . '）',
                );
            }
        }
    }

    private function auditResearchLocks(): void
    {
        $executing = DB::table('research_tasks')->where('status', 'executing')->get(['id', 'owner_id', 'tech']);

        foreach (DB::table('civilizations')->get(['owner_id', 'research_active']) as $civ) {
            $mine = $executing->where('owner_id', $civ->owner_id);
            $lock = $civ->research_active !== null ? json_decode((string) $civ->research_active, true) : null;

            if ($lock === null) {
                if ($mine->count() > 0) {
                    $this->add("owner {$civ->owner_id} 无研究锁但有 executing 研究任务（Worker 完成未释放或锁丢失）");
                }
                continue;
            }
            if ($mine->count() !== 1) {
                $this->add("owner {$civ->owner_id} 研究锁存在但 executing 任务数={$mine->count()}（应为 1）");
                continue;
            }
            if ((int) ($lock['task_id'] ?? -1) !== (int) $mine->first()->id) {
                $this->add("owner {$civ->owner_id} 研究锁 task_id 不匹配：锁指向 {$lock['task_id']}，实际 {$mine->first()->id}");
            }
        }

        // 有 executing 任务但对应文明无锁（反向孤儿）
        $lockedOwners = DB::table('civilizations')->whereNotNull('research_active')->pluck('owner_id');
        foreach ($executing as $t) {
            if (! $lockedOwners->contains($t->owner_id)) {
                $this->add("research_tasks#{$t->id}（owner {$t->owner_id}）executing 但文明无研究锁");
            }
        }
    }

    private function auditBuildTasks(): void
    {
        $dupes = DB::table('build_tasks')
            ->where('status', 'executing')
            ->selectRaw('planet_id, COUNT(*) AS n')
            ->groupBy('planet_id')
            ->having('n', '>', 1)
            ->get();
        foreach ($dupes as $d) {
            $this->add("planets#{$d->planet_id} 有 {$d->n} 个 executing 建造任务（每行星至多 1，锁序被破坏）");
        }
    }

    private function auditStuckCommands(): void
    {
        $cutoff = now()->subMinutes(5);
        $stuck = DB::table('game_commands')
            ->whereIn('status', ['received', 'validated'])
            ->where('submitted_at', '<', $cutoff)
            ->count();
        if ($stuck > 0) {
            $this->add("game_commands 有 {$stuck} 条非终态命令超过 5 分钟（总线事务语义下应为瞬态——检查进程中断/事务回滚日志）");
        }
    }

    private function auditDebris(): void
    {
        $bad = DB::table('debris_fields')
            ->where('metal', '<', 0)->orWhere('crystal', '<', 0)->orWhere('deuterium', '<', 0)
            ->count();
        if ($bad > 0) {
            $this->add("debris_fields 有 {$bad} 行负值残骸");
        }
    }
}
