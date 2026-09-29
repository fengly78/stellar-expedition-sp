<?php

declare(strict_types=1);

namespace App\Domain\Production;

use App\Domain\Ruleset\Ruleset;
use App\Domain\Ruleset\RulesetRefusedException;
use App\Models\Planet;
use Carbon\Carbon;

/**
 * ProductionService：分段生产结算（V1.3 §06.1 / GDD-02），逐式对应 rules/formulas.py 与 sim/engine.py：
 *
 * - F-02 基础产量 P(L) = p·L·a^(L−1)，P(0)=0
 * - F-03 能源满足率 e = min(1, supply/need)，need=0 时 e=1
 * - 太阳能产出 solar = base·L·factor^(L−1)；矿能耗同理（ENERGY.*_DEMAND）
 * - F-04 仓容 cap(L) = S0 + S1·(g^L −1)/(g−1)，cap(0)=S0；满仓停产，超额不入账
 * - 结算纪律：任何状态变更（建筑完成、扣费）前先 settle 到该时刻，再应用变更（§06.1）
 *
 * 范围声明：E1-S1 只含太阳能+三矿；聚变待 CR-002 提案 B 批准后接入（experimental 分支口径），
 * 氘净消耗（聚变停转语义）届时一并实现，此处不留死代码。
 */
class ProductionService
{
    private const MINES = [
        'M' => ['level' => 'METAL_MINE', 'prod' => 'RESOURCE.M.PRODUCTION', 'demand' => 'ENERGY.M_DEMAND'],
        'C' => ['level' => 'CRYSTAL_MINE', 'prod' => 'RESOURCE.C.PRODUCTION', 'demand' => 'ENERGY.C_DEMAND'],
        'D' => ['level' => 'DEUT_SYNTH', 'prod' => 'RESOURCE.D.PRODUCTION', 'demand' => 'ENERGY.D_DEMAND'],
    ];

    private const STORAGE_FOR = ['M' => 'M_STORAGE', 'C' => 'C_STORAGE', 'D' => 'D_STORAGE'];

    /** 太阳能产出（能源/小时）。 */
    public function solarOutput(Planet $p, Ruleset $rs): float
    {
        $lv = $p->level('SOLAR');
        if ($lv === 0) {
            return 0.0;
        }
        $solar = $rs->get('ENERGY.SOLAR');
        return $solar['base'] * $lv * $solar['factor'] ** ($lv - 1);
    }

    /** 三矿能源需求合计（能源/小时）。 */
    public function mineEnergyNeed(Planet $p, Ruleset $rs): float
    {
        $need = 0.0;
        foreach (self::MINES as $cfg) {
            $lv = $p->level($cfg['level']);
            if ($lv > 0) {
                $d = $rs->get($cfg['demand']);
                $need += $d['base'] * $lv * $d['factor'] ** ($lv - 1);
            }
        }
        return $need;
    }

    /** 聚变产能（能源/小时，CR-002 B：30L×1.12^(L-1)）：键缺失或未建 → 0。 */
    public function fusionOutput(Planet $p, Ruleset $rs): float
    {
        $lv = $p->level('FUSION');
        if ($lv === 0) {
            return 0.0;
        }
        try {
            $cfg = $rs->get('ENERGY.FUSION');
        } catch (RulesetRefusedException) {
            return 0.0;
        }
        return (float) $cfg['base'] * $lv * (float) $cfg['factor'] ** ($lv - 1);
    }

    /** 聚变氘耗（重氢/小时，CR-002 B：10L×1.12^(L-1)，恒 3:1）。 */
    private function fusionDeuteriumPerHour(Planet $p, Ruleset $rs): float
    {
        $lv = $p->level('FUSION');
        if ($lv === 0) {
            return 0.0;
        }
        try {
            $cfg = $rs->get('ENERGY.FUSION_DEMAND');
        } catch (RulesetRefusedException) {
            return 0.0;
        }
        return (float) $cfg['base'] * $lv * (float) $cfg['factor'] ** ($lv - 1);
    }

    /** 聚变运转判定：已建 + 键存在 + 可用氘 > 0（氘尽停转，sim02 口径）。 */
    private function fusionProducing(Planet $p, Ruleset $rs): bool
    {
        return $p->level('FUSION') > 0
            && $this->fusionDeuteriumPerHour($p, $rs) > 0.0
            && $p->spendable('D') > 0.0;
    }

    /** F-03 能源满足率。 */
    public function energyFactor(Planet $p, Ruleset $rs): float
    {
        $need = $this->mineEnergyNeed($p, $rs);
        if ($need <= 0.0) {
            return 1.0;
        }
        $supply = $this->solarOutput($p, $rs);
        if ($this->fusionProducing($p, $rs)) {
            $supply += $this->fusionOutput($p, $rs);
        }
        return min(1.0, $supply / $need);
    }

