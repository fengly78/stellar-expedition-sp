<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\GameCommandBus;
use App\Domain\Fleet\FleetArrivalService;
use App\Domain\Production\ProductionService;
use App\Domain\Ruleset\Ruleset;
use App\Models\Civilization;
use App\Models\Planet;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestRuleset;
use Tests\TestCase;

/**
 * 经典 0.84 同构机制升级验证（SOURCE-02；全部配置驱动缺键即关）：
 * 1. 引擎科技速度加成（燃烧 +10%/级）影响航时；
 * 2. 小运脉冲换挡（≥5 级：速度基倍 ×2、油耗 ×2、加成换脉冲 0.2）；
 * 3. 重氢温度系数 + 自然基础产量；
 * 4. 经典比例掠夺分配（货舱 1/3 M、1/2 C、余 D，总舱即上限）。
 */
class ClassicMechanismsTest extends TestCase
{
    use RefreshDatabase;

    private function dllReady(): bool
    {
        return is_file((string) config('services.combat.library_path'));
    }

    private function planet(int $owner, string $coords, array $ships = [], float $invM = 0, float $invC = 0, float $invD = 0, ?int $temp = null): int
    {
        [$g, $s, $o] = array_map('intval', explode(':', $coords));
        $p = new Planet();
        $p->owner_id = $owner;
        $p->galaxy = $g;
        $p->system_pos = $s;
        $p->orbit = $o;
        $p->temp = $temp;
        $p->is_homeworld = true;
        $p->inv_m = $invM;
        $p->inv_c = $invC;
        $p->inv_d = $invD;
        $p->levels_json = [];
        $p->ships_json = $ships;
        $p->queue_building = [];
        $p->production_checkpoint_at = now();
        $p->version = 0;
        $p->save();
        return (int) $p->id;
    }

    private function civ(int $owner, array $techs = []): void
    {
        $c = new Civilization();
        $c->owner_id = $owner;
        $c->techs_json = $techs;
        $c->mission_slots_used = 0;
        $c->version = 0;
        $c->save();
    }

    private function dispatch(int $rulesetId, string $uuid, int $originId, array $ships, string $mission = 'scout'): array
    {
        $cmd = new CommandEnvelope(
            commandId: $uuid,
            actorKind: 'player',
            actorId: 1,
            ownerId: 1,
            type: 'FLEET_DISPATCH',
            payload: ['planet_id' => $originId, 'mission' => $mission,
                'ships' => $ships, 'target' => '1:1:2', 'speed_pct' => 100],
        );
        return $this->app->make(GameCommandBus::class)->dispatch($cmd, $rulesetId);
    }

