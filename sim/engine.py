#!/usr/bin/env python3
"""sim/engine.py — 事件驱动结算内核（SIM 共用，V1.3 §06.1）

纪律：
- 事件驱动：先结算事件之前的生产，再应用完成事件并更新产能（§06.1），
  防止按整点向上/向下对齐制造额外产出。
- 分段结算：跨完成事件的时段分段计算（GDD-02：不能对整段时间套用最终产量）。
- 仓容：普通生产在库存达到仓容后停止（02.2）；超额只来自合法运输（本骨架无运输）。
- 守恒对账：inventory = produced - consumed - cap_loss（§GDD-13 恒等式的最小形态）。
- 随机性：本骨架无随机；后续接入时必须使用固定种子并记录（§06.1）。

本模块是 Python 试验枝（§11.1 允许的规则模型/测试工具），不是生产代码。
"""
from __future__ import annotations

import heapq
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, base_production, storage_capacity, upgrade_cost  # noqa: E402

RES = ("M", "C", "D")


@dataclass(order=True)
class Event:
    at: float                 # 秒
    seq: int                  # 稳定序号：同刻按提交顺序，不由调度运气决定（GDD-01）
    kind: str = field(compare=False)
    payload: dict = field(compare=False, default_factory=dict)


class Planet:
    """单行星最小状态：建筑等级、库存、能源。参考 §11.8 首周期纵切范围。"""

    STORAGE_FOR = {"M": "M_STORAGE", "C": "C_STORAGE", "D": "D_STORAGE"}

    def __init__(self, rs: Ruleset, inventory: dict, fusion_model: dict | None = None):
        self.rs = rs
        self.fusion_model = fusion_model  # None = 聚变未启用（TBD 状态）
        self.levels = {"METAL_MINE": 0, "CRYSTAL_MINE": 0, "DEUT_SYNTH": 0, "SOLAR": 0,
                       "M_STORAGE": 0, "C_STORAGE": 0, "D_STORAGE": 0, "FUSION": 0,
                       "LAB": 0, "SHIPYARD": 0}
        self.inv = {r: float(inventory.get(r, 0)) for r in RES}
        self.initial = dict(self.inv)  # 对账恒等式：inv = initial + produced - consumed - cap_loss
        self.cap_curve = rs.get("STORAGE.CURVE")
        self.ships = {"COLONY": 0, "SMALL_CARGO": 0}  # 行星在地舰船（在途由引擎管理）
        # 对账计数器
        self.produced = {r: 0.0 for r in RES}
        self.consumed = {r: 0.0 for r in RES}
        self.cap_loss = {r: 0.0 for r in RES}

    def cap(self, r: str) -> float:
        return storage_capacity(self.cap_curve, self.levels[self.STORAGE_FOR[r]])

    def solar_output(self) -> float:
        solar = self.rs.get("ENERGY.SOLAR")
        lv = self.levels["SOLAR"]
        return 0.0 if lv == 0 else solar["base"] * lv * solar["factor"] ** (lv - 1)

    def fusion_output(self) -> float:
        if not self.fusion_model or self.levels["FUSION"] == 0:
            return 0.0
        fm = self.fusion_model["energy_output"]
        lv = self.levels["FUSION"]
        return fm["base"] * lv * fm["factor"] ** (lv - 1)

    def fusion_demand(self) -> float:
        """聚变氘耗（单位：氘/小时）。无聚变或未启用时为 0。"""
        if not self.fusion_model or self.levels["FUSION"] == 0:
            return 0.0
        fm = self.fusion_model["deuterium_demand"]
        lv = self.levels["FUSION"]
        return fm["base"] * lv * fm["factor"] ** (lv - 1)

    def mine_energy_need(self) -> float:
        need = 0.0
        for mine, key in (("METAL_MINE", "ENERGY.M_DEMAND"), ("CRYSTAL_MINE", "ENERGY.C_DEMAND"),
                          ("DEUT_SYNTH", "ENERGY.D_DEMAND")):
            mlv = self.levels[mine]
            if mlv > 0:
                d = self.rs.get(key)
                need += d["base"] * mlv * d["factor"] ** (mlv - 1)
        return need

    def fusion_has_fuel(self) -> bool:
        """氘库存>0 或氘产出（仅太阳能供电口径）足以覆盖聚变氘耗。"""
        fd = self.fusion_demand()
        if fd == 0:
            return False
        if self.inv["D"] > 0:
            return True
        need = self.mine_energy_need()
        e = 1.0 if need == 0 else min(1.0, self.solar_output() / need)
        deut_prod = base_production(self.rs.get("RESOURCE.D.PRODUCTION"), self.levels["DEUT_SYNTH"]) * e
        return deut_prod >= fd

    def energy(self) -> tuple[float, float]:
        supply = self.solar_output() + (self.fusion_output() if self.fusion_has_fuel() else 0.0)
        return supply, self.mine_energy_need()

    def rates(self) -> dict:
        """当前等级下的实际速率（资源/秒）。聚变氘耗体现为 D 的净速率扣减。"""
        supply, need = self.energy()
        e = 1.0 if need == 0 else min(1.0, supply / need)
        out = {}
        for mine, rkey, r in (("METAL_MINE", "RESOURCE.M.PRODUCTION", "M"),
                              ("CRYSTAL_MINE", "RESOURCE.C.PRODUCTION", "C"),
                              ("DEUT_SYNTH", "RESOURCE.D.PRODUCTION", "D")):
            per_hour = base_production(self.rs.get(rkey), self.levels[mine]) * e
            out[r] = per_hour / 3600.0
        if self.fusion_has_fuel():
            out["D"] -= self.fusion_demand() / 3600.0
        return out


