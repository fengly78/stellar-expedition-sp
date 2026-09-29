<?php

declare(strict_types=1);

namespace App\Domain\Account;

use App\Domain\Ledger\LedgerWriter;
use App\Models\Civilization;
use App\Models\GameRuleset;
use App\Models\Planet;
use Illuminate\Support\Facades\DB;

/**
 * PlayerProvisioner：玩家开档与令牌签发（自助注册 G1 与 CLI 引导共用内核）。
 *
 * 开档事务：文明 + 母星（经典自动选址：前 9 星系环带 4-12、步长 1.3；coltab 定温）
 * + 初始库存台账（operation=init，归因 BOOTSTRAP 系统命令行，锁当前 frozen 规则集）。
 * 令牌：api_tokens 每 owner 单有效令牌，sha256 落库，明文只在返回值出现一次。
 */
class PlayerProvisioner
{
    public function __construct(
        private readonly LedgerWriter $ledger,
    ) {
    }

    /** 当前 frozen 规则集（任意名，取最新——与原 CLI 行为一致；无则 null，调用方 fail-closed）。 */
    public function frozenRuleset(): ?GameRuleset
    {
        return GameRuleset::query()
            ->where('status', GameRuleset::STATUS_FROZEN)
            ->orderByDesc('id')->first();
    }

    /**
     * 开档。$coords 显式坐标（三项齐全时）；null 走经典自动选址。
     * 起始资源为开发工具默认口径（RC1 无 START_RESOURCES 键——正式值属未来 CR）。
     *
     * @param array{galaxy:int,system_pos:int,orbit:int}|null $coords
     * @return array{owner_id:int,planet_id:int,coords:string,temp:?int,ruleset:string}
     * @throws ProvisionException 已有文明 / 坐标占用 / 无空位 / 无 frozen 规则集
     */
    public function provision(int $ownerId, float $m, float $c, float $d, ?array $coords = null): array
    {
        $ruleset = $this->frozenRuleset();
        if ($ruleset === null) {
            throw ProvisionException::config('服务器无 frozen 规则集——先完成规则集导入（GDD-10 纪律）');
        }

        return DB::transaction(function () use ($ownerId, $m, $c, $d, $coords, $ruleset) {
            if (Civilization::query()->where('owner_id', $ownerId)->lockForUpdate()->exists()) {
                throw new ProvisionException("owner {$ownerId} 已有文明，拒绝重建");
            }
            $coords ??= $this->autoPosition();
            if ($coords === null) {
                throw new ProvisionException('自动选址失败：前 9 星系环带 4-12 已无空位');
            }
            if (Planet::query()->where('galaxy', $coords['galaxy'])
                ->where('system_pos', $coords['system_pos'])->where('orbit', $coords['orbit'])
                ->lockForUpdate()->exists()) {
                throw new ProvisionException("坐标 {$coords['galaxy']}:{$coords['system_pos']}:{$coords['orbit']} 已被占用");
            }

            $civ = new Civilization();
            $civ->owner_id = $ownerId;
            $civ->techs_json = [];
            $civ->mission_slots_used = 0;
            $civ->version = 0;
            $civ->save();

            $planet = new Planet();
            $planet->owner_id = $ownerId;
            $planet->galaxy = $coords['galaxy'];
            $planet->system_pos = $coords['system_pos'];
            $planet->orbit = $coords['orbit'];
            $planet->temp = $this->bandTemperature((int) $coords['orbit']);
            $planet->is_homeworld = true;
            $planet->inv_m = $m;
            $planet->inv_c = $c;
            $planet->inv_d = $d;
            $planet->levels_json = [];
            $planet->ships_json = [];
            $planet->defense_json = [];
            $planet->queue_building = [];
            $planet->production_checkpoint_at = now();
            $planet->version = 0;
            $planet->save();

            // 引导归因：BOOTSTRAP 系统命令行（不经总线、客户端不可提交）+ init 台账
            $commandId = \Illuminate\Support\Str::uuid()->toString();
            $payload = [
                'owner_id' => $ownerId, 'planet_id' => (int) $planet->id,
                'coords' => "{$planet->galaxy}:{$planet->system_pos}:{$planet->orbit}",
                'start' => ['M' => $m, 'C' => $c, 'D' => $d],
            ];
            DB::table('game_commands')->insert([
                'command_id' => $commandId,
                'payload_hash' => \App\Domain\CanonicalJson::hash($payload),
                'actor_kind' => 'player', 'actor_id' => $ownerId, 'owner_id' => $ownerId,
                'type' => 'BOOTSTRAP',
                'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'ruleset_id' => $ruleset->id,
                'status' => 'committed', 'attempt_count' => 1,
                'submitted_at' => now(), 'committed_at' => now(),
                'result_json' => json_encode(['planet_id' => (int) $planet->id], JSON_UNESCAPED_UNICODE),
            ]);
            $this->ledger->record($commandId, $ownerId, (int) $planet->id, null,
                ['M' => $m, 'C' => $c, 'D' => $d], 'init', 'homeworld', (string) $planet->id);

            return [
                'owner_id' => $ownerId,
                'planet_id' => (int) $planet->id,
                'coords' => "{$planet->galaxy}:{$planet->system_pos}:{$planet->orbit}",
                'temp' => $planet->temp === null ? null : (int) $planet->temp,
                'ruleset' => "{$ruleset->ruleset_name}@{$ruleset->version}",
            ];
        });
    }

