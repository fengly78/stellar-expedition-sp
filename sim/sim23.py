#!/usr/bin/env python3
"""sim/sim23.py — SIM-02→SIM-03 预算联动（V1.3 §06.4 "使用 SIM-02 的 Day14/30 舰队预算"）

预算推导口径（实验分支登记，gate_evidence=false）：
  舰队预算 V = SIM-02 指定策略 × 指定日 的全文明库存 V（可花费资源上限）。
  整数编成：全轻战 = floor(budget/4000V)、全重战 = floor(budget/10000V)，余量单列（06.4）。
  该口径是"库存 100% 转军"的上界场景；正式轮应由 Balance 登记军事预算比例候选。

矩阵：deep/expansion × Day14/Day30 × {LF攻HF守, HF攻LF守}，科技 0/0，100 种子/组。
目的：验证两模拟管线可联动、观察预算规模对战斗结果形态的影响；不作 K-C01~03 证据。
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, value_v  # noqa: E402
from sim import sim02  # noqa: E402
from sim.sim03 import Arsenal, run_group  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH3 = ROOT / "config" / "rulesets" / "branches" / "sim03_assumptions.json"


def inventory_v(snapshot: dict) -> float:
    t = snapshot["inventory_total"]
    return value_v(t["M"], t["C"], t["D"])


def main() -> None:
    branch1 = json.loads(sim02.BRANCH1.read_text(encoding="utf-8"))
    branch2 = json.loads(sim02.BRANCH2.read_text(encoding="utf-8"))
    branch3 = json.loads(BRANCH3.read_text(encoding="utf-8"))
    rs = Ruleset()
    ars = Arsenal(rs, branch3)
    seeds = 100  # 联动骨架轮；正式 1000~10000

    # 1) 跑 SIM-02 取 Day14/30 库存（引擎确定性，结果可复现）
    eco = {s: sim02.run_strategy(s, rs, branch1, branch2) for s in ("deep", "expansion")}
    budgets = {}
    for strat, r in eco.items():
        for snap in r["snapshots"]:
            if snap["day"] in (14.0, 30.0):
                budgets[f"{strat}-D{int(snap['day'])}"] = {
                    "inventory_v": round(inventory_v(snap), 0),
                    "planets": snap["planets"],
                    "conservation_ok": r["conservation"]["ok"],
                }

    # 2) 每个预算点跑两个方向的等预算组
    groups = []
    for label, b in budgets.items():
        budget = b["inventory_v"]
        n_lf = int(budget // ars.cost_v("LIGHT"))
        n_hf = int(budget // ars.cost_v("HEAVY"))
        if n_lf == 0 or n_hf == 0:
            continue
        groups.append(run_group(f"{label}-LF-att", {"LIGHT": n_lf}, {"HEAVY": n_hf},
                                0, 0, seeds, ars, rs, branch3))
        groups.append(run_group(f"{label}-HF-att", {"HEAVY": n_hf}, {"LIGHT": n_lf},
                                0, 0, seeds, ars, rs, branch3))

    report = {
        "run_id": f"sim23-linkage-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"],
        "ruleset": rs.meta["ruleset_version"],
        "budget_derivation": "舰队预算V = SIM-02 该策略该日全文明库存V（100%转军上界，实验口径）",
        "budgets": budgets,
        "gate_evidence": False,
        "gate_note": "预算推导口径、科技 0、燃料 0 均实验；种子 100。只证明联动管线可运行。",
        "groups": groups,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}")
    print("预算推导（SIM-02 全文明库存 V）：")
    for label, b in budgets.items():
        print(f"  {label:<16} {b['inventory_v']:>10.0f} V  ({b['planets']} 星, 守恒={'OK' if b['conservation_ok'] else 'FAIL'})")
    print(f"\n{'组':<26} {'编成(LF攻/HF守)':>16} {'胜率':>6} {'交换比P50':>9} {'攻损均':>9} {'守损均':>9}")
    for g in groups:
        n_att = list(g["attacker_comp"].values())[0]
        n_def = list(g["defender_comp"].values())[0]
        xr = g["exchange_ratio"]["p50"]
        print(f"{g['group']:<26} {f'{n_att}/{n_def}':>16} {g['attacker_win_rate']:>6.2f} "
              f"{(f'{xr:>9.2f}' if xr is not None else '       —')} "
              f"{g['attacker_loss_v']['mean']:>9.0f} {g['defender_loss_v']['mean']:>9.0f}")


if __name__ == "__main__":
    main()
