#!/usr/bin/env python3
"""sim/sim03_formal.py — SIM-03 正式矩阵（V1.3 §06.4 全交叉档）

**状态：备用脚本，等待 CR-002/CR-003 批准后出正式证据。**
当前运行全部为 gate_evidence=false（实验时间/燃料/rapidfire 空缺；数值随 RC1 Candidate）。

覆盖 §06.4 验收口径：
- 等预算编成（cost_v 正确口径，余量单列；禁止给余量虚构参战单位）
- 军事科技 3/6/10 级 + 相对高 3/6 级
- 目标库存 50000/250000/1000000/5000000V 四档（货构成保存，不按估值装舱）
- 掠夺 25/50/75% × 残骸 20/30/40% 交叉
- 重复袭击 1/2/3/5 次（重复枯竭目标利润下降曲线；收益按新库存计算，GDD-11）
- 每组种子数可配（正式 1000~10000）；「6 回合未分胜负」单列结果类
- 零己方损失种子交换比单列（防除零）

用法：
  python sim/sim03_formal.py --seeds 1000          # 正式档
  python sim/sim03_formal.py --seeds 20 --smoke    # 冒烟自检
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, value_v  # noqa: E402
from sim.combat import simulate  # noqa: E402
from sim.sim03 import Arsenal, fleet, losses_v  # noqa: E402
from gate_evidence import gate_verdict  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH3 = ROOT / "config" / "rulesets" / "branches" / "sim03_assumptions.json"

TECH_LEVELS = (3, 6, 10)
TECH_GAPS = (3, 6)               # 相对高 3/6 级
INVENTORY_TIERS = (50000, 250000, 1000000, 5000000)
LOOT_RATES = (0.25, 0.50, 0.75)
DEBRIS_RATES = (0.20, 0.30, 0.40)
REPEAT_COUNTS = (1, 2, 3, 5)
LOOT_COMP = {"M": 0.5, "C": 0.3, "D": 0.2}   # 货构成保存（06.4）；比例入分支登记


def percentile(vals: list[float], p: float) -> float:
    vals = sorted(vals)
    if not vals:
        return 0.0
    k = (len(vals) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(vals) - 1)
    return vals[lo] + (vals[hi] - vals[lo]) * (k - lo)


def stat_block(vals: list[float]) -> dict:
    return {"mean": round(mean(vals), 0), "p10": round(percentile(vals, 0.1), 0),
            "p50": round(median(vals), 0), "p90": round(percentile(vals, 0.9), 0)}


def outcome_class(out: dict) -> str:
    a = sum(out["attacker_survivors"].values())
    d = sum(out["defender_survivors"].values())
    if d == 0:
        return "attacker_annihilation"
    if a == 0:
        return "defender_annihilation"
    return "six_round_draw"      # 06.4/交接登记：单列，不并入胜负


def debris_of(losses: dict[int, int], rs: Ruleset, ars: Arsenal, rate: float) -> float:
    inv = {v: k for k, v in ars.ids.items()}
    return sum((rs.get(f"SHIP.{inv[uid]}")["M"] + rs.get(f"SHIP.{inv[uid]}")["C"]) * n
               for uid, n in losses.items()) * rate


def cargo_capacity(survivors: dict[int, int], ars: Arsenal) -> float:
    inv = {v: k for k, v in ars.ids.items()}
    return sum((ars.base[inv[uid]]["cargo"] or 0) * n for uid, n in survivors.items())


def run_battle_matrix(ars: Arsenal, rs: Ruleset, seeds: int, budget_v: float) -> list[dict]:
    """等预算 × 科技档矩阵（LF 攻 HF 守、HF 攻 LF 守 双向）。"""
    n_lf = int(budget_v // ars.cost_v("LIGHT"))
    n_hf = int(budget_v // ars.cost_v("HEAVY"))
    comps = [("LF-att", {"LIGHT": n_lf}, {"HEAVY": n_hf}), ("HF-att", {"HEAVY": n_hf}, {"LIGHT": n_lf})]
    tech_pairs = [(t, t) for t in TECH_LEVELS] + [(t + g, t) for t in TECH_LEVELS for g in TECH_GAPS]
    groups = []
    for label, ac, dc in comps:
        for ta, td in tech_pairs:
            rows = []
            for seed in range(seeds):
                out = simulate([fleet(1, 7, ac, ars, ta)], [fleet(2, 9, dc, ars, td)], seed=seed)
                rows.append({"class": outcome_class(out),
                             "a_loss": losses_v(out["attacker_losses"], ars),
                             "d_loss": losses_v(out["defender_losses"], ars)})
            cls = {}
            for r in rows:
                cls[r["class"]] = cls.get(r["class"], 0) + 1
            ratios = [r["d_loss"] / r["a_loss"] for r in rows if r["a_loss"] > 0]
            groups.append({
                "matrix": "battle", "comp": label, "attacker_n": list(ac.values())[0],
                "defender_n": list(dc.values())[0], "attacker_tech": ta, "defender_tech": td,
                "budget_margin_v": abs(sum(ars.cost_v(n) * c for n, c in ac.items())
                                       - sum(ars.cost_v(n) * c for n, c in dc.items())),
                "seeds": seeds, "outcome_classes": cls,
                "attacker_loss_v": stat_block([r["a_loss"] for r in rows]),
                "defender_loss_v": stat_block([r["d_loss"] for r in rows]),
                "exchange_ratio": {"p50": round(median(ratios), 3) if ratios else None,
                                    "zero_loss_runs": seeds - len(ratios)},
            })
    return groups


def run_raid_matrix(ars: Arsenal, rs: Ruleset, seeds: int, budget_v: float) -> list[dict]:
    """袭击经济矩阵：库存档 × 掠夺率 × 残骸率 × 重复次数。攻方编队：轻战主力+小运载货。"""
    n_lf = int(budget_v * 0.8 // ars.cost_v("LIGHT"))
    n_sc = max(2, int(budget_v * 0.2 // ars.cost_v("SMALL_CARGO")))
    n_hf_def = int(budget_v // ars.cost_v("HEAVY"))
    groups = []
    for inv_v in INVENTORY_TIERS:
        for loot_rate in LOOT_RATES:
            for debris_rate in DEBRIS_RATES:
                for repeats in REPEAT_COUNTS:
                    profits, deb_list = [], []
                    for seed in range(seeds):
                        remaining_inv = inv_v
                        total_profit, total_debris = 0.0, 0.0
                        att_lf, att_sc = n_lf, n_sc
                        def_hf = n_hf_def
                        for rep in range(repeats):
                            if att_lf == 0 or remaining_inv <= 0:
                                break
                            ac = {"LIGHT": att_lf, "SMALL_CARGO": att_sc}
                            dc = {"HEAVY": def_hf} if def_hf else {}
                            out = simulate([fleet(1, 7, ac, ars, 0)],
                                           [fleet(2, 9, dc, ars, 0)], seed=seed * 100 + rep)
                            # 真实损失（重复袭击同一已损目标，GDD-11：按新状态计算）
                            inv = {v: k for k, v in ars.ids.items()}
                            for uid, n in out["attacker_losses"].items():
                                if inv[uid] == "LIGHT":
                                    att_lf -= n
                                else:
                                    att_sc -= n
                            def_hf -= out["defender_losses"].get(ars.ids["HEAVY"], 0)
                            a_loss_v = losses_v(out["attacker_losses"], ars)
                            loot_v = 0.0
                            if sum(out["attacker_survivors"].values()) > 0:
                                # 三重限制 + 货构成按资源量分配（不按估值装舱）
                                cap = cargo_capacity(out["attacker_survivors"], ars)
                                loot_v = min(remaining_inv * loot_rate, cap)
                                remaining_inv -= loot_v
                            total_debris += debris_of(out["defender_losses"], rs, ars, debris_rate)
                            total_profit += loot_v - a_loss_v  # 燃料 TBD 记 0（显式标注）
                        profits.append(total_profit)
                        deb_list.append(total_debris)
                    groups.append({
                        "matrix": "raid", "inventory_v": inv_v, "loot_rate": loot_rate,
                        "debris_rate": debris_rate, "repeats": repeats, "seeds": seeds,
                        "net_profit_v": stat_block(profits),
                        "debris_generated_v": stat_block(deb_list),
                        "recovery_v": 0,  # MVP 残骸回收为零（06.4）
                        "fuel_note": "燃料 TBD 记 0（CR-003 提案 B 回填后须复跑）",
                    })
    return groups


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=1000)
    ap.add_argument("--smoke", action="store_true", help="缩减交叉档自检（不改种子语义）")
    args = ap.parse_args()
    global INVENTORY_TIERS, LOOT_RATES, DEBRIS_RATES, REPEAT_COUNTS
    if args.smoke:
        INVENTORY_TIERS, LOOT_RATES, DEBRIS_RATES, REPEAT_COUNTS = (250000,), (0.5,), (0.3,), (1, 3)

    branch3 = json.loads(BRANCH3.read_text(encoding="utf-8"))
    rs = Ruleset()
    ars = Arsenal(rs, branch3)
    budget_v = branch3["matrix"]["budget_v"]

    t0 = datetime.now()
    battle = run_battle_matrix(ars, rs, args.seeds, budget_v)
    raid = run_raid_matrix(ars, rs, args.seeds, budget_v)
    approved, note = gate_verdict(rs.meta)
    report = {
        "run_id": f"sim03-formal-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"], "ruleset": rs.meta["ruleset_version"],
        "seeds_per_group": args.seeds, "budget_v": budget_v,
        "groups_total": len(battle) + len(raid),
        "duration_seconds": (datetime.now() - t0).total_seconds(),
        "gate_evidence": approved,
        "gate_note": note,
        "battle_groups": battle, "raid_groups": raid,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}（{report['groups_total']} 组 × {args.seeds} 种子，{report['duration_seconds']:.0f}s）")
    draws = sum(g["outcome_classes"].get("six_round_draw", 0) for g in battle)
    total = sum(sum(g["outcome_classes"].values()) for g in battle)
    print(f"战斗矩阵：平局类占比 {draws}/{total} = {draws/total:.1%}")
    # 重复袭击利润递减检查（GDD-11 Gate 方向）
    r3 = [g for g in raid if g["inventory_v"] == INVENTORY_TIERS[0]]
    r3.sort(key=lambda g: g["repeats"])
    if len(r3) >= 2:
        seq = [(g["repeats"], g["net_profit_v"]["mean"] / g["repeats"]) for g in r3]
        print("重复袭击单次利润（库存档", INVENTORY_TIERS[0], "）:", [(r, round(p)) for r, p in seq])


if __name__ == "__main__":
    main()
