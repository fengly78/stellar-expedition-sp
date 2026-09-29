#!/usr/bin/env python3
"""sim/sim04_formal.py — SIM-04 正式矩阵（V1.3 §06.5 全档）

**状态：备用脚本，等待 CR 批准后出正式证据（gate_evidence 硬编 false）。**

§06.5 口径：3 人格 × 3 情报质量 × 4 环境 = 36 组，每组多固定种子，30/60/90 天。
零作弊（无免费补舰/无限燃料/瞬移/隐藏加成/全图实时情报）；初始化 = SIM-02 Day14 模板记账。
预登记（06.5 要求）：种子数、生存判据、可接受压力区间在报告头声明，先于结果。

扩展相对骨架：第三档情报（perfect ±0%，作噪声基线）；补齐 4 环境
（10 文明低活跃 / 30 文明混合 / 富集机会 / 强军事反击——富集≠免费市场，仅弱防高库存）。
回收收入恒 0（无合法回收任务，06.5）；首轮固定基地不开放殖民。
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset  # noqa: E402
from gate_evidence import gate_verdict  # noqa: E402
import sim.sim04 as s4  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# 正式档扩展（运行时注册进 sim04 的字典，sim04.py 本体零改动）
s4.INTEL_QUALITY.update({"perfect": 0.0})   # 噪声基线档
s4.ENVIRONMENTS.update({
    "mixed_30": {"strength": (0.2, 1.5), "inventory": (150000, 700000), "rebuild_per_day": 0.02,
                  "_n_targets": 30},
    "rich_opportunity": {"strength": (0.05, 0.4), "inventory": (400000, 1200000), "rebuild_per_day": 0.0},
})
N_TARGETS = {"mixed_30": 30}   # 其余环境默认 10

PRE_REGISTRATION = {
    "seeds_per_group": 10,
    "windows_days": [30, 60, 90],
    "survival_criterion": "end_asset_v > 0 且期末资产 ≥ 初始库存的 50%（压力下限）",
    "pressure_interval": "期末资产/初始库存 ∈ [0.5, ∞)；低于 0.5 判为环境压力超标，回到 SIM-03 查战争经济（06.5 纪律）",
    "k_a_gates": {
        "K-A01": "system_injection_v 恒 0（资产来源全部可解释）",
        "K-A02": "保护违规恒 0（骨架环境不含受保护目标，正式轮须显式建模 N0~N3 并验证）",
        "K-A03": "战损真实存在 + 差情报改变风险分布（loss 随情报档单调性检查）",
    },
    "declared_before_run": True,
}


def raid_profitability_by_intel(runs: list[dict]) -> dict:
    """K-A03 检查：同人格同环境下，情报越差战损应越高（单调性）。"""
    out = {}
    for r in runs:
        key = (r["environment"], r["personality"])
        out.setdefault(key, {})[r["intel"]] = r["combat_loss_v"]
    monotone = 0
    total = 0
    for key, byq in out.items():
        if all(q in byq for q in ("perfect", "good", "poor")):
            total += 1
            if byq["perfect"] <= byq["good"] <= byq["poor"]:
                monotone += 1
    return {"groups_checked": total, "monotone_groups": monotone,
            "ratio": round(monotone / total, 3) if total else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=PRE_REGISTRATION["seeds_per_group"])
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--windows", type=str, default=None,
                    help="逗号分隔天数窗，如 30 或 30,60,90（缺省全档；长窗运行时间长，建议分片）")
    args = ap.parse_args()

    rs = Ruleset()
    import sim.sim03 as s3
    branch3 = json.loads((ROOT / "config/rulesets/branches/sim03_assumptions.json").read_text(encoding="utf-8"))
    ars = s3.Arsenal(rs, branch3)
    ars.rs = rs
    template = s4.make_template(rs)
    sm_ok = s4.selftest_state_machine(rs, ars, template)

    envs = list(s4.ENVIRONMENTS)          # low_activity, military_response, mixed_30, rich_opportunity
    pers = list(s4.PERSONALITIES)
    intel = ["perfect", "good", "poor"]
    windows = [int(w) for w in args.windows.split(",")] if args.windows else ([30] if args.smoke else [30, 60, 90])
    if args.smoke:
        envs, pers, intel = ["low_activity", "military_response"], ["balanced"], ["good", "poor"]

    runs = []
    for days in windows:
        for env_name in envs:
            for p in pers:
                for iq in intel:
                    for seed in range(args.seeds):
                        r = s4.run_one(rs, ars, template, p, iq, env_name, seed, days=days)
                        r["window_days"] = days
                        runs.append(r)

    t_end = datetime.now(timezone.utc)
    inj_max = max(r["system_injection_v"] for r in runs)
    survival = sum(1 for r in runs if r["end_asset_v"] > 0
                   and r["end_asset_v"] >= 0.5 * r["start_inventory_v"])
    approved, approved_note = gate_verdict(rs.meta)
    report = {
        "run_id": f"sim04-formal-{t_end.strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"], "ruleset": rs.meta["ruleset_version"],
        "init_manifest": template,
        "pre_registration": PRE_REGISTRATION,
        "state_machine_selftest": sm_ok,
        "gate_evidence": approved,
        "gate_note": approved_note + "（边界仍登记：燃料记 0；轻战货舱 50；环境为合成环境，K-A02 只能记 0 违规的下界声明。）",
        "groups": len(list({(r["window_days"], r["environment"], r["personality"], r["intel"]) for r in runs})),
        "runs_total": len(runs),
        "k_a01_injection_max": inj_max,
        "survival": {"passed": survival, "total": len(runs),
                      "criterion": PRE_REGISTRATION["survival_criterion"]},
        "k_a03_intel_monotonicity": raid_profitability_by_intel(runs),
        "runs": runs,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}")
    print(f"{report['groups']} 组 × {args.seeds} 种子 = {len(runs)} runs；状态机自检={'PASS' if sm_ok else 'FAIL'}")
    print(f"K-A01 注入上限={inj_max}；存活（含压力下限）{survival}/{len(runs)}；"
          f"K-A03 情报单调性 {report['k_a03_intel_monotonicity']}")


if __name__ == "__main__":
    main()