    /**
     * F-02+F-03：单资源实际产率（资源/秒）。
     * 经典 0.84 同构扩展（SOURCE-02，配置驱动缺键即关）：
     * - RESOURCE.D.TEMPERATURE {base, per_degree, offset}：重氢温度系数，factor = base + per_degree×(temp+offset)，
     *   仅当键存在且行星已定温（temp 非空）时生效——经典式 1.28−0.002×(temp+40)。
     * - RESOURCE.BASE_PRODUCTION {M, C}：自然基础产量（经典 +20M/+10C 每小时），键存在才生效。
     */
    public function ratePerSecond(Planet $p, Ruleset $rs, string $res, ?float $segmentEnergyFactor = null): float
    {
        $cfg = self::MINES[$res];
        $lv = $p->level($cfg['level']);
        if ($lv === 0) {
            return 0.0;
        }
        $prod = $rs->get($cfg['prod']);
        $perHour = $prod['p'] * $lv * $prod['a'] ** ($lv - 1);
        if ($res === 'D') {
            $perHour *= $this->temperatureFactor($p, $rs);
        }
        return $perHour * ($segmentEnergyFactor ?? $this->energyFactor($p, $rs)) / 3600.0;
    }

    /** 自然基础产量（资源/秒）：仅 RESOURCE.BASE_PRODUCTION 键存在时生效（经典 +20M/+10C 每小时口径）。 */
    public function baseRatePerSecond(Ruleset $rs, string $res): float
    {
        try {
            $base = $rs->get('RESOURCE.BASE_PRODUCTION');
        } catch (RulesetRefusedException) {
            return 0.0;   // 键缺失（如真实 RC1）→ 无自然产量，行为与既有版本一致
        }
        return (float) ($base[$res] ?? 0.0) / 3600.0;
    }

    /** 重氢温度系数：经典 1.28−0.002×(temp+40) 同构；键缺失或行星未定温 → 1.0。 */
    private function temperatureFactor(Planet $p, Ruleset $rs): float
    {
        try {
            $cfg = $rs->get('RESOURCE.D.TEMPERATURE');
        } catch (RulesetRefusedException) {
            return 1.0;
        }
        if ($p->temp === null) {
            return 1.0;
        }
        return (float) $cfg['base'] + (float) $cfg['per_degree'] * ((int) $p->temp + (int) $cfg['offset']);
    }

    /** F-04 仓容。 */
    public function capacity(Planet $p, Ruleset $rs, string $res): float
    {
        $curve = $rs->get('STORAGE.CURVE');
        $lv = $p->level(self::STORAGE_FOR[$res]);
        if ($lv === 0) {
            return (float) $curve['S0'];
        }
        return $curve['S0'] + $curve['S1'] * ($curve['g'] ** $lv - 1) / ($curve['g'] - 1);
    }

    /**
     * 分段结算到 $to：按当前等级速率积分 dt，受仓容截断；更新检查点。
     * 调用方纪律：任何改变产能的事件（建筑完成）必须先 settle 再升级（§06.1）。
     * 守恒口径：产出入账即 inv 增加；仓损不计入 inv（对账由 Ledger/快照负责，见 dev-plan-e1 S1 验收）。
     */
    public function settle(Planet $p, Ruleset $rs, Carbon $to): void
    {
        $from = $p->production_checkpoint_at ?? $to;
        // Carbon 3 diffInSeconds 有符号（b−a）：接收者是 a、参数是 b → 结果 b−a。
        // 必须以 from 为接收者（2026-09-23 首运行发现：to 在前时差值恒负、被 max 夹成 0 → 零产出）。
        $dt = max(0.0, $from->floatDiffInSeconds($to));
        if ($dt > 0.0) {
            // 本段供能取段首状态；燃料在本段烧尽只影响下一段。
            $segmentEnergyFactor = $this->energyFactor($p, $rs);
            // 聚变氘耗（CR-002 B）：运转中先烧氘（段级近似：段首可用氘决定本段运转，sim02 口径），
            // 烧尽的氘计入 inv 减少且不触发仓容截断（消耗不是产出）。
            if ($this->fusionProducing($p, $rs)) {
                $burn = $this->fusionDeuteriumPerHour($p, $rs) / 3600.0 * $dt;
                $p->inv_d = max(0.0, (float) $p->inv_d - min($burn, $p->spendable('D')));
            }
            foreach (['M', 'C', 'D'] as $res) {
                // 基础自然产量与矿场产量一并积分（经典：+20M/+10C 恒流，键缺失时为 0）
                $gain = ($this->ratePerSecond($p, $rs, $res, $segmentEnergyFactor) + $this->baseRatePerSecond($rs, $res)) * $dt;
                if ($gain <= 0.0) {
                    continue;
                }
                $col = 'inv_' . strtolower($res);
                $room = max(0.0, $this->capacity($p, $rs, $res) - $p->$col);
                $p->$col += min($gain, $room);
            }
        }
        $p->production_checkpoint_at = $to;
    }
}
