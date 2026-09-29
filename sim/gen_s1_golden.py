#!/usr/bin/env python3
"""sim/gen_s1_golden.py — 生成 E1-S1 跨语言对账金值（ProductionService vs sim/engine.py）

用 sim/engine.py 真实结算内核生成确定性场景，输出 tests/golden/s1_production_vectors.json；
PHP 侧 ProductionServiceTest 逐向量回放比对（dev-plan-e1 S1 验收钩子：逐点一致）。

场景步骤协议（PHP 侧照此回放）：
  {"settle_seconds": N}      —— 按当前等级结算 N 秒
  {"set_levels": {...}}      —— 建筑等级变更（模拟建造完成；先 settle 再升级由向量顺序保证）
初始库存/等级在每向量 initial 字段。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset  # noqa: E402
from sim.engine import Engine, Planet  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "game-server" / "tests" / "golden" / "s1_production_vectors.json"


def run_vector(name: str, rs: Ruleset, initial_inv: dict, levels: dict, steps: list[dict]) -> dict:
    planet = Planet(rs, initial_inv)
    for b, lv in levels.items():
        planet.levels[b] = lv
    eng = Engine(rs, planet)
    trace = []
    t = 0.0
    for step in steps:
        if "settle_seconds" in step:
            t += step["settle_seconds"]
            eng.settle_to(t)
            trace.append({"t": t, "inv": {r: round(planet.inv[r], 4) for r in ("M", "C", "D")}})
        elif "set_levels" in step:
            for b, lv in step["set_levels"].items():
                planet.levels[b] = lv
        else:
            raise ValueError(f"未知步骤: {step}")
    return {
        "name": name,
        "initial": {"inventory": initial_inv, "levels": levels},
        "steps": steps,
        "expected_trace": trace,
        "conservation": eng.conservation_check()["ok"],
    }


def main() -> None:
    rs = Ruleset()
    vectors = [
        # V1 零级行星：无矿无产能，库存不变
        run_vector("v1_idle_zero_levels", rs, {"M": 500, "C": 500, "D": 0}, {},
                   [{"settle_seconds": 3600}]),
        # V2 能源充足：M5/C4/D3，太阳能 L12 足供，1 小时
        run_vector("v2_normal_1h", rs, {"M": 0, "C": 0, "D": 0},
                   {"METAL_MINE": 5, "CRYSTAL_MINE": 4, "DEUT_SYNTH": 3, "SOLAR": 12},
                   [{"settle_seconds": 3600}]),
        # V3 能源赤字：矿级高、太阳能低，e<1，30 分钟
        run_vector("v3_energy_deficit", rs, {"M": 100, "C": 100, "D": 100},
                   {"METAL_MINE": 15, "CRYSTAL_MINE": 14, "DEUT_SYNTH": 12, "SOLAR": 4},
                   [{"settle_seconds": 1800}]),
        # V4 仓容截断：0 级仓库（cap=S0），长时段满仓停产
        run_vector("v4_storage_cap", rs, {"M": 0, "C": 0, "D": 0},
                   {"METAL_MINE": 10, "CRYSTAL_MINE": 8, "DEUT_SYNTH": 6, "SOLAR": 20},
                   [{"settle_seconds": 7 * 24 * 3600}]),
        # V5 分段：结算 1h → 金属矿升 L6 → 再结算 1h（速率切换点精度）
        run_vector("v5_segmented_upgrade", rs, {"M": 0, "C": 0, "D": 0},
                   {"METAL_MINE": 5, "CRYSTAL_MINE": 4, "DEUT_SYNTH": 3, "SOLAR": 12},
                   [{"settle_seconds": 3600},
                    {"set_levels": {"METAL_MINE": 6}},
                    {"settle_seconds": 3600}]),
        # V6 连续两次升级（太阳能先升改变 e，再升矿）
        run_vector("v6_two_upgrades", rs, {"M": 0, "C": 0, "D": 0},
                   {"METAL_MINE": 10, "CRYSTAL_MINE": 9, "DEUT_SYNTH": 8, "SOLAR": 6},
                   [{"settle_seconds": 1800},
                    {"set_levels": {"SOLAR": 10}},
                    {"settle_seconds": 1800},
                    {"set_levels": {"METAL_MINE": 11}},
                    {"settle_seconds": 3600}]),
    ]
    out = {
        "source": "sim/engine.py settle_to 语义（sim/gen_s1_golden.py 生成）",
        "rule": "PHP ProductionService.settle 必须逐向量逐点一致（容差 1e-4）；conservation 必须全 true",
        "vectors": vectors,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"金值: {OUT}")
    for v in vectors:
        last = v["expected_trace"][-1]["inv"]
        print(f"  {v['name']:<26} 守恒={'OK' if v['conservation'] else 'FAIL'}  末态 M/C/D = "
              f"{last['M']:.2f}/{last['C']:.2f}/{last['D']:.2f}")


if __name__ == "__main__":
    main()
