#!/usr/bin/env python3
"""sim/sim02.py — SIM-02 多行星经济骨架（V1.3 §06.3）

纵切范围：文明级单研究队列（02.2）、造船（订单整批扣费、完成交付）、
殖民（F-06 容量、抵达建星、消耗殖民舰、START-A 新星零建筑仅携带货物）、
本人行星间运输（只改变位置不改变 Owner，GDD-07）、任务槽（F-06：2+计算机等级）。

三策略对比（§06.3）：deep 深耕 / expansion 快速扩张 / balanced 均衡。
时间、航时、燃料、前置树全部来自实验分支（sim02_assumptions.json），
gate_evidence=false，结果只证明机制可运行。
"""
from __future__ import annotations

import heapq
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, colony_cap, upgrade_cost, value_v  # noqa: E402
from sim.engine import Engine, Planet  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH1 = ROOT / "config" / "rulesets" / "branches" / "sim01_time_assumptions.json"
BRANCH2 = ROOT / "config" / "rulesets" / "branches" / "sim02_assumptions.json"

BUILD_KEYS = {"METAL_MINE": "BUILD.METAL_MINE", "CRYSTAL_MINE": "BUILD.CRYSTAL_MINE",
              "DEUT_SYNTH": "BUILD.DEUT_SYNTH", "SOLAR": "BUILD.SOLAR",
              "M_STORAGE": "BUILD.M_STORAGE", "C_STORAGE": "BUILD.C_STORAGE",
              "D_STORAGE": "BUILD.D_STORAGE", "FUSION": "BUILD.FUSION",
              "LAB": "BUILD.LAB", "SHIPYARD": "BUILD.SHIPYARD"}
STORAGE_OF_RES = {"M": "M_STORAGE", "C": "C_STORAGE", "D": "D_STORAGE"}
TECH_KEYS = {"ENERGY": "TECH.ENERGY", "IMPULSE": "TECH.IMPULSE",
             "ESPIONAGE": "TECH.ESPIONAGE", "ASTRO": "TECH.ASTRO", "COMPUTER": "TECH.COMPUTER"}


def vv(cost: dict) -> float:
    return value_v(cost.get("M", 0), cost.get("C", 0), cost.get("D", 0))


class Civ:
    """文明级状态：科技、单研究队列、任务槽、投资台账（§06.1 资产口径）。"""

    def __init__(self):
        self.techs = {"ENERGY": 0, "IMPULSE": 0, "ESPIONAGE": 0, "ASTRO": 0, "COMPUTER": 0}
        self.research_active = None     # {"tech","level","planet_idx"}
        self.missions_flying = 0
        self.research_invested = 0.0
        self.ships_built_value = 0.0
        self.colony_ships_consumed_value = 0.0
        self.fuel_consumed_value = 0.0

    def slots(self) -> int:
        return 2 + self.techs["COMPUTER"]  # F-06


class Sim2Engine(Engine):
    def handle(self, ev) -> None:
        p = ev.payload.get("planet_idx")
        if ev.kind == "complete_building":
            planet = self.planets[p]
            planet.levels[ev.payload["building"]] += 1
            self.log.append({"t": ev.at, "event": "complete", "planet": p,
                             "building": ev.payload["building"], "level": planet.levels[ev.payload["building"]]})
        elif ev.kind in ("_end", "_record", "_bot"):
            pass
        else:
            raise ValueError(f"未知事件: {ev.kind}")