    /** 签发/轮换令牌，返回明文（只此一次）。 */
    public function issueToken(int $ownerId): string
    {
        $plain = bin2hex(random_bytes(32));
        $hash = hash('sha256', $plain);
        $exists = DB::table('api_tokens')->where('owner_id', $ownerId)->exists();
        if ($exists) {
            DB::table('api_tokens')->where('owner_id', $ownerId)
                ->update(['token_hash' => $hash, 'last_used_at' => null, 'created_at' => now()]);
        } else {
            DB::table('api_tokens')->insert([
                'owner_id' => $ownerId, 'token_hash' => $hash, 'created_at' => now(),
            ]);
        }
        return $plain;
    }

    /** 下一个空闲 owner_id（ civilizations.owner_id 唯一约束兜底并发）。 */
    public function nextOwnerId(): int
    {
        $max = (int) DB::table('civilizations')->max('owner_id');
        return max($max, 0) + 1;
    }

    /**
     * 经典主星自动选址（SOURCE-02；upstream-ogamespec planet.php:761-799 同构）：
     * 前 9 星系、行星位环带 4-12、扁平索引步长 1.3 伪随机跳跃。
     *
     * @return array{galaxy:int,system_pos:int,orbit:int}|null
     */
    private function autoPosition(): ?array
    {
        $positionsPerSystem = 15;
        $systemsPerGalaxy = 499;
        $ppg = $positionsPerSystem * $systemsPerGalaxy;

        for ($d = 0.0; floor($d) < $ppg * 9; $d += 1.3) {
            $i = (int) floor($d);
            $galaxy = intdiv($i, $ppg) + 1;
            $rem = $i % $ppg;
            $system = intdiv($rem, $positionsPerSystem) + 1;
            $orbit = ($rem % $positionsPerSystem) + 1;
            if ($orbit <= 3 || $orbit >= 13) {
                continue;
            }
            $taken = Planet::query()->where('galaxy', $galaxy)
                ->where('system_pos', $system)->where('orbit', $orbit)->exists();
            if (! $taken) {
                return ['galaxy' => $galaxy, 'system_pos' => $system, 'orbit' => $orbit];
            }
        }
        return null;
    }

    /** 行星位 → 最低温度（经典 coltab 分档，planet.php:122-127）。 */
    private function bandTemperature(int $orbit): int
    {
        $roll = random_int(0, 9);
        return match (true) {
            $orbit <= 3 => 80 + $roll - 2 * $orbit,
            $orbit <= 6 => 30 + $roll - 2 * $orbit,
            $orbit <= 9 => 10 + $roll - 2 * $orbit,
            $orbit <= 12 => -10 + $roll - 2 * $orbit,
            default => -60 + $roll - 2 * $orbit,
        };
    }
}
