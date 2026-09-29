#!/usr/bin/env python3
"""sim/sim02_formal.py — SIM-02 正式档（V1.3 §06.3）

**状态：备用脚本，CR 批准后出正式证据（gate_evidence 硬编 false）。**

与骨架的差异（§06.3 正式口径）：
1. 起点接续 SIM-01 真实末态（Normal 行为 168h 的等级+库存），不再用 500M/500C/0D 简化起点；
2. 支持 Day90 扩展切片（--days 90，§06.4 要求）；
3. 三策略（deep/expansion/balanced）与骨架一致，便于对照起点差异的影响。
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gate_evidence import gate_verdict  # noqa: E402
from rules.formulas import Ruleset  # noqa: E402
from sim import sim01, sim02  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def sim01_end_state(rs: Ruleset, branch1: dict) -> dict:
    """SIM-01 Normal 168h 末态 → SIM-02 起点（来源可溯）。"""
    r = sim01.run_one("Normal", rs, branch1)
    assert r["conservation"]["ok"]
    last = r["time_series"][-1]
    return {"inventory": last["inventory"], "levels": last["levels"],
            "source": f"sim01 Normal hour {last['hour']}",
            "asset_v_at_handoff": r["metrics"]["asset_value_v"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30, choices=(30, 90))
    ap.add_argument("--skeleton-start", action="store_true", help="对照组：用骨架简化起点")
    args = ap.parse_args()

    rs = Ruleset()
    branch1 = json.loads(sim02.BRANCH1.read_text(encoding="utf-8"))
    branch2 = json.loads(sim02.BRANCH2.read_text(encoding="utf-8"))

    start = None if args.skeleton_start else sim01_end_state(rs, branch1)
    runs = [sim02.run_strategy(s, rs, branch1, branch2, start=start, window_days=args.days)
            for s in ("deep", "expansion", "balanced")]

    approved, note = gate_verdict(rs.meta)
    report = {
        "run_id": f"sim02-formal-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-d{args.days}{'-skel' if args.skeleton_start else ''}",
        "core_version": rs.meta["core_version"], "ruleset": rs.meta["ruleset_version"],
        "window_days": args.days,
        "start": start or {"source": "骨架简化起点 500M/500C/0D（--skeleton-start 对照组）"},
        "gate_evidence": approved,
        "gate_note": note,
        "runs": runs,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}")
    print(f"起点: {report['start']['source']}" + ("" if not start else
          f"（交接时资产 {start['asset_v_at_handoff']:.0f} V）"))
    print(f"{'策略':<11} {'守恒':>4} {'首殖日':>7} {'行星数':>5} {'资产V':>11} {'科研投入':>9}")
    for r in runs:
        f = r["final"]
        print(f"{r['strategy']:<11} {'OK' if r['conservation']['ok'] else 'FAIL':>4} "
              f"{str(r['first_colony_day']):>7} {f['planets']:>5} {f['asset_value_v']:>11.0f} "
              f"{f['research_invested_v']:>9.0f}")


if __name__ == "__main__":
    main()
