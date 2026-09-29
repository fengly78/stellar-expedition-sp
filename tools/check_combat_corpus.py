#!/usr/bin/env python3
"""tools/check_combat_corpus.py — 战斗语料 Python 侧校验器。

用 sim/combat.py 逐例跑 sim/combat_corpus/G-*.json，与期望输出深比较
（数值按 f64 精确比、对象键序无关、数组保序）。退出码 1 = 有失败。
Rust 侧的对应物是 game-server/combat/src/bin/corpus-check.rs（cargo 就位后跑）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sim"))
from combat import UnitSpec, simulate  # noqa: E402


def to_py_fleets(fleets: list[dict]) -> list[dict]:
    out = []
    for f in fleets:
        units = {}
        for uid, u in f["units"].items():
            s = u["spec"]
            units[int(uid)] = {
                "spec": UnitSpec(s["unit_id"], s["attack"], s["shield"], s["hull"],
                                 {int(k): v for k, v in s.get("rapidfire", {}).items()}),
                "amount": u["amount"],
            }
        out.append({"fleet_mission_id": f["fleet_mission_id"], "owner_id": f["owner_id"], "units": units})
    return out


def deep_eq(a, b) -> bool:
    """键序无关、数组保序、数字 f64 精确比（int 50 与 50.0 视为同值）。"""
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(deep_eq(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(deep_eq(x, y) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b


def main() -> int:
    fails = 0
    for path in sorted((ROOT / "sim" / "combat_corpus").glob("G-*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        out = simulate(to_py_fleets(d["input"]["attacker_fleets"]),
                       to_py_fleets(d["input"]["defender_fleets"]),
                       seed=d.get("seed"))
        exp = d["expected"]
        # JSON 语义对齐：dict 整数键 → 字符串键（语料为 JSON 格式）
        out = json.loads(json.dumps(out))
        ok = True
        for key in ("attacker_losses", "defender_losses", "attacker_survivors", "defender_survivors", "rounds"):
            if key not in exp:
                continue
            if not deep_eq(out[key], exp[key]):
                ok = False
        print(("PASS" if ok else "FAIL"), d["case"])
        fails += not ok
    print(f"语料校验：{'全部通过' if fails == 0 else f'{fails} 例失败'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
