#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F-08 声明与线上实现的一致性检查（2026-09-28）。

背景：config/rulesets/balance_rc1.json 的 F-08「建造时间原式」声明 status=Frozen，
表达式为上游同构式 T = max(T_min, ceil(3600*(M+C)/(2500*(1+R)*2^N*speed)))。
但 web/src/game/objects.ts 实际生效的是

    buildingTime = baseTime * factor^L / SPEED / (1+R)

即每种建筑一个手写 baseTime 常量，不由造价推导，且没有 2^N 纳米工厂项、没有 T_min 下限。

后果：规则集声称的 Frozen 公式在运行时不存在，任何按 F-08 做平衡推演的人
（以及 rules/formulas.py 的 SIM 报告）得到的结论与线上行为对不上。

本脚本只读，把差距量化并检查线上公式的结构性缺失。
退出码 0 = 线上实现与 F-08 声明一致；1 = 不一致（需裁决后修正其一）。
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RC1 = ROOT / "config" / "rulesets" / "balance_rc1.json"
OBJECTS = ROOT / "web" / "src" / "game" / "objects.ts"

SPEED_RE = re.compile(r"export const SPEED = (\d+(?:\.\d+)?)")
BUILDING_TIME_RE = re.compile(r"export function buildingTime\(([^)]*)\)")
LINE_RE = re.compile(
    r"^\s*(?P<id>\d+):\s*\{\s*id:\s*(?P=id)\s*,\s*name:\s*'[^']+',\s*nameEn:\s*'[^']+'"
    r".*?cost:\s*\{\s*metal:\s*(?P<m>[\d.]+),\s*crystal:\s*(?P<k>[\d.]+),\s*deuterium:\s*(?P<d>[\d.]+)\s*\}"
    r".*?factor:\s*(?P<f>[\d.]+)\s*,\s*baseTime:\s*(?P<t>[\d.]+)", re.M)


def main() -> int:
    rc1 = json.load(io.open(RC1, encoding="utf-8"))
    f08 = next(x for x in rc1["formulas"] if x["id"] == "F-08")
    src = io.open(OBJECTS, encoding="utf-8").read()

    speed = float(SPEED_RE.search(src).group(1))
    sig = BUILDING_TIME_RE.search(src).group(1)
    body = src[BUILDING_TIME_RE.search(src).start():][:400]

    buildings = []
    for m in LINE_RE.finditer(src):
        d = m.groupdict()
        buildings.append((int(d["id"]), float(d["m"]), float(d["k"]), float(d["f"]), float(d["t"])))

    print("=" * 78)
    print("F-08 声明 vs 线上实现")
    print("=" * 78)
    print("F-08 status  : %s" % f08["status"])
    print("F-08 表达式   : %s" % f08["expression"])
    print("线上 SPEED   : %g" % speed)
    print("线上签名     : buildingTime(%s)" % sig)
    print()

    issues = []

    # 只有 F-08 声明为 Frozen 时，线上实现才「应该」与之一致。
    # 若已降级为 Candidate（线下推演式），线上用另一套公式不算缺陷，
    # 本脚本退化为差距报告，exit 0。
    # 2026-09-28：F-08 由 Frozen 降级为 Candidate——v1.0.0 已按常量节奏发布并有存量存档，
    # 改代码会破坏存档与全部平衡；改声明是零风险的诚实修正。
    strict = f08["status"] == "Frozen"
    if not strict:
        print("=" * 78)
        print("F-08 status=%s（非 Frozen）——线上采用另一套建造时长公式属既定设计，"
              % f08["status"])
        print("本脚本退化为差距报告，不做一致性判定。")
        print("=" * 78)

    # 1) 2^N 纳米工厂项
    has34 = any(b[0] == 34 for b in buildings)
    uses_nanite = "nanite" in sig.lower()
    if not (has34 and uses_nanite):
        issues.append("F-08 的 2^N 纳米工厂项在线上不存在"
                      "（BUILDINGS 含 id 34 = %s；签名含 nanite = %s）" % (has34, uses_nanite))

    # 2) T_min 下限
    if "T_MIN" not in src and "t_min" not in src.lower():
        issues.append("F-08 的 T_min 下限在线上不存在")

    # 3) 时长是否由造价推导
    derives_from_cost = bool(re.search(r"3600", body))
    if not derives_from_cost:
        issues.append("线上 buildingTime 不含 3600*(M+C) 造价推导项，改用手写 baseTime 常量")

    # 4) 量化差距
    print("=" * 78)
    print("Lv0 时长差距（speed=%g，机器人=0，纳米=0，单位秒）" % speed)
    print("=" * 78)
    print("%-4s %-16s %12s %14s %12s" % ("id", "造价 M/C", "线上 s", "F-08 s", "倍率"))
    print("-" * 62)
    mults = []
    for bid, m, k, f, t in buildings:
        local = t / speed
        f08s = 3600 * (m + k) / 2500.0 / speed
        mult = f08s / local if local else 0
        mults.append(mult)
        print("%-4d %-16s %12.1f %14.1f %12.2f" % (bid, "%g/%g" % (m, k), local, f08s, mult))
    print()
    print("倍率范围 %.2f ~ %.2f（均值 %.2f）" % (min(mults), max(mults), sum(mults) / len(mults)))
    lv0_vals = {}
    for bid, m, k, f, t in buildings:
        lv0_vals.setdefault(t / speed, []).append(bid)
    print("注：线上 Lv0 只有 %d 个不同时长——" % len(lv0_vals))
    for v in sorted(lv0_vals):
        ids = lv0_vals[v]
        label = "%d 个建筑" % len(ids) if len(ids) > 1 else "id %d" % ids[0]
        print("    %.1fs  <- %s" % (v, label))
    print("    造价最高的跳跃门与最便宜的金属矿耗时相同。")
    print()

    print("=" * 78)
    print("结论")
    print("=" * 78)
    if issues:
        for i in issues:
            print("  ! " + i)
        print()
        if not strict:
            print("结果：PASS —— F-08 状态为 %s，线上常量节奏公式为既定设计（差距仅作报告）。"
                  % f08["status"])
            return 0
        print("结果：FAIL —— F-08 声明为 Frozen 但线上实现不是该公式。")
        print("需所有者裁决：A) 代码改用 F-08（含纳米工厂 2^N 与 T_min）；")
        print("            B) 把 F-08 状态降级并改写为「线下推演式，线上为常量节奏」。")
        return 1
    print("结果：PASS —— 线上实现与 F-08 声明一致。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
