#!/usr/bin/env python3
"""tests/test_formulas.py — TEST-01 L1 公式层验收（对应 V1.3 §08.3 测试层级 L1）

断言锚点全部取自基线文档原文（§05.2 公式、§05.3~05.5 参数表、§05.9 静态核算），
不凭直觉编造期望值。运行：python -m unittest tests.test_formulas -v
"""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import (  # noqa: E402
    ConfigTBDError, Ruleset, upgrade_cost, upgrade_cost_cumulative,
    base_production, energy_satisfaction, actual_production,
    storage_capacity, value_v, colony_cap, fleet_slots, military_gain,
)

RS = Ruleset()


class TestF01UpgradeCost(unittest.TestCase):
    """F-01：ceil(C1 * g^(L-1))，每资源分别取整。"""

    def test_level1_equals_base(self):
        metal = RS.get("BUILD.METAL_MINE")
        self.assertEqual(upgrade_cost(metal, 1), {"M": 60, "C": 15, "D": 0})

    def test_geometric_growth_and_ceil(self):
        # 金属矿 g=1.5：L2 = ceil(60*1.5)=90, ceil(15*1.5)=ceil(22.5)=23（分别取整）
        metal = RS.get("BUILD.METAL_MINE")
        self.assertEqual(upgrade_cost(metal, 2), {"M": 90, "C": 23, "D": 0})

    def test_invalid_level(self):
        with self.assertRaises(ValueError):
            upgrade_cost(RS.get("BUILD.METAL_MINE"), 0)

    def test_military_g_backfilled(self):
        # CR-002 C 批准（2026-09-23）：军事科技 g=2.00——L2 = ceil(800*2)/ceil(200*2)
        weapons = RS.get("TECH.WEAPONS")
        self.assertEqual(weapons["g"], 2.0)
        self.assertEqual(upgrade_cost(weapons, 2), {"M": 1600, "C": 400, "D": 0})


class TestF02BaseProduction(unittest.TestCase):
    """F-02：P(0)=0；P(L)=p*L*a^(L-1)。"""

    def test_zero_level_zero_output(self):
        self.assertEqual(base_production(RS.get("RESOURCE.M.PRODUCTION"), 0), 0.0)

    def test_level1_equals_p(self):
        self.assertEqual(base_production(RS.get("RESOURCE.M.PRODUCTION"), 1), 30.0)
        self.assertEqual(base_production(RS.get("RESOURCE.C.PRODUCTION"), 1), 20.0)
        self.assertEqual(base_production(RS.get("RESOURCE.D.PRODUCTION"), 1), 10.0)

    def test_growth_shape(self):
        # 金属 p=30,a=1.12：P(2)=30*2*1.12=67.2
        self.assertAlmostEqual(base_production(RS.get("RESOURCE.M.PRODUCTION"), 2), 67.2)


class TestF03Energy(unittest.TestCase):
    """F-03：e=min(1, supply/need)；need=0 时 e=1；无 0.2 下限（区别于旧原型）。"""

    def test_need_zero_gives_full(self):
        self.assertEqual(energy_satisfaction(0, 0), 1.0)

    def test_capped_at_one(self):
        self.assertEqual(energy_satisfaction(200, 100), 1.0)

    def test_proportional_deficit_no_floor(self):
        self.assertAlmostEqual(energy_satisfaction(10, 100), 0.1)

    def test_actual_production(self):
        # 金属 L1=30，能源满足 50%，环境 Normal(1.0) → 15
        self.assertAlmostEqual(
            actual_production(RS.get("RESOURCE.M.PRODUCTION"), 1, 50, 100, 1.0), 15.0)


class TestF04Storage(unittest.TestCase):
    """F-04 锚点（§05.2 原文）：L0/L1/L2 = 10000/20000/36000。"""

    def test_document_anchors(self):
        curve = RS.get("STORAGE.CURVE")
        self.assertEqual(storage_capacity(curve, 0), 10000.0)
        self.assertEqual(storage_capacity(curve, 1), 20000.0)
        self.assertEqual(storage_capacity(curve, 2), 36000.0)


class TestF05Value(unittest.TestCase):
    def test_ratio_1_2_3(self):
        self.assertEqual(value_v(1, 1, 1), 6.0)
        self.assertEqual(value_v(0, 0, 1), 3.0)