    public function testEngineTechBonusShortensFlight(): void
    {
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 2], invD: 100000);
        $this->planet(2, '1:1:2');
        $this->civ(1, ['COMBUSTION' => 2]);
        $this->civ(2);
        $rulesetId = TestRuleset::create(patches: [
            'SHIP.LIGHT.engine' => ['drive' => 'COMBUSTION', 'bonus' => 0.1],
        ]);

        // 燃烧 Lv2：12500×1.2 = 15000 → ceil(350×√(10050/15000)+10) = 297
        $res = $this->dispatch($rulesetId, '66666666-6666-4666-8666-000000000001', $originId, ['LIGHT' => 1]);
        $this->assertSame(297, (int) $res['duration_seconds'], '引擎科技加成必须缩短航时');

        // 无科技（重建 civ）→ 原速 ceil(350×√(10050/12500)+10) = 324
        Civilization::query()->where('owner_id', 1)->update(['techs_json' => '{}']);
        $res2 = $this->dispatch($rulesetId, '66666666-6666-4666-8666-000000000002', $originId, ['LIGHT' => 1]);
        $this->assertSame(324, (int) $res2['duration_seconds']);
    }

    public function testSmallCargoImpulseSwitchDoublesBaseAndFuel(): void
    {
        $originId = $this->planet(1, '1:1:1', ['SMALL_CARGO' => 1], invD: 100000);
        $this->planet(2, '1:1:2');
        $this->civ(1, ['IMPULSE' => 5]);
        $rulesetId = TestRuleset::create(patches: [
            'SHIP.SMALL_CARGO' => ['M' => 2000, 'C' => 2000, 'D' => 0, 'cargo' => 5000,
                'A' => 5, 'S' => 10, 'H' => 400, 'speed' => 5000, 'fuel' => 10,
                'engine' => ['drive' => 'COMBUSTION', 'bonus' => 0.1,
                    'switch' => ['tech' => 'IMPULSE', 'level' => 5, 'base_mul' => 2, 'fuel_mul' => 2, 'bonus' => 0.2]],
            ],
        ]);

        // 换挡：5000×2×(1+0.2×5)=20000 → duration ceil(350×√(10050/20000)+10)=259
        $res = $this->dispatch($rulesetId, '77777777-7777-4777-8777-000000000001', $originId, ['SMALL_CARGO' => 1], 'raid');
        $this->assertSame(259, (int) $res['duration_seconds']);
        // 油耗 ×2 后：sv=350×√(10050/20000)=248.105；ceil(20×1005/35000×(25.8105)²)=383
        $this->assertSame(383, (int) $res['fuel']);
    }

    public function testTemperatureFactorAndBaseProduction(): void
    {
        $patches = [
            'RESOURCE.D.TEMPERATURE' => ['base' => 1.28, 'per_degree' => -0.002, 'offset' => 40],
            'RESOURCE.BASE_PRODUCTION' => ['M' => 20, 'C' => 10],
        ];
        $content = TestRuleset::content(patches: $patches);
        $rs = new Ruleset(0, 't', 't', $content);
        $svc = new ProductionService();

        $mk = fn (?int $temp) => tap(new Planet(), function ($p) use ($temp) {
            $p->inv_m = 0.0;
            $p->inv_c = 0.0;
            $p->inv_d = 0.0;
            // 太阳能 25/h > 重氢需求 15/h → 能源满足率 1.0（隔离温度变量）
            $p->levels_json = ['DEUT_SYNTH' => 1, 'SOLAR' => 1];
            $p->production_checkpoint_at = Carbon::createFromTimestamp(0, 'UTC');
            $p->temp = $temp;
        });

        // 定温 25℃：D 率 = 10×1×(1.28−0.002×65) = 11.5/h；M 基础 20/h
        $warm = $mk(25);
        $svc->settle($warm, $rs, Carbon::createFromTimestamp(3600, 'UTC'));
        $this->assertEqualsWithDelta(20.0, $warm->inv_m, 1e-6, '自然基础产量必须入账');
        $this->assertEqualsWithDelta(11.5, $warm->inv_d, 1e-6, '重氢温度系数必须生效');

        // 未定温 → 温度系数 1.0，D 率 10/h
        $cold = $mk(null);
        $svc->settle($cold, $rs, Carbon::createFromTimestamp(3600, 'UTC'));
        $this->assertEqualsWithDelta(10.0, $cold->inv_d, 1e-6);

        // 无温度/基础产量键 → 与既有行为一致（M 无基础产量；D 按原式 10/h，无系数）
        $plain = $mk(25);
        $svc->settle($plain, new Ruleset(0, 't', 't', TestRuleset::content()), Carbon::createFromTimestamp(3600, 'UTC'));
        $this->assertEqualsWithDelta(0.0, $plain->inv_m, 1e-6);
        $this->assertEqualsWithDelta(10.0, $plain->inv_d, 1e-6);
    }

    public function testFusionProducesEnergyAndBurnsDeuterium(): void
    {
        // CR-002 B 批准落地：聚变 L1 供能 30/h、烧氘 10/h（恒 3:1）；
        // 无太阳能时聚变单独拉起能源满足率；氘尽停转。
        $patches = [
            'ENERGY.FUSION' => ['base' => 30, 'factor' => 1.12],
            'ENERGY.FUSION_DEMAND' => ['base' => 10, 'factor' => 1.12],
        ];
        $rs = new Ruleset(0, 't', 't', TestRuleset::content(patches: $patches));
        $svc = new ProductionService();

        $p = new Planet();
        $p->inv_m = 0.0;
        $p->inv_c = 0.0;
        $p->inv_d = 100.0;
        $p->levels_json = ['METAL_MINE' => 1, 'FUSION' => 1];   // 矿需 10 < 聚变 30
        $p->production_checkpoint_at = Carbon::createFromTimestamp(0, 'UTC');

        $this->assertSame(1.0, $svc->energyFactor($p, $rs), '聚变供能必须计入满足率');
        $svc->settle($p, $rs, Carbon::createFromTimestamp(3600, 'UTC'));
        $this->assertEqualsWithDelta(90.0, (float) $p->inv_d, 1e-6, '聚变 1h 烧氘 10');
        $this->assertEqualsWithDelta(30.0, (float) $p->inv_m, 1e-6, '满产金属矿 30/h');

        // 氘尽停转：D=0 → 聚变不供能，满足率回落到 0
        $p->inv_d = 0.0;
        $this->assertLessThan(0.5, $svc->energyFactor($p, $rs), '氘尽聚变停转');

        // 键缺失（合成基础规则集）→ 聚变不参与（旧行为）
        $plainRs = new Ruleset(0, 't', 't', TestRuleset::content());
        $this->assertSame(0.0, $svc->fusionOutput($p, $plainRs));
    }

    public function testFusionKeepsPowerForSegmentThatConsumesLastFuel(): void
    {
        $rs = new Ruleset(0, 't', 't', TestRuleset::content(patches: [
            'ENERGY.FUSION' => ['base' => 30, 'factor' => 1.12],
            'ENERGY.FUSION_DEMAND' => ['base' => 10, 'factor' => 1.12],
        ]));
        $svc = new ProductionService();
        $p = new Planet();
        $p->inv_m = 0.0; $p->inv_c = 0.0; $p->inv_d = 5.0;
        $p->levels_json = ['METAL_MINE' => 1, 'FUSION' => 1];
        $p->production_checkpoint_at = Carbon::createFromTimestamp(0, 'UTC');

        $svc->settle($p, $rs, Carbon::createFromTimestamp(3600, 'UTC'));
        $this->assertEqualsWithDelta(30.0, (float) $p->inv_m, 1e-6);
        $this->assertEqualsWithDelta(0.0, (float) $p->inv_d, 1e-6);

        $svc->settle($p, $rs, Carbon::createFromTimestamp(7200, 'UTC'));
        $this->assertEqualsWithDelta(30.0, (float) $p->inv_m, 1e-6);
    }

    public function testClassicLootSplit(): void
    {
        if (! is_file((string) config('services.combat.library_path'))) {
            $this->markTestSkipped('Rust cdylib 未构建（cargo build --release）');
        }
        $originId = $this->planet(1, '1:1:1', ['LIGHT' => 100], invD: 100000);
        // 空防 + 库存 30000×3：可用战利品各 15000，舱位 100×50=5000
        $this->planet(2, '1:1:2', [], 30000, 30000, 30000);
        $this->civ(1);
        $this->civ(2);
        $rulesetId = TestRuleset::create(patches: ['COMBAT.LOOT_SPLIT' => 'classic_thirds']);

        $res = $this->dispatch($rulesetId, '88888888-8888-4888-8888-000000000001', $originId, ['LIGHT' => 100], 'raid');
        $this->app->make(FleetArrivalService::class)->arrive($res['task_id']);

        $snap = DB::table('battle_snapshots')->where('battle_id', 'battle-'.$res['task_id'])->first();
        $result = (array) json_decode((string) $snap->result_json, true);
        // 经典三分：M=舱/3、C=舱/2、D=余量；三类皆充足 → 恰好装满 5000。
        // 容差按存储契约：DECIMAL(20,4)（MariaDB 量化 4 位小数；SQLite 存全精度）——P0-4 实证差异。
        $this->assertEqualsWithDelta(5000 / 3, $result['loot']['M'], 1e-6);
        $this->assertEqualsWithDelta(5000 / 2, $result['loot']['C'], 1e-6);
        $this->assertEqualsWithDelta(5000 / 6, $result['loot']['D'], 1e-6);
        $this->assertEqualsWithDelta(5000.0, array_sum($result['loot']), 1e-6);

        $defender = Planet::query()->where('galaxy', 1)->where('system_pos', 1)->where('orbit', 2)->first();
        // inv_* 列经 DECIMAL(20,4) 往返 → 容差 1e-4（存储契约）
        $this->assertEqualsWithDelta(30000 - 5000 / 3, (float) $defender->inv_m, 1e-4);
        $this->assertEqualsWithDelta(30000 - 5000 / 6, (float) $defender->inv_d, 1e-4);
    }
}
