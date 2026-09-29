#!/usr/bin/env python3
"""balance_tables.py — 批准冻结值（RC1-Frozen）平衡快照（game-balance-analysis 四视图）。

只读 RC1 与 formulas.py 口径，不改任何文件。输出四类标准视图：
  1) 成本-产量-回本表（F-01/F-02/F-04，回本=边际累计造价V/边际时产V）
  2) 能源耦合瓶颈（F-03：各矿级的太阳能需求）
  3) 舰船交换比（造价V vs 攻击/耐久/载货，RC1 五舰）
  4) 里程碑时间轴（F-08 上游同构式，BUILD.TIME/SHIP.TIME/RESEARCH.TIME）
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rc1 = json.loads((ROOT / "config/rulesets/balance_rc1.json").read_text(encoding="utf-8"))
P = {p["key"]: p["value"] for p in rc1["parameters"]}
V = P["VALUE.RESOURCE"]  # F-05：M=1 C=2 D=3

RES = ("M", "C", "D")


def cost(key: str, level: int) -> dict:
    b = P[key]
    return {r: math.ceil(b[r] * b["g"] ** (level - 1)) for r in RES}


def cum_cost(key: str, upto: int) -> dict:
    t = {"M": 0, "C": 0, "D": 0}
    for L in range(1, upto + 1):
        c = cost(key, L)
        for r in RES:
            t[r] += c[r]
    return t


def vsum(d: dict) -> float:
    return sum(d[r] * V[r] for r in RES)


def prod(key: str, level: int) -> float:
    p = P[key]
    return p["p"] * level * p["a"] ** (level - 1)


PROD_KEY = {
    "BUILD.METAL_MINE": "RESOURCE.M.PRODUCTION",
    "BUILD.CRYSTAL_MINE": "RESOURCE.C.PRODUCTION",
    "BUILD.DEUT_SYNTH": "RESOURCE.D.PRODUCTION",
}


def demand(key: str, level: int) -> float:
    d = P[key]
    return d["base"] * level * d["factor"] ** (level - 1)


def solar_out(level: int) -> float:
    s = P["ENERGY.SOLAR"]
    return s["base"] * level * s["factor"] ** (level - 1) if level else 0.0


def build_seconds(cost_mc: float, family: str, robotics: int = 0, nanite: int = 0, shipyard: int = 0, lab: int = 0) -> float:
    """F-08 上游同构式（RC1 BUILD.TIME/SHIP.TIME/RESEARCH.TIME，speed=1）。"""
    t = P[family]
    if family == "RESEARCH.TIME":
        den = t["constant"] * (1 + t["lab_factor"]) * t["universe_speed"]
    else:
        r = robotics if family == "BUILD.TIME" else shipyard
        den = t["constant"] * (1 + r) * 2 ** nanite * t["universe_speed"]
    return max(t["t_min_seconds"], math.ceil(3600 * cost_mc / den))


def hms(sec: float) -> str:
    if sec >= 3600:
        return f"{sec/3600:.1f}h"
    return f"{sec/60:.0f}m"


print("=" * 72)
print("视图1：三矿边际成本-产量-回本（F-01/F-02/F-03，e=1，重氢按 25℃ 系数 1.15）")
print("=" * 72)
temp_factor = P["RESOURCE.D.TEMPERATURE"]["base"] + P["RESOURCE.D.TEMPERATURE"]["per_degree"] * (25 + P["RESOURCE.D.TEMPERATURE"]["offset"])
for key, label in (("BUILD.METAL_MINE", "金属矿"), ("BUILD.CRYSTAL_MINE", "晶体矿"), ("BUILD.DEUT_SYNTH", "重氢合成")):
    print(f"\n{label}（{key}）")
    print(f"{'Lv':>3} {'本级造价V':>10} {'累计造价V':>10} {'时产(自产)':>10} {'时产V':>8} {'边际回本h':>9}")
    prev_hour_v = 0.0
    for L in range(1, 13):
        c = cost(key, L)
        cum = cum_cost(key, L)
        if key == "BUILD.DEUT_SYNTH":
            hour = prod(PROD_KEY[key], L) * temp_factor
        else:
            hour = prod(PROD_KEY[key], L)
        hour_v = hour * V[("M" if "METAL" in key else "C" if "CRYSTAL" in key else "D")]
        incremental_h = (hour_v - prev_hour_v) if L > 1 else hour_v
        payback = vsum(c) / incremental_h if incremental_h > 0 else float("inf")
        print(f"{L:>3} {vsum(c):>10.0f} {vsum(cum):>10.0f} {hour:>10.1f} {hour_v:>8.0f} {payback:>9.1f}")
        prev_hour_v = hour_v

print()
print("=" * 72)
print("视图2：能源耦合（F-03）——各级三矿总需求 vs 太阳能供给（聚变未建）")
print("=" * 72)
print(f"{'三矿同级L':>8} {'总耗电/h':>9} {'太阳能需Lv':>9} {'太阳能累计造价V':>12}")
for L in range(1, 13):
    need = sum(demand(k, L) for k in ("ENERGY.M_DEMAND", "ENERGY.C_DEMAND", "ENERGY.D_DEMAND"))
    s_lv = 0
    while solar_out(s_lv) < need and s_lv < 40:
        s_lv += 1
    sc = cum_cost("BUILD.SOLAR", s_lv)
    print(f"{L:>8} {need:>9.0f} {s_lv:>9} {vsum(sc):>12.0f}")

print()
print("=" * 72)
print("视图3：舰船交换比（RC1 五舰：造价V vs 攻击/耐久，SOURCE-01/02 双源值）")
print("=" * 72)
print(f"{'舰种':>8} {'造价V':>8} {'攻击':>5} {'耐久':>6} {'攻/万V':>7} {'耐久/万V':>8} {'载货':>6} {'速':>8} {'油/千距':>7}")
for sid, name in ((204, "轻战"), (205, "重战"), (202, "小运"), (208, "殖民"), (210, "探针")):
    s = P[f"SHIP.{sid and '' or ''}"] if False else P[f"SHIP.{'LIGHT' if sid==204 else 'HEAVY' if sid==205 else 'SMALL_CARGO' if sid==202 else 'COLONY' if sid==208 else 'SCOUT'}"]
    cv = s["M"] * V["M"] + s["C"] * V["C"] + s["D"] * V["D"]
    dur = (s["H"] if "H" in s else 0) + s["S"]
    atk = s["A"] if "A" in s else s["attack"] if "attack" in s else 0
    print(f"{name:>8} {cv:>8.0f} {atk:>5} {dur:>6} {atk/cv*10000:>7.0f} {dur/cv*10000:>8.0f} {s['cargo']:>6} {s['speed']:>8} {s['fuel']:>7}")

print()
print("=" * 72)
print("视图4：里程碑时间轴（F-08 上游同构式，机器人/纳米/船厂=0，speed=1）")
print("=" * 72)
miles = [
    ("金属矿 L1", cum_cost("BUILD.METAL_MINE", 1), "BUILD.TIME"),
    ("太阳能 L1", cost("BUILD.SOLAR", 1), "BUILD.TIME"),
    ("实验室 L1", cost("BUILD.LAB", 1), "BUILD.TIME"),
    ("船厂 L1", cost("BUILD.SHIPYARD", 1), "BUILD.TIME"),
    ("实验室 L3（累计）", cum_cost("BUILD.LAB", 3), "BUILD.TIME"),
    ("能源科技 L1（研究）", cost("TECH.ENERGY", 1), "RESEARCH.TIME"),
]
for label, c, fam in miles:
    sec = build_seconds(c["M"] + c["C"], fam)
    print(f"{label:<18} 造价 {c['M']}/{c['C']}/{c['D']}  时长 {hms(sec)}")
lf = P["SHIP.LIGHT"]
sec = build_seconds(lf["M"] + lf["C"], "SHIP.TIME")
print(f"{'首艘轻战（船厂L0）':<14} 造价 {lf['M']}/{lf['C']}/{lf['D']}  时长 {hms(sec)}")
cf = P["SHIP.COLONY"]
sec = build_seconds(cf["M"] + cf["C"], "SHIP.TIME")
print(f"{'首艘殖民船':<18} 造价 {cf['M']}/{cf['C']}/{cf['D']}  时长 {hms(sec)}")

# 聚变 vs 太阳能（CR-002 B 定位）
print()
print("视图4b：能源密度对比（CR-002 B）")
fus = P["BUILD.FUSION"]
fd = P["ENERGY.FUSION_DEMAND"]
print(f"聚变 L1：产能 {P['ENERGY.FUSION']['base']}能/h，烧氘 {fd['base']}氘/h（氘价 {V['D']}V → 燃料成本 {fd['base']*V['D']}V/h）")
print(f"太阳能 L1：产能 {P['ENERGY.SOLAR']['base']}能/h，零燃料；聚变 L1 造价 V {vsum(fus):.0f} vs 太阳能累计 L3 造价 V {vsum(cum_cost('BUILD.SOLAR', 3)):.0f}")
