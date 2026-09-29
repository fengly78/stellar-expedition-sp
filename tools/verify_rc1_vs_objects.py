#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""三方对账：经典 0.84 原版成本表 vs 冻结规则集 RC1 vs 前端实际代码。

用途：把 doc/governance/SOURCE-02-codecross-check-2026-09-28.md 的结论固化为可复跑的门禁脚本。
退出码 0 = 三方一致（或差异均已在 ALLOW 中登记）；1 = 存在未登记差异。

只读，不修改任何规则集或源码。
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

# Windows 默认控制台是 GBK：本脚本输出含 U+2194（↔）等符号，直接跑会以
# UnicodeEncodeError 崩溃并 exit 1，且崩溃点在「差异扫描」段落——第二维度
# 根本没跑到。此前只有 tools/check_all.py 因对子进程强制 encoding="utf-8"
# 才侥幸通过，导致文档里写的「复现命令 exit 0」实际是坏的。
# 这里显式重配 stdout/stderr，让人工复现与 CI 行为一致。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):  # 非 TextIO / 已关闭
        pass

# 经典 OGame 0.84 成本表：upstream-ogamespec/game/core/techs.php 的 $initial 段
# (M, C, D, factor)
CLASSIC: dict[int, tuple[int, int, int, float]] = {
    1: (60, 15, 0, 1.5),        # 金属矿
    2: (48, 24, 0, 1.6),        # 晶体矿
    3: (225, 75, 0, 1.5),       # 重氢合成器
    4: (75, 30, 0, 1.5),        # 太阳能电站
    12: (900, 360, 180, 1.8),   # 聚变反应堆
    14: (400, 120, 200, 2.0),   # 机器人工厂
    21: (400, 200, 100, 2.0),   # 船坞
    22: (2000, 0, 0, 2.0),      # 金属仓库
    23: (2000, 1000, 0, 2.0),   # 晶体仓库
    24: (2000, 2000, 0, 2.0),   # 氘仓库
    31: (200, 400, 200, 2.0),   # 研究实验室
    33: (0, 50000, 25000, 2.0), # 地形改造器
    34: (1000000, 500000, 100000, 2.0),  # 纳米工厂
    41: (20000, 40000, 20000, 2.0),      # 月球基地
    42: (20000, 40000, 20000, 2.0),      # 传感器阵列
    43: (2000000, 4000000, 2000000, 2.0),  # 跳跃门
    44: (20000, 20000, 1000, 2.0),       # 导弹发射井
}

# RC1 参数键 -> 建筑 id
RC1_KEYS: dict[int, str] = {
    1: "BUILD.METAL_MINE", 2: "BUILD.CRYSTAL_MINE", 3: "BUILD.DEUT_SYNTH",
    4: "BUILD.SOLAR", 12: "BUILD.FUSION", 14: "BUILD.ROBOTICS",
    21: "BUILD.SHIPYARD", 22: "BUILD.M_STORAGE", 23: "BUILD.C_STORAGE",
    24: "BUILD.D_STORAGE", 31: "BUILD.LAB", 33: "BUILD.TERRAFORMER",
    34: "BUILD.NANITE", 41: "BUILD.MOON_BASE", 42: "BUILD.PHALANX",
    43: "BUILD.JUMP_GATE", 44: "BUILD.MISSILE_SILO",
}

# 已登记差异（SOURCE-02-codecross-check-2026-09-28 §六）：代码与 RC1/原版不符属已知待裁决项
ALLOW: dict[int, str] = {
    2: "晶矿 factor 1.5 vs RC1/原版 1.6",
    12: "聚变 900/360/180 g1.8(代码=原版) vs RC1 150/60/30 g1.5；"
        "CR-002 首行状态仍是 Draft(待评审)，三方不一致待裁决",
    21: "船坞 factor 1.75 vs RC1/原版 2.0",
    22: "仓库基座跟 RC1、指数跟原版",
    23: "仓库基座跟 RC1、指数跟原版",
    24: "仓库基座跟 RC1、指数跟原版",
    31: "实验室 factor 1.75 vs RC1/原版 2.0",
    34: "RC1 已登记 BUILD.NANITE，代码未实现 id 34",
    41: "月球基地 8000/8000/4000 vs 原版 20000/40000/20000（月面工业线自定义降本）",
    # 以下 4 项：RC1 未登记对应键，但代码已实现且数值与经典原版一致。
    # 不是数值冲突，是规则集的登记缺口——将来若按 RC1 校验这些建筑会找不到条目。
    33: "RC1 未登记 BUILD.TERRAFORMER，代码已实现（值同原版）",
    42: "RC1 未登记 BUILD.PHALANX，代码已实现（值同原版）",
    43: "RC1 未登记 BUILD.JUMP_GATE，代码已实现（值同原版）",
    44: "RC1 未登记 BUILD.MISSILE_SILO，代码已实现（值同原版）",
}