class Sim2Bot:
    """Normal 节奏（4h 检查/8h 睡眠）管理整个文明。策略差异仅在科研/殖民决策。"""

    PENDING_MAX = 3

    def __init__(self, eng: Sim2Engine, civ: Civ, branch1: dict, branch2: dict, strategy: str):
        self.eng = eng
        self.civ = civ
        self.tm1 = branch1["time_model"]
        self.tm2 = branch2["time_model"]
        self.flight = branch2["flight"]
        self.strategy = strategy
        self.next_check = 0.0
        self.per_planet = {}  # idx -> {"busy_until":float, "pending":[...]}
        # 资产台账
        self.building_invested = 0.0

    def asleep(self, now: float) -> bool:
        return (now / 3600) % 24 >= 16

    # ---- 建筑（逐行星独立队列，复用 sim01 纪律）----
    def planet_state(self, idx: int) -> dict:
        return self.per_planet.setdefault(idx, {"busy_until": 0.0, "pending": []})

    def pick_building(self, idx: int) -> str:
        p = self.eng.planets[idx]
        st = self.planet_state(idx)
        for r in ("M", "C", "D"):
            sb = STORAGE_OF_RES[r]
            if p.inv[r] > 0.8 * p.cap(r) and st["pending"].count(sb) == 0:
                return sb
        supply, need = p.energy()
        if need > supply and st["pending"].count("SOLAR") == 0:
            return "SOLAR"
        # 殖民路径所需基建：主星优先 LAB→3 / SHIPYARD→4（已在队列中的不重复选，避免队首同项死锁）
        if idx == 0 and self.strategy != "deep":
            if p.levels["LAB"] + st["pending"].count("LAB") < 3 and st["pending"].count("LAB") == 0:
                return "LAB"
            if self.civ.techs["ASTRO"] >= 1 and \
                    p.levels["SHIPYARD"] + st["pending"].count("SHIPYARD") < 4 \
                    and st["pending"].count("SHIPYARD") == 0:
                return "SHIPYARD"
        virtual = {b: p.levels[b] + st["pending"].count(b)
                   for b in ("METAL_MINE", "CRYSTAL_MINE", "DEUT_SYNTH")}
        return min(virtual, key=lambda b: virtual[b])

    def manage_buildings(self, now: float) -> None:
        for idx, p in enumerate(self.eng.planets):
            st = self.planet_state(idx)
            while len(st["pending"]) < self.PENDING_MAX:
                st["pending"].append(self.pick_building(idx))
            if now >= st["busy_until"] and st["pending"]:
                target = st["pending"][0]
                base = self.eng.cost_getter(BUILD_KEYS[target])
                cost = upgrade_cost(base, p.levels[target] + 1)
                if self.eng.pay(cost, p):
                    st["pending"].pop(0)
                    t = max(self.tm1["T_min_seconds"], 60 * vv(cost) / 100)
                    st["busy_until"] = now + t
                    self.building_invested += vv(cost)
                    self.eng.schedule(now + t, "complete_building", planet_idx=idx, building=target)
                elif len(st["pending"]) > 1:
                    # 队首暂不可负担（如 LAB 缺氘）：轮换到队尾，让可负担项先启动，避免死锁
                    st["pending"].append(st["pending"].pop(0))

    # ---- 科研（文明级单队列，02.2；当地库存支付）----
    def lab_planet(self) -> int | None:
        for i, p in enumerate(self.eng.planets):
            if p.levels["LAB"] >= 1:
                return i
        return None

    def next_research(self) -> str | None:
        t = self.civ.techs
        if self.strategy == "deep":
            return None
        for tech, want in (("ENERGY", 1), ("IMPULSE", 1), ("ESPIONAGE", 2), ("ASTRO", 1)):
            if t[tech] < want:
                return tech
        if self.strategy == "expansion" and t["ASTRO"] < 3:
            return "ASTRO"  # 扩张：astro3 → 容量 3
        return None

    def manage_research(self, now: float) -> None:
        if self.civ.research_active:
            return
        tech = self.next_research()
        if tech is None:
            return
        li = self.lab_planet()
        if li is None:
            return
        need_lab = 3 if tech == "ASTRO" else 1
        if self.eng.planets[li].levels["LAB"] < need_lab:
            return
        base = self.eng.cost_getter(TECH_KEYS[tech])
        cost = upgrade_cost(base, self.civ.techs[tech] + 1)
        lab_lv = self.eng.planets[li].levels["LAB"]
        if self.eng.pay(cost, self.eng.planets[li]):
            t = max(self.tm2["T_min_seconds"], 60 * vv(cost) / (100 * (1 + lab_lv)))
            self.civ.research_active = {"tech": tech, "level": self.civ.techs[tech] + 1}
            self.civ.research_invested += vv(cost)
            self.eng.schedule(now + t, "complete_research", tech=tech)
            self.eng.log.append({"t": now, "event": "research_start", "tech": tech,
                                 "level": self.civ.techs[tech] + 1, "cost": cost})

    # ---- 造船与殖民 ----
    def colony_cap(self) -> int:
        return colony_cap(self.civ.techs["ASTRO"])

    def colony_ships_total(self) -> int:
        return sum(p.ships["COLONY"] for p in self.eng.planets)

    def manage_shipyard(self, now: float) -> None:
        if self.strategy == "deep":
            return
        home = self.eng.planets[0]
        need_colony = (self.civ.techs["ASTRO"] >= 1 and home.levels["SHIPYARD"] >= 4
                       and len(self.eng.planets) < self.colony_cap()
                       and self.colony_ships_total() == 0 and not getattr(self, "_ship_in_build", False))
        need_cargo = home.ships["SMALL_CARGO"] < 2 and home.levels["SHIPYARD"] >= 4
        ship = "COLONY" if need_colony else ("SMALL_CARGO" if need_cargo else None)
        if ship is None or getattr(self, "_ship_in_build", False):
            return
        base = self.eng.cost_getter("SHIP.COLONY" if ship == "COLONY" else "SHIP.SMALL_CARGO")
        cost = {"M": base["M"], "C": base["C"], "D": base["D"]}
        if self.eng.pay(cost, home):
            self._ship_in_build = True
            t = max(self.tm2["T_min_seconds"], 60 * vv(cost) / (100 * (1 + home.levels["SHIPYARD"])))
            self.civ.ships_built_value += vv(cost)
            self.eng.schedule(now + t, "deliver_ship", planet_idx=0, ship=ship)
            self.eng.log.append({"t": now, "event": "ship_order", "ship": ship, "cost": cost})

    def manage_missions(self, now: float) -> None:
        if self.civ.missions_flying >= self.civ.slots():
            return
        home = self.eng.planets[0]
        # 殖民
        if (self.strategy != "deep" and home.ships["COLONY"] > 0
                and len(self.eng.planets) < self.colony_cap()):
            cargo = dict(self.flight["colony_cargo"])
            fuel = self.flight["fuel_colonize_D"]
            if all(home.inv[r] >= cargo[r] for r in ("M", "C", "D")) and home.inv["D"] >= cargo["D"] + fuel:
                home.ships["COLONY"] -= 1
                self.eng.depart(home, cargo)
                home.inv["D"] -= fuel
                home.consumed["D"] += fuel
                self.civ.fuel_consumed_value += 3 * fuel
                ship_v = vv(self.eng.cost_getter("SHIP.COLONY"))
                self.civ.colony_ships_consumed_value += ship_v
                self.civ.missions_flying += 1
                self.eng.schedule(now + self.flight["one_way_seconds"], "colonize_arrive", cargo=cargo)
                self.eng.log.append({"t": now, "event": "colonize_depart", "cargo": cargo})
                return
        # 运输：低水位补给（GOV.LOGISTICS 思路：殖民地 M<3000 且主星富裕时发货）
        for idx in range(1, len(self.eng.planets)):
            col = self.eng.planets[idx]
            if (home.ships["SMALL_CARGO"] > 0 and col.inv["M"] < 3000 and home.inv["M"] > 10000
                    and self.civ.missions_flying < self.civ.slots()):
                cargo = {"M": min(5000, home.inv["M"] - 6000), "C": 0.0, "D": 0.0}
                fuel = self.flight["fuel_transport_D"]
                if cargo["M"] > 0 and home.inv["D"] >= fuel:
                    home.ships["SMALL_CARGO"] -= 1
                    self.eng.depart(home, cargo)
                    home.inv["D"] -= fuel
                    home.consumed["D"] += fuel
                    self.civ.fuel_consumed_value += 3 * fuel
                    self.civ.missions_flying += 1
                    self.eng.schedule(now + self.flight["one_way_seconds"], "transport_arrive",
                                      planet_idx=idx, cargo=cargo)
                    self.eng.log.append({"t": now, "event": "transport_depart", "to": idx, "cargo": cargo})
                break

    def maybe_act(self, now: float) -> None:
        if now < self.next_check:
            return
        self.next_check = now + 4 * 3600
        if self.asleep(now):
            return
        self.manage_buildings(now)
        self.manage_research(now)
        self.manage_shipyard(now)
        self.manage_missions(now)


