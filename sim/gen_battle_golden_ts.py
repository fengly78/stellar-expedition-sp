#!/usr/bin/env python3
"""sim/gen_battle_golden_ts.py — 生成 web/src/game/battle.ts 的金值对拍语料。

sim/combat.py 是 battle.ts 的逐位等价移植（CR-20260921-001 指定 battle.ts 为 canonical）。
本脚本用 Python 侧跑 4 个预登记场景（默认种子=输入派生，与 TS 行为一致），
输出 web/src/game/__tests__/golden/battle_golden.json，供 vitest 逐字段精确比对：
每回合 hits/fullStrength/absorbedDamage/双方舰数 + 终局累计损失与幸存。

口径约定：Python 的 snake_case 字段 ↔ TS 的 camelCase 字段一一对应；
单位键为数值 unit_id（JSON 中转为字符串，TS 侧按 Record<number,...> 比较时转回）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from combat import simulate  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "web" / "src" / "game" / "__tests__" / "golden" / "battle_golden.json"

# 五舰属性 = web/src/game/objects.ts 当前口径（轻战/重战/小运/殖民舰/探针）
SC = {"unitId": 210, "attack": 0, "shield": 10, "hull": 1000, "rapidfire": {}}          # 小型运输舰
LF = {"unitId": 204, "attack": 50, "shield": 10, "hull": 400, "rapidfire": {}}          # 轻型战斗机
HF = {"unitId": 205, "attack": 150, "shield": 25, "hull": 1000, "rapidfire": {"210": 3}}  # 重型战斗机（rapidfire→小运3）
CS = {"unitId": 208, "attack": 1, "shield": 100, "hull": 3000, "rapidfire": {}}         # 殖民舰
SS = {"unitId": 202, "attack": 0, "shield": 0, "hull": 100, "rapidfire": {}}            # 探测卫星


def fleet(mid: int, owner: int, *specs_amounts) -> dict:
    units = {}
    for spec, amount in specs_amounts:
        units[str(spec["unitId"])] = {"spec": spec, "amount": amount}
    return {"fleet_mission_id": mid, "owner_id": owner, "units": units}


SCENARIOS = [
    {
        "name": "sc1_轻战碾压小运_6回合内清场",
        "attacker": [fleet(101, 7, (LF, 20))],
        "defender": [fleet(201, 9, (SC, 5))],
    },
    {
        "name": "sc2_均势轻战互殴_打满6回合",
        "attacker": [fleet(102, 7, (LF, 50))],
        "defender": [fleet(202, 9, (LF, 50))],
    },
    {
        "name": "sc3_重战混编打运输线_rapidfire触发",
        "attacker": [fleet(103, 7, (HF, 6), (LF, 10))],
        "defender": [fleet(203, 9, (SC, 30), (SS, 2))],
    },
    {
        "name": "sc4_零伤害护盾弹跳_殖民舰挨打",
        "attacker": [fleet(104, 7, (SS, 8))],
        "defender": [fleet(204, 9, (CS, 1))],
    },
    {
        "name": "sc5_多舰队双方_种子含双owner",
        "attacker": [fleet(105, 7, (LF, 12)), fleet(106, 8, (HF, 2))],
        "defender": [fleet(205, 9, (LF, 9)), fleet(206, 10, (CS, 1), (SS, 3))],
    },
]


def to_py_fleets(fleets: list[dict]) -> list[dict]:
    """dict 规格 → combat.UnitSpec 对象版（rapidfire 键转 int）。"""
    from combat import UnitSpec

    out = []
    for f in fleets:
        units = {}
        for uid, u in f["units"].items():
            s = u["spec"]
            units[int(uid)] = {
                "spec": UnitSpec(s["unitId"], s["attack"], s["shield"], s["hull"],
                                 {int(k): v for k, v in s["rapidfire"].items()}),
                "amount": u["amount"],
            }
        out.append({"fleet_mission_id": f["fleet_mission_id"], "owner_id": f["owner_id"], "units": units})
    return out


def main() -> int:
    cases = []
    for sc in SCENARIOS:
        out = simulate(to_py_fleets(sc["attacker"]), to_py_fleets(sc["defender"]))
        cases.append({
            "name": sc["name"],
            "input": {
                "attackerFleets": [
                    {"fleetMissionId": f["fleet_mission_id"], "ownerId": f["owner_id"], "units": f["units"]}
                    for f in sc["attacker"]
                ],
                "defenderFleets": [
                    {"fleetMissionId": f["fleet_mission_id"], "ownerId": f["owner_id"], "units": f["units"]}
                    for f in sc["defender"]
                ],
            },
            "expected": {
                "rounds": [
                    {
                        "hitsAttacker": r["hits_attacker"],
                        "hitsDefender": r["hits_defender"],
                        "fullStrengthAttacker": r["full_strength_attacker"],
                        "fullStrengthDefender": r["full_strength_defender"],
                        "absorbedDamageAttacker": r["absorbed_damage_attacker"],
                        "absorbedDamageDefender": r["absorbed_damage_defender"],
                        "attackerShips": r["attacker_ships"],
                        "defenderShips": r["defender_ships"],
                    }
                    for r in out["rounds"]
                ],
                "attackerLosses": out["attacker_losses"],
                "defenderLosses": out["defender_losses"],
                "attackerSurvivors": out["attacker_survivors"],
                "defenderSurvivors": out["defender_survivors"],
            },
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"cases": cases}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已生成 {OUT}（{len(cases)} 例）")
    for c in cases:
        e = c["expected"]
        print(f"  {c['name']}: rounds={len(e['rounds'])} atkLoss={e['attackerLosses']} defLoss={e['defenderLosses']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
