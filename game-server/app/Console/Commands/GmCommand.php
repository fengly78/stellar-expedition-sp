<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\CanonicalJson;
use App\Domain\Ledger\LedgerWriter;
use App\Models\GameRuleset;
use App\Models\Planet;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:gm —— GM/客服工具（G10；运营必备）。
 *
 * 动词：
 *   resources {owner_id} [--M=0 --C=0 --D=0] [--planet=id]  发放资源（默认母星；可为负=扣回）
 *   level     {owner_id} --planet=id --building=KEY --level=N   直接设置建筑等级（事件/运营修复）
 *
 * 审计纪律：每次操作落一条 game_commands 系统命令行（type=GM_*，与 BOOTSTRAP 同形态）
 * + 资源变动入台账（operation=gm）——game_commands 表即 GM 操作日志，可追溯。
 * 数值纪律：不读任何 Balance 键（发放量/等级由运营指令显式给出）。
 */
class GmCommand extends Command
{
    protected $signature = 'game:gm
        {verb : resources|level}
        {owner_id : 玩家 owner_id}
        {--M=0 : 资源：金属增量（可为负）}
        {--C=0 : 资源：晶体增量}
        {--D=0 : 资源：重氢增量}
        {--planet= : 目标行星 id（缺省=母星）}
        {--building= : level 动词：建筑键（如 METAL_MINE）}
        {--level= : level 动词：目标等级（0 起）}';

    protected $description = 'GM/客服工具：资源发放与建筑等级设置（全程审计留痕）';

    public function handle(LedgerWriter $ledger): int
    {
        $verb = (string) $this->argument('verb');
        $ownerId = (int) $this->argument('owner_id');
        if ($ownerId <= 0) {
            $this->error('owner_id 必须为正整数');

            return self::FAILURE;
        }

        $planet = $this->resolvePlanet($ownerId);
        if ($planet === null) {
            return self::FAILURE;
        }

        return match ($verb) {
            'resources' => $this->grantResources($ledger, $planet, $ownerId),
            'level' => $this->setLevel($planet, $ownerId),
            default => $this->usageError("未知动词 {$verb}（可用：resources | level）"),
        };
    }

    private function resolvePlanet(int $ownerId): ?Planet
    {
        $pid = $this->option('planet');
        /** @var Planet|null $planet */
        $planet = $pid !== null
            ? Planet::query()->where('id', (int) $pid)->lockForUpdate()->first()
            : Planet::query()->where('owner_id', $ownerId)->where('is_homeworld', true)->first();
        if ($planet === null || (int) $planet->owner_id !== $ownerId) {
            $this->error("行星不存在或不属于 owner {$ownerId}");

            return null;
        }

        return $planet;
    }

    private function grantResources(LedgerWriter $ledger, Planet $planet, int $ownerId): int
    {
        $d = ['M' => (float) $this->option('M'), 'C' => (float) $this->option('C'), 'D' => (float) $this->option('D')];
        if ($d['M'] == 0.0 && $d['C'] == 0.0 && $d['D'] == 0.0) {
            return $this->usageError('未指定增量（--M/--C/--D 至少一项非零）');
        }

        return DB::transaction(function () use ($ledger, $planet, $ownerId, $d) {
            $ruleset = GameRuleset::query()->where('status', GameRuleset::STATUS_FROZEN)->orderByDesc('id')->first();
            if ($ruleset === null) {
                $this->error('无 frozen 规则集（命令行归因需要）');

                return self::FAILURE;
            }

            $planet->inv_m = (float) $planet->inv_m + $d['M'];
            $planet->inv_c = (float) $planet->inv_c + $d['C'];
            $planet->inv_d = (float) $planet->inv_d + $d['D'];
            if ($planet->inv_m < 0 || $planet->inv_c < 0 || $planet->inv_d < 0) {
                $this->error('扣回后库存为负——拒绝（守恒红线）');

                return self::FAILURE;
            }
            $planet->version++;
            $planet->save();

            $commandId = \Illuminate\Support\Str::uuid()->toString();
            $payload = ['planet_id' => (int) $planet->id, 'delta' => $d];
            DB::table('game_commands')->insert([
                'command_id' => $commandId,
                'payload_hash' => CanonicalJson::hash($payload),
                'actor_kind' => 'player', 'actor_id' => $ownerId, 'owner_id' => $ownerId,
                'type' => 'GM_RESOURCES',
                'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'ruleset_id' => $ruleset->id,
                'status' => 'committed', 'attempt_count' => 1,
                'submitted_at' => now(), 'committed_at' => now(),
                'result_json' => json_encode(['after' => [
                    'M' => $planet->inv_m, 'C' => $planet->inv_c, 'D' => $planet->inv_d,
                ]], JSON_UNESCAPED_UNICODE),
            ]);
            $ledger->record($commandId, $ownerId, (int) $planet->id, null, $d, 'gm', 'gm-console', (string) $planet->id);

            $this->info("已入账 planets#{$planet->id}：ΔM {$d['M']} / ΔC {$d['C']} / ΔD {$d['D']}"
                . " → 现余 M {$planet->inv_m} / C {$planet->inv_c} / D {$planet->inv_d}（命令行 {$commandId}）");

            return self::SUCCESS;
        });
    }

    private function setLevel(Planet $planet, int $ownerId): int
    {
        $building = (string) $this->option('building');
        $level = $this->option('level');
        if ($building === '' || $level === null || (int) $level < 0) {
            return $this->usageError('level 动词需 --building=KEY --level=N（N≥0）');
        }
        $level = (int) $level;

        return DB::transaction(function () use ($planet, $ownerId, $building, $level) {
            $ruleset = GameRuleset::query()->where('status', GameRuleset::STATUS_FROZEN)->orderByDesc('id')->first();
            if ($ruleset === null) {
                $this->error('无 frozen 规则集（命令行归因需要）');

                return self::FAILURE;
            }

            $levels = $planet->levels_json ?? [];
            $before = (int) ($levels[$building] ?? 0);
            $levels[$building] = $level;
            $planet->levels_json = $levels;
            $planet->version++;
            $planet->save();

            $commandId = \Illuminate\Support\Str::uuid()->toString();
            $payload = ['planet_id' => (int) $planet->id, 'building' => $building, 'from' => $before, 'to' => $level];
            DB::table('game_commands')->insert([
                'command_id' => $commandId,
                'payload_hash' => CanonicalJson::hash($payload),
                'actor_kind' => 'player', 'actor_id' => $ownerId, 'owner_id' => $ownerId,
                'type' => 'GM_LEVEL',
                'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'ruleset_id' => $ruleset->id,
                'status' => 'committed', 'attempt_count' => 1,
                'submitted_at' => now(), 'committed_at' => now(),
                'result_json' => json_encode(['from' => $before, 'to' => $level], JSON_UNESCAPED_UNICODE),
            ]);

            $this->info("planets#{$planet->id} {$building}：Lv.{$before} → Lv.{$level}（命令行 {$commandId}）");

            return self::SUCCESS;
        });
    }

    private function usageError(string $msg): int
    {
        $this->error($msg);
        $this->line('用法：game:gm resources OWNER [--M= --C= --D=] [--planet=] | game:gm level OWNER --planet=ID --building=KEY --level=N');

        return self::FAILURE;
    }
}