def run_strategy(strategy: str, rs: Ruleset, branch1: dict, branch2: dict,
                 start: dict | None = None, window_days: int | None = None) -> dict:
    inp = branch2["sim02_input"]
    # start=None → §06.3 骨架起点（500M/500C/0D）；正式版接续 SIM-01 真实末态（{"inventory","levels"}）
    home = Planet(rs, dict((start or {}).get("inventory", {"M": 500, "C": 500, "D": 0})),
                  fusion_model=branch1.get("fusion_model"))
    if start and start.get("levels"):
        home.levels.update(start["levels"])
    eng = Sim2Engine(rs, home)
    exp = dict(branch1.get("experimental_buildings", {}))
    exp.update(branch2.get("experimental_buildings", {}))

    def cost_getter(key: str):
        try:
            return rs.get(key)
        except Exception:
            if key in exp:
                return exp[key]
            # 舰船在 RC1 有成本（speed/fuel 字段 TBD 但成本在）
            raise
    eng.cost_getter = cost_getter
    civ = Civ()
    bot = Sim2Bot(eng, civ, branch1, branch2, strategy)

    days = window_days or inp["window_days"]
    t_end = days * 86400
    record_days = sorted(set(inp["record_days"]) | {days}) if days != inp["window_days"] else inp["record_days"]
    record_at = {d * 86400 for d in record_days}
    for t in sorted(record_at):
        eng.schedule(t, "_record")
    for h in range(0, days * 24 + 1):
        eng.schedule(h * 3600, "_bot")
    eng.schedule(t_end + 1, "_end")

    snapshots, first_colony_day = [], None
    while eng.queue:
        ev = heapq.heappop(eng.queue)
        eng.settle_to(ev.at)
        eng.now = ev.at
        if ev.kind == "complete_building":
            eng.handle(ev)
            idx = ev.payload["planet_idx"]
            st = bot.planet_state(idx)
            if eng.now >= st["busy_until"] and st["pending"]:
                # 完成即尝试启动下一项（队列纪律：启动时再校验扣费）
                bot.manage_buildings(eng.now)
        elif ev.kind == "complete_research":
            civ.techs[ev.payload["tech"]] += 1
            eng.log.append({"t": ev.at, "event": "research_complete",
                            "tech": ev.payload["tech"], "level": civ.techs[ev.payload["tech"]]})
            civ.research_active = None
        elif ev.kind == "deliver_ship":
            eng.planets[ev.payload["planet_idx"]].ships[ev.payload["ship"]] += 1
            bot._ship_in_build = False
            eng.log.append({"t": ev.at, "event": "ship_delivered", "ship": ev.payload["ship"]})
            bot.manage_missions(eng.now)
        elif ev.kind == "colonize_arrive":
            newplanet = Planet(rs, {}, fusion_model=branch1.get("fusion_model"))
            eng.planets.append(newplanet)
            eng.arrive(newplanet, ev.payload["cargo"])  # 携带货物交付新星（GDD-01 成功效果）
            civ.missions_flying -= 1
            if first_colony_day is None:
                first_colony_day = round(ev.at / 86400, 2)
            eng.log.append({"t": ev.at, "event": "colony_founded", "planet_idx": len(eng.planets) - 1})
        elif ev.kind == "transport_arrive":
            eng.arrive(eng.planets[ev.payload["planet_idx"]], ev.payload["cargo"])
            civ.missions_flying -= 1
            # 舰船返航（骨架：货船交付后即刻回到主星可用，航时近似合并）
            eng.planets[0].ships["SMALL_CARGO"] += 1
        elif ev.kind == "_bot":
            bot.maybe_act(ev.at)
        if ev.at in record_at and (not snapshots or snapshots[-1]["day"] != ev.at / 86400):
            snapshots.append({
                "day": ev.at / 86400,
                "planets": len(eng.planets),
                "inventory_total": {r: round(sum(p.inv[r] for p in eng.planets), 0) for r in ("M", "C", "D")},
                "techs": dict(civ.techs),
                "home_levels": dict(eng.planets[0].levels),  # SIM-04 初始化模板用
            })
        if ev.at > t_end:
            break

    inv_v = sum(value_v(p.inv["M"], p.inv["C"], p.inv["D"]) for p in eng.planets)
    transit_v = value_v(**{k.lower(): v for k, v in eng.in_transit.items()})
    ships_existing_v = civ.ships_built_value - civ.colony_ships_consumed_value
    asset_v = inv_v + transit_v + bot.building_invested + civ.research_invested + ships_existing_v
    return {
        "strategy": strategy,
        "snapshots": snapshots,
        "first_colony_day": first_colony_day,
        "final": {
            "planets": len(eng.planets),
            "asset_value_v": round(asset_v, 0),
            "inventory_v": round(inv_v, 0),
            "building_invested_v": round(bot.building_invested, 0),
            "research_invested_v": round(civ.research_invested, 0),
            "colony_ships_consumed_v": round(civ.colony_ships_consumed_value, 0),
            "fuel_consumed_v": round(civ.fuel_consumed_value, 0),
            "colony_cap": civ.techs["ASTRO"] and colony_cap(civ.techs["ASTRO"]),
        },
        "conservation": eng.conservation_check(),
        "events": len(eng.log),
    }