class Engine:
    def __init__(self, rs: Ruleset, planet: Planet):
        self.rs = rs
        self.planets: list[Planet] = [planet]
        self.now = 0.0
        self.last_settle = 0.0
        self.energy_low_time = 0.0   # K-E06：能源满足率 <90% 的累计秒数（need>0 时统计）
        self.queue: list[Event] = []
        self.seq = 0
        self.log: list[dict] = []
        # 在途库存（GDD-13 InTransit）：出发从行星移出、抵达一次性交付，两端不同时可花
        self.in_transit = {"M": 0.0, "C": 0.0, "D": 0.0}

    @property
    def planet(self) -> Planet:
        return self.planets[0]

    def schedule(self, at: float, kind: str, **payload) -> None:
        self.seq += 1
        heapq.heappush(self.queue, Event(at, self.seq, kind, payload))

    def settle_to(self, t: float) -> None:
        """分段生产结算到 t（不越过任何事件）。多行星：全部行星同步推进。"""
        if t <= self.last_settle:
            return
        dt = t - self.last_settle
        for p in self.planets:
            rates = p.rates()
            supply, need = p.energy()
            if need > 0 and supply / need < 0.9:
                self.energy_low_time += dt
            for r in RES:
                gain = rates[r] * dt
                if gain >= 0:
                    room = max(0.0, p.cap(r) - p.inv[r])
                    credited = min(gain, room)
                    p.inv[r] += credited
                    p.produced[r] += gain
                    p.cap_loss[r] += gain - credited
                else:
                    # 净消耗（如聚变氘耗）：最多烧掉现有库存，烧尽后下一段聚变自动停转
                    burn = min(-gain, p.inv[r])
                    p.inv[r] -= burn
                    p.consumed[r] += burn
        self.last_settle = t

    def pay(self, cost: dict, planet: Planet | None = None) -> bool:
        p = planet or self.planets[0]
        if any(p.inv[r] < cost.get(r, 0) - 1e-9 for r in RES):
            return False
        for r in RES:
            c = cost.get(r, 0)
            p.inv[r] -= c
            p.consumed[r] += c
        return True

    def depart(self, planet: Planet, cargo: dict) -> None:
        """货物离港：行星库存 → 在途（RES-004：离港减少、未到达不增加）。"""
        for r in RES:
            c = cargo.get(r, 0)
            assert planet.inv[r] >= c - 1e-9, "出发校验缺失：离港货物超过库存"
            planet.inv[r] -= c
            self.in_transit[r] += c

    def arrive(self, planet: Planet, cargo: dict) -> None:
        """抵达交付一次（02.2：合法运输可形成临时超额库存，不删除已抵达货物）。"""
        for r in RES:
            c = cargo.get(r, 0)
            self.in_transit[r] -= c
            planet.inv[r] += c

    def step(self) -> bool:
        if not self.queue:
            return False
        ev = heapq.heappop(self.queue)
        self.settle_to(ev.at)       # 先结算事件之前的生产（§06.1）
        self.now = ev.at
        self.handle(ev)
        return True

    def run_until(self, t_end: float) -> None:
        self.schedule(t_end, "_end")
        while self.step():
            if self.now >= t_end:
                break

    def handle(self, ev: Event) -> None:
        p = self.planet
        if ev.kind == "complete_building":
            b = ev.payload["building"]
            p.levels[b] += 1
            self.log.append({"t": ev.at, "event": "complete", "building": b, "level": p.levels[b]})
        elif ev.kind == "_end":
            pass
        else:
            raise ValueError(f"未知事件类型: {ev.kind}")

    def build_time(self, cost: dict, tm: dict) -> float:
        """F-08 实验解释（配置分支，EXPERIMENTAL）。
        tm["model"]="f08_upstream" 时用上游同构式（审计 §1.4，CR-003 提案 E 校准用）：
            seconds = 3600 × (M+C) / (2500 × (1+R) × 2^N × universe_speed)
        缺省为 sim01 实验式：T = max(T_min, 60×V/(100×(1+R)×2^N))。"""
        if tm.get("model") == "f08_upstream":
            speed = tm["universe_speed"]
            return max(tm["T_min_seconds"],
                       math.ceil(3600 * (cost["M"] + cost["C"])
                                 / (2500 * (1 + tm["robotics_level_R"])
                                    * 2 ** tm["nanite_level_N"] * speed)))
        v = cost["M"] + 1.5 * cost["C"] + 3 * cost["D"]
        return max(tm["T_min_seconds"],
                   math.ceil(60 * v / (100 * (1 + tm["robotics_level_R"]) * 2 ** tm["nanite_level_N"])))

    def conservation_check(self) -> dict:
        """GDD-13 恒等式：Σinv + in_transit = Σinitial + produced − consumed − cap_loss。
        内部运输与殖民转货相互抵消（位置转移不产生净值）。"""
        res = {}
        ok = True
        for r in RES:
            inv_total = sum(p.inv[r] for p in self.planets) + self.in_transit[r]
            initial = sum(p.initial[r] for p in self.planets)
            produced = sum(p.produced[r] for p in self.planets)
            consumed = sum(p.consumed[r] for p in self.planets)
            cap_loss = sum(p.cap_loss[r] for p in self.planets)
            expect = initial + produced - consumed - cap_loss
            diff = abs(inv_total - expect)
            res[r] = {"inventory+transit": round(inv_total, 3), "expected": round(expect, 3), "diff": diff}
            if diff > 1e-6:
                ok = False
        return {"ok": ok, "detail": res}
