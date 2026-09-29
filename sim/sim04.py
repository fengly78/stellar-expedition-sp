#!/usr/bin/env python3
"""sim/sim04.py — SIM-04 海盗零作弊生存骨架（V1.3 §06.5、GDD-05）

零作弊：无免费补舰、无隐藏加成、无全图实时情报。初始化清单来自 SIM-02 deep 策略
Day14 快照（矿等级+库存，来源可溯）；之后生产/造舰/战损全部走普通规则
（生产=sim/engine，战斗=sim/combat 等价引擎，掠夺=GDD-04 三重限制）。

行为类别 BUILD/SCOUT/RAID/RECOVER；策略状态 GROWTH/SCOUTING/RAIDING/RECOVERY
（两组名称分开，不混用）。情报为快照：observed_at + 噪声（情报质量档），
决策只读快照；旧情报可导致错误判断（GDD-05/12）。

骨架矩阵：3 人格（谨慎/均衡/激进阈值）× 2 情报质量（±30%/±60% 噪声）×
1 环境（10 文明低活跃）× 5 种子 × 30 天。正式轮：3×3×4=36 组、30/60/90 天、多种子（06.5）。
gate_evidence=false：燃料 TBD 记 0、防御方骨架轮不重建、造舰前置简化为船厂 0 级可建。
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, upgrade_cost, value_v  # noqa: E402
from sim import sim02  # noqa: E402
from sim.combat import UnitSpec, mulberry32, simulate  # noqa: E402
from sim.engine import Engine, Planet  # noqa: E402
from sim.sim03 import Arsenal  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH3 = ROOT / "config" / "rulesets" / "branches" / "sim03_assumptions.json"

PERSONALITIES = {
    # min_profit_ratio：要求 预估利润 ≥ 该值 × 预估损失（利润率门槛）
    "cautious": {"min_profit_ratio": 1.50, "max_loss_share": 0.15, "reserve_share": 0.40},
    "balanced": {"min_profit_ratio": 0.50, "max_loss_share": 0.40, "reserve_share": 0.25},
    "aggressive": {"min_profit_ratio": 0.00, "max_loss_share": 0.80, "reserve_share": 0.10},
}
INTEL_QUALITY = {"good": 0.30, "poor": 0.60}   # 快照估值噪声 ±
ENVIRONMENTS = {
    # strength：防御舰队规模系数区间；rebuild_per_day：每日重建初始舰队 V 的比例（GDD-05 RECOVER 的环境侧）
    "low_activity": {"strength": (0.2, 1.0), "inventory": (150000, 650000), "rebuild_per_day": 0.0},
    "military_response": {"strength": (1.5, 4.0), "inventory": (250000, 800000), "rebuild_per_day": 0.10},
}
SCOUT_HOURS = 4        # 侦察占用一个任务槽的时长（实验）
RAID_RETURN_HOURS = 8  # 往返 8h（sim02 单程 4h 实验值）
BUILD_BATCH_LF = 5     # 每批造 5 艘轻战（造舰按整批扣费交付，GDD-04）


def make_template(rs: Ruleset) -> dict:
    """SIM-02 deep Day14 快照 → 海盗初始化清单（来源可溯，零注入）。"""
    b1 = json.loads(sim02.BRANCH1.read_text(encoding="utf-8"))
    b2 = json.loads(sim02.BRANCH2.read_text(encoding="utf-8"))
    r = sim02.run_strategy("deep", rs, b1, b2)
    snap = next(s for s in r["snapshots"] if s["day"] == 14.0)
    assert r["conservation"]["ok"]
    return {"levels": snap["home_levels"], "inventory": snap["inventory_total"],
            "source": "sim02 deep Day14"}


class Target:
    """环境文明行星：防御舰队 + 库存再生；军事反击环境下按日重建战损（上限=初始规模）。"""

    def __init__(self, tid: int, rng, ars: Arsenal, env: dict):
        self.id = tid
        lo, hi = env["inventory"]
        self.inventory_v = lo + rng() * (hi - lo)
        slo, shi = env["strength"]
        strength = slo + rng() * (shi - slo)
        self.fleet = {"LIGHT": int(40 * strength), "HEAVY": int(15 * strength)}
        self.initial_fleet = dict(self.fleet)
        self.rebuild_per_day = env["rebuild_per_day"]
        self.regrow_v_per_day = 2000 + rng() * 4000
        self.ars = ars

    def comp(self) -> dict[str, int]:
        return {k: v for k, v in self.fleet.items() if v > 0}

    def rebuild(self, fraction_of_day: float) -> None:
        """按初始舰队 V 的比例重建（轻战优先补齐），不超初始规模。"""
        if self.rebuild_per_day <= 0:
            return
        budget_v = (self.ars.cost_v("LIGHT") * self.initial_fleet["LIGHT"]
                    + self.ars.cost_v("HEAVY") * self.initial_fleet["HEAVY"]) \
            * self.rebuild_per_day * fraction_of_day
        while budget_v >= self.ars.cost_v("LIGHT"):
            if self.fleet["LIGHT"] < self.initial_fleet["LIGHT"]:
                self.fleet["LIGHT"] += 1
                budget_v -= self.ars.cost_v("LIGHT")
            elif self.fleet["HEAVY"] < self.initial_fleet["HEAVY"] and budget_v >= self.ars.cost_v("HEAVY"):
                self.fleet["HEAVY"] += 1
                budget_v -= self.ars.cost_v("HEAVY")
            else:
                break


class Pirate:
    def __init__(self, rs: Ruleset, ars: Arsenal, template: dict, personality: str, seed: int):
        self.ars = ars
        self.cfg = PERSONALITIES[personality]
        self.personality = personality
        self.rng = mulberry32(seed)
        b1 = json.loads(sim02.BRANCH1.read_text(encoding="utf-8"))
        self.planet = Planet(rs, dict(template["inventory"]), fusion_model=b1.get("fusion_model"))
        self.planet.levels.update(template["levels"])
        self.planet.ships.update({"LIGHT": 0, "HEAVY": 0, "SCOUT": 0})
        self.eng = Engine(rs, self.planet)
        self.state = "GROWTH"
        self.intel: dict[int, dict] = {}     # tid -> {observed_at_day, est_inventory_v, est_fleet}
        self.slots_busy_until: list[float] = []
        # 台账
        self.ships_built_v = 0.0
        self.lost_v = 0.0
        self.loot_v = 0.0
        self.attacks = 0
        self.attack_targets: list[int] = []
        self.state_days: dict[str, float] = {}
        self.injection_v = 0.0               # 系统注入必须恒为 0

    # ---- 行为 ----
    def free_slot(self, day: float) -> bool:
        self.slots_busy_until = [t for t in self.slots_busy_until if t > day]
        return len(self.slots_busy_until) < 2  # 任务槽 2（计算机 0，F-06）

    def reserve_v(self) -> float:
        return self.start_v * self.cfg["reserve_share"]

    def build_ships(self, day: float) -> None:
        """BUILD：库存超储备时整批造舰（真实扣费）：轻战每批 5 艘，并维持 10 艘小运作载货编队。"""
        inv_v = value_v(self.planet.inv["M"], self.planet.inv["C"], self.planet.inv["D"])
        while True:
            if self.planet.ships["SMALL_CARGO"] < 10:
                v = self.ars.rs.get("SHIP.SMALL_CARGO")
                batch_cost = {"M": v["M"], "C": v["C"], "D": v["D"]}
                n = 1
            else:
                v = self.ars.rs.get("SHIP.LIGHT")
                batch_cost = {"M": v["M"] * BUILD_BATCH_LF, "C": v["C"] * BUILD_BATCH_LF,
                              "D": v["D"] * BUILD_BATCH_LF}
                n = BUILD_BATCH_LF
            batch_v = value_v(batch_cost["M"], batch_cost["C"], batch_cost["D"])
            if inv_v - batch_v < self.reserve_v():
                break
            if not self.eng.pay(batch_cost, self.planet):
                break
            ship = "SMALL_CARGO" if n == 1 else "LIGHT"
            self.planet.ships[ship] += n  # 骨架：建造时间并入即时（造舰时长实验项）
            self.ships_built_v += batch_v
            inv_v -= batch_v

    def scout(self, day: float, targets: list[Target], noise: float) -> None:
        """SCOUT：选情报最旧的目标，快照含噪声；只写快照不改真实值。"""
        if not self.free_slot(day):
            return
        tid = min(range(len(targets)),
                  key=lambda i: self.intel.get(i, {}).get("observed_at_day", -999))
        t = targets[tid]
        err = lambda x: x * (1 + (self.rng() * 2 - 1) * noise)
        self.intel[tid] = {"observed_at_day": day,
                           "est_inventory_v": err(t.inventory_v),
                           "est_fleet": {k: max(0, round(err(v))) for k, v in t.comp().items()}}
        self.slots_busy_until.append(day + SCOUT_HOURS / 24)

    def strike_comp(self) -> dict[str, int]:
        return {n: self.planet.ships[n] for n in ("LIGHT", "SMALL_CARGO") if self.planet.ships[n] > 0}

    def _units_of(self, comp: dict[str, int]) -> dict:
        return {self.ars.ids[n]: {"spec": self.ars.spec(n), "amount": c} for n, c in comp.items() if c > 0}

    def _losses_v_of(self, losses: dict[int, int]) -> float:
        inv = {v: k for k, v in self.ars.ids.items()}
        return sum(self.ars.cost_v(inv[uid]) * n for uid, n in losses.items())

    def _loot_of(self, inventory_v: float, survivors: dict[int, int]) -> float:
        """GDD-04 三重限制：合法库存 × 掠夺比例 × 存活舰队剩余货舱（骨架：出发空舱，剩余=全舱）。"""
        sc_left = survivors.get(self.ars.ids["SMALL_CARGO"], 0)
        if sc_left == 0:
            return 0.0  # 轻战货舱 TBD=0，载货全在小运
        return min(inventory_v * 0.5, sc_left * self.ars.base["SMALL_CARGO"]["cargo"])

    def evaluate_raid(self, est_fleet: dict[str, int], est_inventory_v: float) -> tuple[bool, float]:
        """用快照编成跑一次确定性推演估计收益；只用情报，不读真实值（GDD-12）。"""
        comp = self.strike_comp()
        if comp.get("LIGHT", 0) == 0:
            return False, 0.0
        att = [{"fleet_mission_id": 1, "owner_id": 1, "units": self._units_of(comp)}]
        units = self._units_of(est_fleet)
        if not units:
            est_loss, est_loot = 0.0, self._loot_of(est_inventory_v, {self.ars.ids["SMALL_CARGO"]: comp.get("SMALL_CARGO", 0)})
        else:
            out = simulate(att, [{"fleet_mission_id": 2, "owner_id": 2, "units": units}], seed=1)
            est_loss = self._losses_v_of(out["attacker_losses"])
            est_loot = self._loot_of(est_inventory_v, out["attacker_survivors"])
        est_profit = est_loot - est_loss
        ok = (est_loot > 0
              and est_profit >= self.cfg["min_profit_ratio"] * max(est_loss, 1)
              and est_loss <= self.cfg["max_loss_share"] * max(self.fleet_v() + est_loss, 1))
        return ok, est_profit

    def fleet_v(self) -> float:
        return sum(self.planet.ships[n] * self.ars.cost_v(n) for n in ("LIGHT", "HEAVY", "SMALL_CARGO"))

    def raid(self, day: float, targets: list[Target], tid: int) -> None:
        """RAID：真实战斗、真实战损、GDD-04 三重限制掠夺；战利品计入库存（在途近似合并）。"""
        comp = self.strike_comp()
        t = targets[tid]
        att = [{"fleet_mission_id": 1, "owner_id": 1, "units": self._units_of(comp)}]
        units = self._units_of(t.comp())
        out = simulate(att, [{"fleet_mission_id": 2, "owner_id": 2, "units": units}],
                       seed=int(self.rng() * 2**31)) if units else None
        if out:
            for uid, n in out["attacker_losses"].items():
                name = {v: k for k, v in self.ars.ids.items()}[uid]
                self.planet.ships[name] -= n
            self.lost_v += self._losses_v_of(out["attacker_losses"])
            for uid, n in out["defender_losses"].items():
                name = {v: k for k, v in self.ars.ids.items()}[uid]
                t.fleet[name] = t.fleet.get(name, 0) - n
            survivors = out["attacker_survivors"]
        else:
            survivors = {self.ars.ids[n]: c for n, c in comp.items()}
        loot_v = self._loot_of(t.inventory_v, survivors)
        if loot_v > 0:
            # 战利品按分支货构成折算 M/C/D 入库（资源构成保存，不按估值直接装舱：06.4）
            comp_mix = {"M": 0.5, "C": 0.3, "D": 0.2}
            self.planet.inv["M"] += loot_v * comp_mix["M"] / 1.0
            self.planet.inv["C"] += loot_v * comp_mix["C"] / 2.0
            self.planet.inv["D"] += loot_v * comp_mix["D"] / 3.0
            t.inventory_v -= loot_v
            self.loot_v += loot_v
        self.attacks += 1
        self.attack_targets.append(tid)
        self.slots_busy_until.append(day + RAID_RETURN_HOURS / 24)
        # 侦察快照过时化：目标真实状态已变，快照不自动更新（GDD-12）
        self.intel.pop(tid, None)

    def step(self, day: float, targets: list[Target], noise: float) -> None:
        # 状态机（GDD-05）：恢复条件 → 袭击条件 → 侦察 → 成长
        fleet_low = self.fleet_v() < 0.3 * max(self.peak_fleet_v, 1)
        broke = value_v(self.planet.inv["M"], self.planet.inv["C"], self.planet.inv["D"]) < self.reserve_v()
        if self.state != "RECOVERY" and (fleet_low or broke) and self.attacks > 0:
            self.state = "RECOVERY"
        elif self.state == "RECOVERY" and not fleet_low and not broke:
            self.state = "GROWTH"
        # 行为执行
        self.build_ships(day)
        acted = False
        if self.state != "RECOVERY":
            best, best_p = None, 0.0
            for tid, snap in self.intel.items():
                ok, p = self.evaluate_raid(snap["est_fleet"], snap["est_inventory_v"])
                if ok and p > best_p and self.free_slot(day):
                    best, best_p = tid, p
            if best is not None:
                self.state = "RAIDING"
                self.raid(day, targets, best)
                acted = True
        if not acted and self.state != "RECOVERY":
            self.state = "SCOUTING" if len(self.intel) < len(targets) else "GROWTH"
            self.scout(day, targets, noise)
        self.state_days[self.state] = self.state_days.get(self.state, 0) + 4 / 24


def run_one(rs: Ruleset, ars: Arsenal, template: dict, personality: str,
            intel_q: str, env_name: str, seed: int, days: int = 30) -> dict:
    env = ENVIRONMENTS[env_name]
    rng = mulberry32(seed * 7919 + 13)
    targets = [Target(i, rng, ars, env) for i in range(10)]
    p = Pirate(rs, ars, template, personality, seed)
    p.start_v = value_v(template["inventory"]["M"], template["inventory"]["C"], template["inventory"]["D"])
    p.peak_fleet_v = 0.0
    noise = INTEL_QUALITY[intel_q]
    for h in range(0, days * 24, 4):
        day = h / 24
        p.eng.settle_to(h * 3600)                        # 生产照常
        for t in targets:
            t.inventory_v += t.regrow_v_per_day * (4 / 24)
            t.rebuild(4 / 24)                            # 军事反击环境：防御方重建战损
        p.peak_fleet_v = max(p.peak_fleet_v, p.fleet_v())
        p.step(day, targets, noise)
    end_inv_v = value_v(p.planet.inv["M"], p.planet.inv["C"], p.planet.inv["D"])
    asset_end = end_inv_v + p.fleet_v() + p.ships_built_v * 0  # 舰船已计入 fleet_v
    return {
        "personality": personality, "intel": intel_q, "environment": env_name, "seed": seed,
        "start_inventory_v": round(p.start_v, 0),
        "end_asset_v": round(asset_end, 0),
        "ships_built_v": round(p.ships_built_v, 0),
        "combat_loss_v": round(p.lost_v, 0),
        "loot_v": round(p.loot_v, 0),
        "attacks": p.attacks,
        "distinct_targets": len(set(p.attack_targets)),
        "state_days": {k: round(v, 1) for k, v in p.state_days.items()},
        "recovery_days": round(p.state_days.get("RECOVERY", 0), 1),
        "system_injection_v": p.injection_v,
        "survived": asset_end > 0,
    }


def selftest_state_machine(rs: Ruleset, ars: Arsenal, template: dict) -> bool:
    """合成场景验证状态机迁移（应急出现触发留给正式轮调参）：
    舰队跌破峰值 30% → RECOVERY；RECOVERY 中禁止主动袭击（GDD-05）；重建后退出。"""
    p = Pirate(rs, ars, template, "aggressive", 999)
    p.start_v = value_v(template["inventory"]["M"], template["inventory"]["C"], template["inventory"]["D"])
    p.build_ships = lambda day: None   # 隔离造舰行为，单测状态机迁移
    p.peak_fleet_v = 100000.0
    p.planet.ships["LIGHT"] = 5      # fleet_v=20000 < 30% 峰值
    p.attacks = 1
    targets = [Target(0, mulberry32(1), ars, ENVIRONMENTS["low_activity"])]
    p.step(0.0, targets, 0.3)
    assert p.state == "RECOVERY", f"期望 RECOVERY，实际 {p.state}"
    p.intel[0] = {"observed_at_day": 0.0, "est_inventory_v": 500000, "est_fleet": {}}
    p.step(0.25, targets, 0.3)
    assert p.attacks == 1, "RECOVERY 期间发生主动袭击，违反 GDD-05"
    p.planet.ships["LIGHT"] = 100    # 重建完成
    p.step(0.5, targets, 0.3)
    assert p.state != "RECOVERY", f"期望退出 RECOVERY，实际 {p.state}"
    return True


def main() -> None:
    rs = Ruleset()
    branch3 = json.loads(BRANCH3.read_text(encoding="utf-8"))
    ars = Arsenal(rs, branch3)
    ars.rs = rs
    template = make_template(rs)
    sm_ok = selftest_state_machine(rs, ars, template)
    runs = []
    for env_name in ENVIRONMENTS:
        for pers in PERSONALITIES:
            for iq in INTEL_QUALITY:
                for seed in range(5):
                    runs.append(run_one(rs, ars, template, pers, iq, env_name, seed))
    report = {
        "run_id": f"sim04-skeleton-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"],
        "ruleset": rs.meta["ruleset_version"],
        "init_manifest": template,
        "gate_evidence": False,
        "state_machine_selftest": sm_ok,
        "state_machine_note": "RECOVERY 迁移逻辑由合成场景自检验证；矩阵内未应急出现（袭击损失占持续生产比例过低），正式轮需更强反击环境或更低恢复阈值",
        "gate_note": ("骨架：轻战货舱 TBD=0，载货由 10 艘小运编队承担（5000 舱/艘，RC1 Candidate）；"
                      "燃料记 0；战利品在途航时近似合并；造舰即时交付；"
                      "环境 2/4 档（低活跃/军事反击，反击环境防御方按初始舰队 V 10%/日重建）、"
                      "情报 2/3 档、30 天、5 种子。不作 K-A01~03 证据。"),
        "runs": runs,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"报告: {out}")
    print(f"初始化清单: {template['source']}，库存 V={value_v(template['inventory']['M'], template['inventory']['C'], template['inventory']['D']):.0f}")
    print(f"{'环境':<18} {'人格':<11} {'情报':<5} {'攻击均':>6} {'战损均V':>9} {'掠夺均V':>9} {'恢复天数均':>9} {'期末资产均V':>11} {'注入':>4} {'存活':>4}")
    for env_name in ENVIRONMENTS:
        for pers in PERSONALITIES:
            for iq in INTEL_QUALITY:
                sub = [r for r in runs if r["personality"] == pers and r["intel"] == iq
                       and r["environment"] == env_name]
                print(f"{env_name:<18} {pers:<11} {iq:<5} {mean(r['attacks'] for r in sub):>6.1f} "
                      f"{mean(r['combat_loss_v'] for r in sub):>9.0f} "
                      f"{mean(r['loot_v'] for r in sub):>9.0f} "
                      f"{mean(r['recovery_days'] for r in sub):>9.1f} "
                      f"{mean(r['end_asset_v'] for r in sub):>11.0f} "
                      f"{max(r['system_injection_v'] for r in sub):>4.0f} "
                      f"{sum(r['survived'] for r in sub)}/{len(sub)}")


if __name__ == "__main__":
    main()
