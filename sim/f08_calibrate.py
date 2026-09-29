#!/usr/bin/env python3
"""sim/f08_calibrate.py — F-08 宇宙速度校准器（CR-20260921-003 提案 E 前置证据）

目的：上游同构式（审计 §1.4）
    hours = (M+C) / (2500 × (1+R) × 2^N × universe_speed)
中的 universe_speed 在 V1.3 §05.10 属 TBD（F-08 单位 Blocked）。本脚本在
SIM-01 Normal 168h 场景下扫描候选速度档，为提案 E 提供校准证据。

=========================== 预登记判据（跑前冻结） ===========================
基线 = 实验分支原式（sim01_time_assumptions.json，unit_status=EXPERIMENTAL）同场景结果。

C1 开局节奏：金属矿 L1 完成时刻 ≤ Normal 首个清醒检查窗（4h）。
   （上游式设计意图：早期建筑分钟级完成；超过 4h 即偏离原版体验。）
C2 资产量级可比：168h 资产 V 与基线之比 ∈ [0.5, 2.0]。
   （速度只该改变建造节奏，不应凭空放大/压缩一周经济产出量级。）
C3 K-E 指标不退化（相对基线，绝对容差）：
   K-E05 仓损率增量 ≤ +0.02；K-E06 低能占比增量 ≤ +0.02；K-E07 闲置率增量 ≤ +0.02。
C4 守恒对账：每档 conservation.ok 必须为 True（硬门槛，不计入推荐但必查）。

推荐规则：在满足 C1–C3 的档位中，取「最低速度档」——最保守节奏，最小偏离基线；
若全部不满足，输出"无可推荐档"并列出各档失败原因。
==============================================================================

纪律：本脚本为实验枝工具（§11.1），全部输出 gate_evidence=false，
不构成 RC1/Gate 证据；推荐结果仅作为 CR-003 提案 E 的校准附件。
"""
from __future__ import annotations

import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset  # noqa: E402
from sim import sim01  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH_PATH = ROOT / "config" / "rulesets" / "branches" / "sim01_time_assumptions.json"

SPEEDS = [1, 2, 4, 6, 8, 10, 20]

C1_MAX_H = 4.0          # 金属矿 L1 完成上限（首个清醒检查窗）
C2_RATIO_RANGE = (0.5, 2.0)
C3_TOL = 0.02


def run_at_speed(rs: Ruleset, base_branch: dict, speed: int) -> dict:
    branch = copy.deepcopy(base_branch)
    tm = branch["time_model"]
    tm["model"] = "f08_upstream"
    tm["universe_speed"] = speed
    tm["unit_status"] = "EXPERIMENTAL — F-08 上游同构式校准扫描（gate_evidence=false）"
    return sim01.run_one("Normal", rs, branch)


def extract(r: dict) -> dict:
    m = r["metrics"]
    return {
        "metal_mine_L1_h": r["milestones_hours"].get("METAL_MINE_L1"),
        "asset_v": m["asset_value_v"],
        "K-E05": m["K-E05_worst_cap_loss_ratio"],
        "K-E06": m["K-E06_energy_low_time_ratio"],
        "K-E07": m["K-E07_forced_idle_ratio"] or 0.0,
        "conservation_ok": r["conservation"]["ok"],
        "events": r["events"],
    }


def main() -> None:
    rs = Ruleset()
    base_branch = json.loads(BRANCH_PATH.read_text(encoding="utf-8"))

    # 基线：实验分支原式（不打上游标记）
    baseline = extract(sim01.run_one("Normal", rs, base_branch))

    rows = []
    for s in SPEEDS:
        r = extract(run_at_speed(rs, base_branch, s))
        ratio = r["asset_v"] / baseline["asset_v"] if baseline["asset_v"] else float("inf")
        fails = []
        if r["metal_mine_L1_h"] is None or r["metal_mine_L1_h"] > C1_MAX_H:
            fails.append("C1")
        if not (C2_RATIO_RANGE[0] <= ratio <= C2_RATIO_RANGE[1]):
            fails.append("C2")
        if r["K-E05"] - baseline["K-E05"] > C3_TOL:
            fails.append("C3:E05")
        if r["K-E06"] - baseline["K-E06"] > C3_TOL:
            fails.append("C3:E06")
        if r["K-E07"] - baseline["K-E07"] > C3_TOL:
            fails.append("C3:E07")
        if not r["conservation_ok"]:
            fails.append("C4")
        rows.append({"speed": s, **r, "asset_ratio": round(ratio, 3),
                     "pass": not fails, "fails": fails})

    passing = [r for r in rows if r["pass"]]
    recommendation = min(passing, key=lambda r: r["speed"])["speed"] if passing else None

    report = {
        "run_id": f"f08-calibrate-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "purpose": "CR-20260921-003 提案 E 前置：F-08 上游同构式 universe_speed 校准",
        "gate_evidence": False,
        "gate_note": "实验枝校准扫描（§11.1/§05.10）。推荐档位仅作 CR 证据附件，不构成 RC1 结论。",
        "formula": "seconds = max(T_min, ceil(3600*(M+C)/(2500*(1+R)*2^N*universe_speed)))",
        "pre_registered_criteria": {
            "C1": f"METAL_MINE_L1 完成 ≤ {C1_MAX_H}h",
            "C2": f"168h 资产 V 与基线比 ∈ {list(C2_RATIO_RANGE)}",
            "C3": f"K-E05/06/07 相对基线增量 ≤ +{C3_TOL}",
            "C4": "守恒对账 ok（硬门槛）",
            "recommendation_rule": "满足 C1–C3 的最低速度档",
        },
        "baseline_experimental_model": baseline,
        "scan": rows,
        "recommended_universe_speed": recommendation,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"报告: {out}")
    print(f"\n基线（实验式）: 金属矿L1={baseline['metal_mine_L1_h']}h  资产V={baseline['asset_v']:.0f}  "
          f"K-E05={baseline['K-E05']:.3f} K-E06={baseline['K-E06']:.3f} K-E07={baseline['K-E07']:.3f}  "
          f"守恒={'OK' if baseline['conservation_ok'] else 'FAIL'}")
    hdr = f"\n{'速度':>4} {'L1完成h':>8} {'资产V':>10} {'资产比':>7} {'K-E05':>6} {'K-E06':>6} {'K-E07':>6} {'守恒':>4} {'判定'}"
    print(hdr)
    for r in rows:
        print(f"{r['speed']:>4} {(r['metal_mine_L1_h'] if r['metal_mine_L1_h'] is not None else float('nan')):>8.2f} "
              f"{r['asset_v']:>10.0f} {r['asset_ratio']:>7.3f} "
              f"{r['K-E05']:>6.3f} {r['K-E06']:>6.3f} {r['K-E07']:>6.3f} "
              f"{'OK' if r['conservation_ok'] else 'FAIL':>4} "
              f"{'PASS' if r['pass'] else 'FAIL ' + ','.join(r['fails'])}")
    if recommendation is not None:
        print(f"\n推荐 universe_speed = {recommendation}（满足 C1–C3 的最低档；写入 CR-003 提案 E 证据栏）")
    else:
        print("\n无可推荐档：全部速度档至少违反一条预登记判据，需回评审会讨论。")


if __name__ == "__main__":
    main()
