#!/usr/bin/env python3
"""sim/combat.py — Classic 战斗引擎 Python 移植（参照 web/src/game/battle.ts，CR-20260921-001 指定其为 canonical 实现）

逐行对齐 TS 版本：mulberry32 PRNG、hash32 种子派生、弹跳规则（damage < 1% 基础护盾）、
护盾/装甲吸收、结构比 <0.7 爆炸判定、rapidfire 续射、6 回合上限、回合内沉船仍可被击中、
回合末清场并重置护盾。目的是为 Rust Classic 模块（§13）准备等价性测试参照语料。

扩展点（TS 版没有）：simulate(seed=None) 允许外部种子覆盖，用于 SIM-03 种子矩阵；
seed=None 时保持 TS 行为（种子由 BattleInput 派生，同输入必同结果）。
"""
from __future__ import annotations

MASK = 0xFFFFFFFF


def mulberry32(seed: int):
    """对齐 web/src/game/prng.ts 的 mulberry32。内部全程按 uint32 位模式运算。"""
    a = seed & MASK

    def rng() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & MASK
        t = ((a ^ (a >> 15)) * (1 | a)) & MASK            # Math.imul 低 32 位
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & MASK)) & MASK) ^ t
        t &= MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    return rng


def hash32(*nums: int) -> int:
    """对齐 prng.ts 的 hash32（FNV-1a 变体，int32 语义）。"""
    h = 2166136261
    for n in nums:
        h = ((h ^ (n & MASK)) * 16777619) & MASK
    return h


class UnitSpec:
    def __init__(self, unit_id: int, attack: float, shield: float, hull: float,
                 rapidfire: dict[int, int] | None = None):
        self.unit_id = unit_id
        self.attack = attack
        self.shield = shield
        self.hull = hull
        self.rapidfire = rapidfire or {}


class Unit:
    __slots__ = ("spec", "fleet_id", "owner_id", "shield", "hull")

    def __init__(self, spec: UnitSpec, fleet_id: int, owner_id: int):
        self.spec = spec
        self.fleet_id = fleet_id
        self.owner_id = owner_id
        self.shield = spec.shield
        self.hull = spec.hull


def _expand(fleets: list[dict]) -> list[Unit]:
    units: list[Unit] = []
    for f in fleets:
        # JS 对象整数键按升序数值迭代（canonical battle.ts 行为），必须排序对齐，禁止用插入序
        for uid in sorted(f["units"]):
            u = f["units"][uid]
            for _ in range(u["amount"]):
                units.append(Unit(u["spec"], f["fleet_mission_id"], f["owner_id"]))
    return units


def _combat_phase(rng, attackers: list[Unit], defenders: list[Unit], rnd: dict, attacker_side: bool) -> None:
    for a in attackers:
        spec = a.spec
        while True:
            if not defenders:
                return
            target = defenders[int(rng() * len(defenders))]

            damage = spec.attack
            if damage < 0.01 * target.spec.shield:      # 弹跳规则（基础护盾口径）
                break

            absorbed = 0.0
            if target.shield > 0:
                if damage <= target.shield:
                    absorbed = damage
                    target.shield -= damage
                else:
                    absorbed = target.shield
                    target.hull -= damage - target.shield
                    target.shield = 0
            else:
                target.hull -= damage

            ratio = target.hull / target.spec.hull
            if ratio < 0.7 and rng() < 1 - ratio:        # 结构比爆炸判定
                target.hull = 0
                target.shield = 0

            if attacker_side:
                rnd["hits_attacker"] += 1
                rnd["full_strength_attacker"] += damage
                rnd["absorbed_damage_defender"] += absorbed
            else:
                rnd["hits_defender"] += 1
                rnd["full_strength_defender"] += damage
                rnd["absorbed_damage_attacker"] += absorbed

            rf = spec.rapidfire.get(target.spec.unit_id)
            if not rf:
                break
            if rng() < 1 - 1 / rf:
                continue
            break


def _battle_seed(attacker_fleets: list[dict], defender_fleets: list[dict]) -> int:
    # JS 对象整数键按升序数值迭代（canonical battle.ts 行为），种子派生同样必须排序对齐
    flat: list[int] = []
    for f in attacker_fleets:
        flat.append(f["owner_id"])
        for uid in sorted(f["units"]):
            flat.extend((uid, f["units"][uid]["amount"]))
    flat.append(0xDEADBEEF)
    for f in defender_fleets:
        flat.append(f["owner_id"])
        for uid in sorted(f["units"]):
            flat.extend((uid, f["units"][uid]["amount"]))
    return hash32(*flat)


def _cleanup(losses: dict[int, int], units: list[Unit]) -> list[Unit]:
    kept: list[Unit] = []
    for u in units:
        if u.hull <= 0:
            losses[u.spec.unit_id] = losses.get(u.spec.unit_id, 0) + 1
            continue
        u.shield = u.spec.shield                          # 回合末护盾重置
        kept.append(u)
    return kept


def _counts(units: list[Unit]) -> dict[int, int]:
    out: dict[int, int] = {}
    for u in units:
        out[u.spec.unit_id] = out.get(u.spec.unit_id, 0) + 1
    return out


def simulate(attacker_fleets: list[dict], defender_fleets: list[dict],
             seed: int | None = None, max_rounds: int = 6) -> dict:
    """返回 {"rounds": [...], "attacker_losses": {uid:n}, "defender_losses": {...},
             "attacker_survivors": {...}, "defender_survivors": {...}}
    seed=None 时与 TS 版行为一致（种子由输入派生）。
    """
    attackers = _expand(attacker_fleets)
    defenders = _expand(defender_fleets)
    rng = mulberry32(_battle_seed(attacker_fleets, defender_fleets) if seed is None else seed)

    total_attacker_losses: dict[int, int] = {}
    total_defender_losses: dict[int, int] = {}
    rounds: list[dict] = []

    for _ in range(max_rounds):
        if not attackers or not defenders:
            break
        rnd = {"hits_attacker": 0, "hits_defender": 0,
               "full_strength_attacker": 0.0, "full_strength_defender": 0.0,
               "absorbed_damage_attacker": 0.0, "absorbed_damage_defender": 0.0}
        _combat_phase(rng, attackers, defenders, rnd, True)
        _combat_phase(rng, defenders, attackers, rnd, False)
        attackers = _cleanup(total_attacker_losses, attackers)
        defenders = _cleanup(total_defender_losses, defenders)
        rnd["attacker_ships"] = _counts(attackers)
        rnd["defender_ships"] = _counts(defenders)
        rounds.append(rnd)

    return {
        "rounds": rounds,
        "attacker_losses": total_attacker_losses,
        "defender_losses": total_defender_losses,
        "attacker_survivors": _counts(attackers),
        "defender_survivors": _counts(defenders),
    }