class TestF06Caps(unittest.TestCase):
    """§05.5：A=1/3/5/7/9 对应总行星 2/3/4/5/6；F-06：A=0 时为 1（含主星）。"""

    def test_colony_cap_table(self):
        expected = {0: 1, 1: 2, 3: 3, 5: 4, 7: 5, 9: 6}
        for a, want in expected.items():
            self.assertEqual(colony_cap(a), want, f"A={a}")

    def test_fleet_slots(self):
        self.assertEqual(fleet_slots(0), 2)
        self.assertEqual(fleet_slots(3), 5)


class TestF07MilitaryGain(unittest.TestCase):
    def test_linear_center_k(self):
        k = RS.get("COMBAT.TECH_GAIN")  # 0.05
        self.assertEqual(k, 0.05)
        # 轻战攻击 50，武器 10 级：50*(1+0.05*10)=75（线性，非复利）
        self.assertAlmostEqual(military_gain(50, 10, k), 75.0)

    def test_not_compound(self):
        k = RS.get("COMBAT.TECH_GAIN")
        self.assertNotAlmostEqual(military_gain(50, 10, k), 50 * 1.05 ** 10)


class TestCRBackfilledBuildings(unittest.TestCase):
    """CR-002 A/B 批准（2026-09-23）后：聚变与三仓库不再是 TBD——按批准值断言。"""

    def test_fusion_costs(self):
        fusion = RS.get("BUILD.FUSION")
        self.assertEqual(upgrade_cost(fusion, 1), {"M": 150, "C": 60, "D": 30})
        self.assertEqual(fusion["g"], 1.5)

    def test_storage_costs(self):
        self.assertEqual(upgrade_cost(RS.get("BUILD.M_STORAGE"), 1), {"M": 1000, "C": 0, "D": 0})
        self.assertEqual(upgrade_cost(RS.get("BUILD.C_STORAGE"), 1), {"M": 1000, "C": 500, "D": 0})
        self.assertEqual(upgrade_cost(RS.get("BUILD.D_STORAGE"), 1), {"M": 1000, "C": 1000, "D": 0})
        for k in ("BUILD.M_STORAGE", "BUILD.C_STORAGE", "BUILD.D_STORAGE"):
            self.assertEqual(RS.get(k)["g"], 1.6)

    def test_zero_tbd_in_ruleset(self):
        # 冻结纪律：RC1（2026-09-23 批准版）零 TBD——五舰字段全数在位
        for key in ("SHIP.SCOUT", "SHIP.SMALL_CARGO", "SHIP.LIGHT", "SHIP.HEAVY", "SHIP.COLONY"):
            v = RS.get(key)
            for field in ("speed", "fuel", "build_time"):
                self.assertIsNotNone(v[field], f"{key}.{field} 不应为 TBD")
        self.assertEqual(RS.get("SHIP.COLONY")["H"], 3000)  # CR-003 A：floor(SI/10)=3000

    def test_unknown_key_raises(self):
        with self.assertRaises(KeyError):
            RS.get("BUILD.DOES_NOT_EXIST")


class TestStaticAccounting(unittest.TestCase):
    """§05.9 静态核算锚点：方案B 下 实验室1-3、造船厂1-4、能源1、脉冲1、
    间谍1-2、天体物理1 及一艘殖民舰合计 23000M/37100C/13200D = 136800V。
    该测试把文档锚点变成可回归的 L1 断言。"""

    def test_first_colony_static_sum(self):
        total = {"M": 0, "C": 0, "D": 0}

        def add(cost):
            for r in total:
                total[r] += cost[r]

        add(upgrade_cost_cumulative(RS.get("BUILD.LAB"), 0, 3))
        add(upgrade_cost_cumulative(RS.get("BUILD.SHIPYARD"), 0, 4))
        add(upgrade_cost(RS.get("TECH.ENERGY"), 1))
        add(upgrade_cost(RS.get("TECH.IMPULSE"), 1))
        add(upgrade_cost_cumulative(RS.get("TECH.ESPIONAGE"), 0, 2))
        add(upgrade_cost(RS.get("TECH.ASTRO"), 1))
        colony = RS.get("SHIP.COLONY")
        add({"M": colony["M"], "C": colony["C"], "D": colony["D"]})

        self.assertEqual(total, {"M": 23000, "C": 37100, "D": 13200})
        self.assertEqual(value_v(**{k.lower(): v for k, v in total.items()}), 136800.0)


if __name__ == "__main__":
    unittest.main()
