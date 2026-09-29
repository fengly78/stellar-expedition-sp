<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\CanonicalJson;
use App\Domain\Ledger\LedgerWriter;
use App\Domain\Production\ProductionService;
use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameRuleset;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * game:process-production —— 资源产出推进 Worker（2026-09-29 补接线）。
 *
 * ## 为什么需要这个命令（多人对抗实测发现的阻断级缺陷）
 *
 * `ProductionService::settle()` 的实现是完整的（F-02 基础产量、F-03 能源满足率、
 * F-04 仓容封顶、重氢温度系数、分段积分），但它此前**只被 5 个 Command Handler
 * 在「先结算再变更」（§06.1）时顺带调用**：
 *
 *   BuildStartHandler / ResearchStartHandler / ShipOrderHandler /
 *   FleetDispatchHandler / BuildCompletionService
 *
 * 而 ProcessDueTasks / ProcessDueBuildTasks / ProcessDueFleets / ProcessAiTick
 * **四个 worker 一个都不调用它**。后果：产出**只在玩家下命令的那一瞬间结算**，
 * 玩家一旦闲置，增量恒为 0。
 *
 * 实测（三人对抗局）：闲置 25 秒 M/C/D 增量**精确为 0.000**，
 * `production_checkpoint_at` 滞后 8 小时，三方金属全部见底，
 * 对局退化成「花完就没了、唯一收入是互相掠夺」的零和消耗战。
 *
 * ## 幂等性
 *
 * `settle()` 以 `planets.production_checkpoint_at` 为水位（`$from`）计算 dt，
 * 末尾把检查点推到 `$to`。因此本命令可任意频率重复调用：
 * 同一时刻第二次调用时 dt=0，不会重复入账。与 §06.1 的 pre-settle 天然共存。
 *
 * ## 账本
 *
 * 此前 `settle()` 直接给 `inv` 加值却**不写 resource_transactions 流水**，
 * 于是账本里根本没有 `production` 类型，按 owner 对账必然对不上
 * （实测 ALPHA 账本比实际库存少 88.92 金属 / 3.39 重氢）。
 * 本命令在结算后补记流水，恢复账实相符。
 */
class ProcessProduction extends Command
{
    protected $signature = 'game:process-production';

    protected $description = '推进全部星球的资源产出（补 §06.1 纪律留下的闲置零产出缺口）';

    /** 单次批量上限，避免一次锁表过久。 */
    private const BATCH_LIMIT = 2000;

    public function __construct(
        private readonly ProductionService $production,
        private readonly RulesetLoader $rulesets,
        private readonly LedgerWriter $ledger,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $rulesetRow = GameRuleset::query()
            ->where('status', GameRuleset::STATUS_FROZEN)
            ->orderByDesc('id')
            ->first();
        if ($rulesetRow === null) {
            $this->warn('没有 frozen 规则集，跳过产出推进（fail-closed）。');
            return self::SUCCESS;
        }
        $ruleset = $this->rulesets->load((int) $rulesetRow->id, true);

        $now = Carbon::now('UTC');
        $settled = 0;
        $gained = ['M' => 0.0, 'C' => 0.0, 'D' => 0.0];
        // 分页遍历全表。每批加锁并把库存、检查点、审计行和台账放在同一事务中。
        Planet::query()->chunkById(self::BATCH_LIMIT, function ($page) use ($now, $ruleset, $rulesetRow, &$settled, &$gained) {
            DB::transaction(function () use ($page, $now, $ruleset, $rulesetRow, &$settled, &$gained) {
                $planets = Planet::query()->whereIn('id', $page->pluck('id'))
                    ->orderBy('id')->lockForUpdate()->get();
                $pending = [];
                foreach ($planets as $planet) {
                    $checkpoint = $planet->production_checkpoint_at ?? $now;
                    // 检查点已在更晚的时刻（时钟回拨等）时跳过，避免把水位推回去。
                    if ($checkpoint->floatDiffInSeconds($now) <= 0.0) {
                        continue;
                    }
                    $before = ['M' => (float) $planet->inv_m, 'C' => (float) $planet->inv_c, 'D' => (float) $planet->inv_d];
                    $this->production->settle($planet, $ruleset, $now);
                    $planet->save();

                    $delta = [];
                    foreach (['M', 'C', 'D'] as $res) {
                        $col = 'inv_' . strtolower($res);
                        $d = (float) $planet->$col - $before[$res];
                        if (abs($d) > 1e-9) {
                            $delta[$res] = $d;
                            $gained[$res] += $d;
                        }
                    }
                    if ($delta !== []) {
                        $pending[] = ['planet_id' => (int) $planet->id, 'owner_id' => (int) $planet->owner_id, 'delta' => $delta];
                    }
                    $settled++;
                }
                if ($pending !== []) {
                    $this->writeAuditAndLedger($pending, (int) $rulesetRow->id);
                }
            });
        });

        $this->info(sprintf(
            '推进 %d 个星球产出：金属 +%.2f / 晶体 +%.2f / 重氢 +%.2f',
            $settled, $gained['M'], $gained['C'], $gained['D'],
        ));

        return self::SUCCESS;
    }

    /**
     * 产出审计行 + 台账流水。
     *
     * ⚠ `resource_transactions.command_id` 有指向 `game_commands.command_id` 的**外键**
     * （migration 2026_09_22_000016 显式声明），因此不能凭空编一个 `worker:production`。
     * 这里沿用 GmService 的既定做法：先在 game_commands 落一条系统命令行，
     * 台账再引用它。actor_kind 沿用 'player' + PRODUCTION_SETTLE 类型区分——
     * 与 game:gm CLI 的先例一致；actor_kind 枚举含 CHECK 且 SQLite 原位扩枚举需
     * 整表重建（外键牵连），不值当。
     */
    private function writeAuditAndLedger(array $pending, int $rulesetId): void
    {
        $commandId = (string) Str::uuid();
        $payload = [
            'settled_planets' => count($pending),
            'at' => Carbon::now('UTC')->toIso8601String(),
        ];
        DB::table('game_commands')->insert([
            'command_id' => $commandId,
            'payload_hash' => CanonicalJson::hash($payload),
            'actor_kind' => 'player',
            'actor_id' => 0,
            'owner_id' => 0,
            'type' => 'PRODUCTION_SETTLE',
            'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'ruleset_id' => $rulesetId,
            'status' => 'committed',
            'attempt_count' => 1,
            'submitted_at' => now(),
            'committed_at' => now(),
        ]);

        foreach ($pending as $row) {
            $this->ledger->record(
                $commandId,
                $row['owner_id'],
                $row['planet_id'],
                null,
                $row['delta'],
                'production',
                'mine',
                (string) $row['planet_id'],
            );
        }
    }
}
