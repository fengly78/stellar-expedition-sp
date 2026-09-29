#!/usr/bin/env python3
"""sim/sim03.py — SIM-03 战斗与军事经济骨架（V1.3 §06.4）

引擎：sim/combat.py（已与 canonical battle.ts 逐位等价验证，种子 42 / 140 单位 6 回合全一致）。
矩阵：等预算 400000V（100 轻战 vs 40 重战，余量 0，RC1 口径）× 镜像/正反 × 科技差距 0/+6，
外加掠夺+残骸冒烟组（SMALL_CARGO 货舱、库存 250000V、掠夺 50%、残骸 30%、回收 0）。
每组 200 显式种子（正式轮 1000~10000），记录胜率、损失 P10/P50/P90、交换比、净利润。
gate_evidence=false：科技口径、燃料（记 0）、rapidfire 空缺均为实验/缺口项。
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, value_v  # noqa: E402
from sim.combat import UnitSpec, simulate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH = ROOT / "config" / "rulesets" / "branches" / "sim03_assumptions.json"


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


class Arsenal:
    """RC1 舰船战斗属性 + 实验科技口径（1+0.05L）。"""

    def __init__(self, rs: Ruleset, branch: dict):
        self.branch = branch
        self.base = {}
        for name in ("LIGHT", "HEAVY", "SMALL_CARGO", "SCOUT"):
            v = rs.get(f"SHIP.{name}")
            self.base[name] = {"A": v["A"], "S": v["S"], "H": v["H"],
                               "cost_v": value_v(v["M"], v["C"], v["D"]), "cargo": v.get("cargo")}
        self.tech_gain = rs.get("COMBAT.TECH_GAIN")
        self.ids = branch["unit_ids"]

    def spec(self, name: str, tech: int = 0) -> UnitSpec:
        b = self.base[name]
        m = 1 + self.tech_gain * tech
        return UnitSpec(self.ids[name], b["A"] * m, b["S"] * m, b["H"] * m)

    def cost_v(self, name: str) -> float:
        return self.base[name]["cost_v"]


def fleet(mission_id: int, owner: int, comp: dict[str, int], ars: Arsenal, tech: int) -> dict:
    return {"fleet_mission_id": mission_id, "owner_id": owner,
            "units": {ars.ids[n]: {"spec": ars.spec(n, tech), "amount": c} for n, c in comp.items()}}


def losses_v(losses: dict[int, int], ars: Arsenal) -> float:
    inv = {v: k for k, v in ars.ids.items()}
    return sum(ars.cost_v(inv[uid]) * n for uid, n in losses.items())


def debris_v(losses: dict[int, int], rs: Ruleset, ars: Arsenal, rate: float) -> float:
    """残骸 = 损毁单位 M+C 成本 × rate（氘不成残骸，GDD-04）；MVP 回收=0。"""
    inv = {v: k for k, v in ars.ids.items()}
    total = 0.0
    for uid, n in losses.items():
        v = rs.get(f"SHIP.{inv[uid]}")
        total += (v["M"] + v["C"]) * n
    return total * rate


def run_group(name: str, att_comp: dict[str, int], def_comp: dict[str, int],
              att_tech: int, def_tech: int, seeds: int, ars: Arsenal, rs: Ruleset,
              branch: dict, defender_inventory_v: float = 0.0) -> dict:
    att_budget = sum(ars.cost_v(n) * c for n, c in att_comp.items())
    def_budget = sum(ars.cost_v(n) * c for n, c in def_comp.items())
    rows = []
    for seed in range(seeds):
        att = [fleet(1, 7, att_comp, ars, att_tech)]
        dfd = [fleet(2, 9, def_comp, ars, def_tech)]
        out = simulate(att, dfd, seed=seed)
        a_loss = losses_v(out["attacker_losses"], ars)
        d_loss = losses_v(out["defender_losses"], ars)
        annihilated = sum(out["defender_survivors"].values()) == 0
        # 掠夺（GDD-04 三重限制：合法库存 × 比例 × 存活舰队剩余货舱；货构成按分支比例）
        loot_v = 0.0
        if defender_inventory_v and sum(out["attacker_survivors"].values()) > 0:
            cap = sum(ars.base[inv]["cargo"] or 0 for inv_id, n in out["attacker_survivors"].items()
                      for inv in [k for k, v in ars.ids.items() if v == inv_id] for _ in range(n))
            loot_v = min(defender_inventory_v * branch["loot"]["rate"], cap)
        deb = debris_v(out["defender_losses"], rs, ars, branch["debris"]["rate"])
        rows.append({"seed": seed, "attacker_win": annihilated,
                     "attacker_loss_v": a_loss, "defender_loss_v": d_loss,
                     "loot_v": loot_v, "debris_v": deb,
                     "net_profit_v": loot_v - a_loss})  # 燃料 TBD 记 0，报告显式标注
    wins = sum(r["attacker_win"] for r in rows)
    a_losses = sorted(r["attacker_loss_v"] for r in rows)
    d_losses = sorted(r["defender_loss_v"] for r in rows)
    zero_loss = [r for r in rows if r["attacker_loss_v"] == 0]
    ratios = sorted(r["defender_loss_v"] / r["attacker_loss_v"] for r in rows if r["attacker_loss_v"] > 0)
    return {
        "group": name,
        "attacker_comp": att_comp, "defender_comp": def_comp,
        "attacker_tech": att_tech, "defender_tech": def_tech,
        "attacker_budget_v": att_budget, "defender_budget_v": def_budget,
        "budget_margin_v": abs(att_budget - def_budget),
        "seeds": seeds,
        "attacker_win_rate": round(wins / seeds, 4),
        "attacker_loss_v": {"mean": round(mean(a_losses), 0), "p10": round(percentile(a_losses, 0.1), 0),
                             "p50": round(median(a_losses), 0), "p90": round(percentile(a_losses, 0.9), 0)},
        "defender_loss_v": {"mean": round(mean(d_losses), 0), "p10": round(percentile(d_losses, 0.1), 0),
                             "p50": round(median(d_losses), 0), "p90": round(percentile(d_losses, 0.9), 0)},
        "exchange_ratio": {"mean": round(mean(ratios), 3) if ratios else None,
                            "p50": round(median(ratios), 3) if ratios else None,
                            "zero_loss_runs": len(zero_loss),
                            "note": "攻方零损失种子单列，不入交换比（06.4 防除零）"},
        "loot_v_mean": round(mean([r["loot_v"] for r in rows]), 0) if defender_inventory_v else None,
        "debris_v_mean": round(mean([r["debris_v"] for r in rows]), 0),
        "net_profit_v": {"mean": round(mean([r["net_profit_v"] for r in rows]), 0),
                          "p10": round(percentile(sorted(r["net_profit_v"] for r in rows), 0.1), 0),
                          "fuel_note": "燃料 TBD 记 0"},
    }


def main() -> None:
    branch = json.loads(BRANCH.read_text(encoding="utf-8"))
    rs = Ruleset()
    ars = Arsenal(rs, branch)
    seeds = branch["matrix"]["seeds_skeleton"]
    budget = branch["matrix"]["budget_v"]

    n_lf = int(budget // ars.cost_v("LIGHT"))   # 100
    n_hf = int(budget // ars.cost_v("HEAVY"))   # 40

    groups = [
        run_group("G1-mirror-LF", {"LIGHT": n_lf}, {"LIGHT": n_lf}, 0, 0, seeds, ars, rs, branch),
        run_group("G2-LF-vs-HF", {"LIGHT": n_lf}, {"HEAVY": n_hf}, 0, 0, seeds, ars, rs, branch),
        run_group("G3-HF-vs-LF", {"HEAVY": n_hf}, {"LIGHT": n_lf}, 0, 0, seeds, ars, rs, branch),
        run_group("G4-LF+6tech-vs-HF", {"LIGHT": n_lf}, {"HEAVY": n_hf}, 6, 0, seeds, ars, rs, branch),
        run_group("G5-HF+6tech-vs-LF", {"HEAVY": n_hf}, {"LIGHT": n_lf}, 6, 0, seeds, ars, rs, branch),
        run_group("G6-raid-smoke", {"LIGHT": 80, "SMALL_CARGO": 5}, {"HEAVY": 30}, 0, 0,
                  seeds, ars, rs, branch, defender_inventory_v=250000),
    ]

    report = {
        "run_id": f"sim03-skeleton-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"],
        "ruleset": rs.meta["ruleset_version"],
        "assumptions": BRANCH.name,
        "engine_equivalence": "sim/combat.py 与 web/src/game/battle.ts 同输入同输出（种子 42 等比对，140 单位 6 回合一致）",
        "gate_evidence": False,
        "gate_note": "科技口径实验、燃料记 0、rapidfire 空缺、种子数 200（正式 1000~10000）。不作 K-C01~03 证据。",
        "groups": groups,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}")
    print(f"{'组':<22} {'胜率':>6} {'攻损均/P90':>14} {'守损均':>9} {'交换比P50':>9} {'零损种子':>7} {'掠夺均':>8} {'残骸均':>8} {'净利均':>9}")
    for g in groups:
        xr = g["exchange_ratio"]["p50"]
        print(f"{g['group']:<22} {g['attacker_win_rate']:>6.2f} "
              f"{g['attacker_loss_v']['mean']:>8.0f}/{g['attacker_loss_v']['p90']:>5.0f} "
              f"{g['defender_loss_v']['mean']:>9.0f} "
              f"{(f'{xr:>9.2f}' if xr is not None else '       —')} "
              f"{g['exchange_ratio']['zero_loss_runs']:>7} "
              f"{(f'{g['loot_v_mean']:>8.0f}' if g['loot_v_mean'] is not None else '       —')} "
              f"{g['debris_v_mean']:>8.0f} {g['net_profit_v']['mean']:>9.0f}")


if __name__ == "__main__":
    main()