LINE_RE = re.compile(
    r"^\s*(?P<id>\d+):\s*\{\s*id:\s*(?P=id)\s*,\s*name:\s*'[^']+',\s*nameEn:\s*'[^']+'"
    r".*?cost:\s*\{\s*metal:\s*(?P<m>[\d.]+),\s*crystal:\s*(?P<k>[\d.]+),\s*deuterium:\s*(?P<d>[\d.]+)\s*\}"
    r".*?factor:\s*(?P<f>[\d.]+)", re.I)


def load_code() -> dict[int, tuple[float, float, float, float]]:
    out = {}
    for line in io.open(OBJECTS, encoding="utf-8").read().splitlines():
        m = LINE_RE.match(line)
        if m:
            g = m.groupdict()
            out[int(g["id"])] = (float(g["m"]), float(g["k"]), float(g["d"]), float(g["f"]))
    return out


def load_rc1() -> dict[str, dict]:
    data = json.load(io.open(RC1, encoding="utf-8"))
    return {p["key"]: p for p in data["parameters"]}


def main() -> int:
    code = load_code()
    params = load_rc1()

    print("=" * 96)
    print("三方对账：经典 0.84 (techs.php)  vs  冻结规则集 RC1  vs  前端代码 objects.ts")
    print("=" * 96)
    hdr = "%-4s %-20s %-22s %-22s %-22s" % ("id", "建筑", "经典 0.84", "RC1", "代码")
    print(hdr)
    print("-" * 96)

    unknown: list[int] = []
    for bid in sorted(CLASSIC):
        name = {"1": "金属矿", "2": "晶体矿", "3": "重氢合成", "4": "太阳能", "12": "聚变",
                "14": "机器人工厂", "21": "船坞", "22": "金属仓库", "23": "晶体仓库",
                "24": "氘仓库", "31": "实验室", "33": "地形改造", "34": "纳米工厂",
                "41": "月球基地", "42": "传感器阵列", "43": "跳跃门", "44": "导弹井"}.get(str(bid), str(bid))
        cm, ck, cd, cf = CLASSIC[bid]
        classic = "%g/%g/%g g%g" % (cm, ck, cd, cf)

        key = RC1_KEYS[bid]
        p = params.get(key)
        if p is None:
            rc1s = "(RC1 无此键)"
        else:
            v = p["value"]
            rc1s = "%g/%g/%g g%s" % (v.get("M", 0), v.get("C", 0), v.get("D", 0), v.get("g", "?"))

        c = code.get(bid)
        if c is None:
            codes = "(代码缺失)"
        else:
            codes = "%g/%g/%g f%g" % c

        print("%-4d %-20s %-22s %-22s %-22s" % (bid, name, classic, rc1s, codes))

    print()
    print("=" * 96)
    print("已知差异登记（ALLOW，退出码仍为 0）")
    print("=" * 96)
    for bid, why in sorted(ALLOW.items()):
        print("  id %-3d %s" % (bid, why))

    print()
    print("=" * 96)
    print("差异扫描（三个维度：代码↔经典、代码↔RC1、RC1↔经典）")
    print("=" * 96)
    # 2026-09-28 修复：本扫描此前只比「代码 vs 经典」一个维度，且开头的
    # `if bid in ALLOW: continue` 会连带跳过 RC1 维度。后果是 id 12 聚变的
    # 「RC1 150/60/30 vs 代码 900/360/180」这类冲突被完全漏检——因为聚变的代码值
    # 恰好与经典原版一致，落在 ALLOW 之外时只会被拿去和经典比，一比就过。
    # 真正需要盯的是「RC1 冻结值 vs 代码实际值」，那才是会让人按规则集调参踩空的地方。
    found = 0
    for bid in sorted(CLASSIC):
        cm, ck, cd, cf = CLASSIC[bid]
        classic = (float(cm), float(ck), float(cd), float(cf))
        c = code.get(bid)
        if c is None:
            if bid not in ALLOW:
                print("  ! id %d 代码缺失（未登记）" % bid)
                found += 1
            continue

        # 维度 1：代码 vs 经典
        if c != classic and bid not in ALLOW:
            print("  ! id %d 代码与经典 0.84 不符：%g/%g/%g f%g（未登记）"
                  % (bid, c[0], c[1], c[2], c[3]))
            found += 1

        # 维度 2：代码 vs RC1（RC1 是冻结规则集，代码应当与之一致）
        p = params.get(RC1_KEYS[bid])
        if p is None:
            if bid not in ALLOW:
                print("  ! id %d RC1 未登记 %s，但代码已实现（未登记差异）"
                      % (bid, RC1_KEYS[bid]))
                found += 1
            continue
        v = p["value"]
        rc1v = (float(v.get("M", 0)), float(v.get("C", 0)), float(v.get("D", 0)), float(v.get("g", 0)))
        if rc1v != c and bid not in ALLOW:
            print("  ! id %d RC1 冻结值 %g/%g/%g g%g 与代码 %g/%g/%g f%g 不符（未登记）"
                  % (bid, rc1v[0], rc1v[1], rc1v[2], rc1v[3], c[0], c[1], c[2], c[3]))
            found += 1

    # 维度 3：RC1 登记了但代码没实现的建筑
    for bid, key in sorted(RC1_KEYS.items()):
        if key in params and bid not in code and bid not in ALLOW:
            print("  ! %s（id %d）RC1 已登记，代码未实现（未登记）" % (key, bid))
            found += 1

    # 维度 4：仓容「曲线」（不是造价）。2026-09-29 试玩核查补。
    # 此前三个维度全都在比 BUILD.* 的 cost/factor，从没比过 F-04 的仓容公式本身，
    # 于是代码 storageCapacity = 10000*2^L 与 RC1 S(L)=S0+S1(g^L-1)/(g-1)
    # （g=1.6）之间 5.6x(Lv10)~17.1x(Lv15) 的差异长期没被机器发现——
    # doc/gap-analysis-* 的人工分析早已标红，但门禁看不见。
    curve = params.get("STORAGE.CURVE", {}).get("value")
    if curve:
        s0, s1, g = float(curve["S0"]), float(curve["S1"]), float(curve["g"])
        code_cap = re.search(
            r"export function storageCapacity\([^)]*\)\s*:\s*number\s*\{\s*return\s*([\d.]+)\s*\*\s*Math\.pow\(\s*([\d.]+)\s*,",
            OBJECTS.read_text(encoding="utf-8"),
        )
        if code_cap:
            cbase, cbase_lvl = float(code_cap.group(1)), float(code_cap.group(2))
            print("  · 仓容曲线：RC1 F-04 S(L)=%g+%g·(%g^L−1)/(%g−1) vs 代码 %g·%g^L"
                  % (s0, s1, g, g - 1, cbase, cbase_lvl))
            for lv in (5, 10, 15):
                rc1_cap = s0 + s1 * ((g ** lv) - 1) / (g - 1)
                cd_cap = cbase * (cbase_lvl ** lv)
                print("      Lv%-3d RC1 %14.0f  代码 %14.0f  倍数 %5.2fx"
                      % (lv, rc1_cap, cd_cap, cd_cap / rc1_cap))
        else:
            print("  · 未能从 objects.ts 解析 storageCapacity 公式，仓容曲线维度跳过")

    # 代码中存在的、经典表未覆盖的建筑 id
    extra = sorted(set(code) - set(CLASSIC))
    if extra:
        print("  · 代码含经典表未覆盖的 id：%s" % ", ".join(str(i) for i in extra))

    if found:
        print("\n结果：FAIL（%d 项未登记差异）" % found)
        return 1
    print("\n结果：PASS（%d 项已知差异已登记，三维度均无未登记差异）" % len(ALLOW))
    return 0


if __name__ == "__main__":
    sys.exit(main())