def main() -> None:
    branch1 = json.loads(BRANCH1.read_text(encoding="utf-8"))
    branch2 = json.loads(BRANCH2.read_text(encoding="utf-8"))
    rs = Ruleset()
    runs = [run_strategy(s, rs, branch1, branch2) for s in ("deep", "expansion", "balanced")]
    report = {
        "run_id": f"sim02-skeleton-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"],
        "ruleset": rs.meta["ruleset_version"],
        "assumptions": {"sim01": BRANCH1.name, "sim02": BRANCH2.name},
        "gate_evidence": False,
        "gate_note": "科研/造船/航时/燃料/前置树均为实验假设（GAP-02）。机制验证用，不作 K-E08~K-E13 证据。",
        "runs": runs,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}")
    print(f"{'策略':<10} {'守恒':>4} {'首殖日':>7} {'行星数':>5} {'资产V':>10} {'建筑投入':>10} {'科研投入':>8} {'殖民舰消耗':>9}")
    for r in runs:
        f = r["final"]
        print(f"{r['strategy']:<10} {'OK' if r['conservation']['ok'] else 'FAIL':>4} "
              f"{str(r['first_colony_day']):>7} {f['planets']:>5} {f['asset_value_v']:>10.0f} "
              f"{f['building_invested_v']:>10.0f} {f['research_invested_v']:>8.0f} {f['colony_ships_consumed_v']:>9.0f}")
    for r in runs:
        print(f"  {r['strategy']} 快照: " + "  ".join(
            f"D{s['day']:.0f}: {s['planets']}星" for s in r["snapshots"]))


if __name__ == "__main__":
    main()
