#!/usr/bin/env python3
"""sim/gen_combat_corpus.py — Rust Classic 战斗模块等价性测试黄金语料生成器

语料由 sim/combat.py（已与 canonical battle.ts 逐位等价验证，见 Golden-000）生成。
每条用例：输入（双方舰队+显式种子）→ 期望输出（回合数/存活/损失/逐回合命中）。
Rust 模块验收 = 对本语料全部用例输出字节级一致（字段顺序无关，数值全等）。

覆盖：G-000 TS 交叉验证基准 / G-001 弹跳规则（伤害<1%护盾）/ G-002 结构比爆炸 /
G-003 单方全灭提前结束 / G-004 六回合互残平局 / G-005 空防御舰队 / G-006 多舰队混编 /
G-007 大规模压力（400 单位）/ G-008~010 固定种子随机编成。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sim.combat import UnitSpec, simulate  # noqa: E402

OUT = Path(__file__).resolve().parent / "combat_corpus"


def spec(uid, a, s, h, rf=None):
    return UnitSpec(uid, a, s, h, rf)


def fleet(mid, owner, units: dict[int, tuple[UnitSpec, int]]):
    return {"fleet_mission_id": mid, "owner_id": owner,
            "units": {uid: {"spec": s, "amount": n} for uid, (s, n) in units.items()}}


# RC1 Candidate 属性（A/S/H）：SCOUT 1/1/100、SMALL_CARGO 5/10/500、LIGHT 50/10/400、HEAVY 150/25/1200
SCOUT, CARGO, LIGHT, HEAVY = (spec(4, 1, 1, 100), spec(3, 5, 10, 500),
                              spec(1, 50, 10, 400), spec(2, 150, 25, 1200))

CASES = [
    ("G-000-ts-cross-check", "battle.ts 交叉验证基准（node 实测一致）",
     [fleet(1, 7, {1: (LIGHT, 100)})], [fleet(2, 9, {2: (HEAVY, 40)})], None),
    ("G-001-bounce", "弹跳：SCOUT 攻击 1 < 1%×HEAVY 护盾 25 → 零伤害",
     [fleet(1, 7, {4: (SCOUT, 50)})], [fleet(2, 9, {2: (HEAVY, 5)})], 1001),
    ("G-002-explosion", "结构比 <0.7 爆炸判定覆盖（高攻对低结构）",
     [fleet(1, 7, {2: (HEAVY, 10)})], [fleet(2, 9, {4: (SCOUT, 60)})], 1002),
    ("G-003-annihilation", "单方全灭提前结束",
     [fleet(1, 7, {2: (HEAVY, 30)})], [fleet(2, 9, {1: (LIGHT, 5)})], 1003),
    ("G-004-six-round-draw", "六回合互残平局（双方都未全灭）",
     [fleet(1, 7, {1: (LIGHT, 100)})], [fleet(2, 9, {1: (LIGHT, 100)})], 1004),
    ("G-005-empty-defender", "空防御舰队 → 零回合",
     [fleet(1, 7, {1: (LIGHT, 10)})], [fleet(2, 9, {})], 1005),
    ("G-006-mixed-fleets", "多舰队混编（攻方两支舰队、混舰种）",
     [fleet(1, 7, {1: (LIGHT, 40)}), fleet(11, 8, {3: (CARGO, 5), 2: (HEAVY, 3)})],
     [fleet(2, 9, {1: (LIGHT, 25), 2: (HEAVY, 8)})], 1006),
    ("G-007-stress", "400 单位压力用例",
     [fleet(1, 7, {1: (LIGHT, 250)})], [fleet(2, 9, {2: (HEAVY, 150)})], 1007),
    ("G-008-seed-a", "固定种子随机编成 A",
     [fleet(1, 7, {1: (LIGHT, 60), 3: (CARGO, 4)})], [fleet(2, 9, {2: (HEAVY, 20)})], 20260921),
    ("G-009-seed-b", "固定种子随机编成 B",
     [fleet(1, 7, {2: (HEAVY, 15)})], [fleet(2, 9, {1: (LIGHT, 80), 4: (SCOUT, 10)})], 424242),
    ("G-010-seed-c", "固定种子随机编成 C（侦察混入攻方）",
     [fleet(1, 7, {1: (LIGHT, 30), 4: (SCOUT, 3)})], [fleet(2, 9, {1: (LIGHT, 30)})], 777),
]


def normalize(out: dict) -> dict:
    """键排序 + int 键转字符串，保证 JSON 可比。"""
    def nd(d):
        return {str(k): d[k] for k in sorted(d)} if isinstance(d, dict) else d
    return {
        "rounds": [{k: (nd(r[k]) if isinstance(r[k], dict) else r[k])
                    for k in ("attacker_ships", "defender_ships", "hits_attacker", "hits_defender",
                              "full_strength_attacker", "full_strength_defender",
                              "absorbed_damage_attacker", "absorbed_damage_defender")}
                   for r in out["rounds"]],
        "attacker_losses": nd(out["attacker_losses"]),
        "defender_losses": nd(out["defender_losses"]),
        "attacker_survivors": nd(out["attacker_survivors"]),
        "defender_survivors": nd(out["defender_survivors"]),
    }


def spec_json(s: UnitSpec) -> dict:
    return {"unit_id": s.unit_id, "attack": s.attack, "shield": s.shield,
            "hull": s.hull, "rapidfire": {str(k): v for k, v in s.rapidfire.items()}}


def main() -> None:
    OUT.mkdir(exist_ok=True)
    manifest = []
    for name, desc, att, dfd, seed in CASES:
        out = simulate(att, dfd, seed=seed)
        doc = {
            "case": name,
            "description": desc,
            "seed": seed,          # null = TS 兼容派生种子
            "input": {
                "attacker_fleets": [
                    {"fleet_mission_id": f["fleet_mission_id"], "owner_id": f["owner_id"],
                     "units": {str(uid): {"spec": spec_json(u["spec"]), "amount": u["amount"]}
                               for uid, u in f["units"].items()}}
                    for f in att],
                "defender_fleets": [
                    {"fleet_mission_id": f["fleet_mission_id"], "owner_id": f["owner_id"],
                     "units": {str(uid): {"spec": spec_json(u["spec"]), "amount": u["amount"]}
                               for uid, u in f["units"].items()}}
                    for f in dfd],
            },
            "expected": normalize(out),
        }
        (OUT / f"{name}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2),
                                          encoding="utf-8")
        manifest.append({"case": name, "seed": seed,
                         "rounds": len(out["rounds"]),
                         "attacker_survivors": sum(out["attacker_survivors"].values()),
                         "defender_survivors": sum(out["defender_survivors"].values())})
    (OUT / "manifest.json").write_text(json.dumps({
        "corpus_version": "1.0",
        "generated_by": "sim/combat.py（与 battle.ts 逐位等价验证：G-000 node 实测一致）",
        "ruleset_ref": "balance_rc1.json SHIP.* A/S/H（Candidate）",
        "cases": manifest,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    for m in manifest:
        print(f"{m['case']:<24} rounds={m['rounds']} 攻存={m['attacker_survivors']} 守存={m['defender_survivors']}")
    print(f"语料目录: {OUT}")


if __name__ == "__main__":
    main()
