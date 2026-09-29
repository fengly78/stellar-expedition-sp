#!/usr/bin/env python3
"""sim/sim01.py — SIM-01 首周行为矩阵（V1.3 §06.2）

四类行为机器人 × 单行星四建筑纵切：
- Normal：每 4h 检查，每日睡眠 8h
- Active：白天每 1.5h 检查（同样 8h 睡眠）
- Casual：每天约 1.5 次（每 16h 一次）
- Governor：与 Normal 同策略，但建筑完成时立即接续已授权计划（§06.2：只自动接续授权计划）

指标（§05.9 登记目标，本报告 gate_evidence=false 仅供机制回归）：
- K-E05 仓满未入库产量占理论产量比：Normal<5%，Casual<10%
- K-E06 能源满足率 ≥90% 的时间占比（阈值待定的部分按"低于 90% 的秒数占比"输出）
- K-E07 Normal 非睡眠被迫闲置时间占比 <25%（近似：清醒检查点上"想建但建不起"
  的检查间隔计为被迫闲置）
"""
from __future__ import annotations

import heapq
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rules.formulas import Ruleset, upgrade_cost, value_v  # noqa: E402
from sim.engine import Engine, Event, Planet  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANCH = ROOT / "config" / "rulesets" / "branches" / "sim01_time_assumptions.json"

BUILD_KEYS = {"METAL_MINE": "BUILD.METAL_MINE", "CRYSTAL_MINE": "BUILD.CRYSTAL_MINE",
              "DEUT_SYNTH": "BUILD.DEUT_SYNTH", "SOLAR": "BUILD.SOLAR",
              "M_STORAGE": "BUILD.M_STORAGE", "C_STORAGE": "BUILD.C_STORAGE",
              "D_STORAGE": "BUILD.D_STORAGE", "FUSION": "BUILD.FUSION"}
STORAGE_OF_RES = {"M": "M_STORAGE", "C": "C_STORAGE", "D": "D_STORAGE"}
ALL_BUILDINGS = tuple(BUILD_KEYS)


def make_cost_getter(rs: Ruleset, branch: dict):
    """RC1 主配置优先；TBD 项回落到实验分支候选值（均未批准则报错）。"""
    exp = branch.get("experimental_buildings", {})

    def get(key: str):
        try:
            return rs.get(key)
        except Exception:
            if key in exp:
                return exp[key]
            raise
    return get


class Bot:
    """行为基类。wake(now) 返回本次是否应醒来检查。

    建筑排队（02.2 + QUEUE.BUILD.PENDING=3）：排队不等于已支付；
    前序完成时从队列取出下一项，重新校验并扣费后才创建执行任务。
    """

    PENDING_MAX = 3  # QUEUE.BUILD.PENDING（RC1 候选值）

    def __init__(self, eng: Engine, tm: dict, energy_policy: str = "solar"):
        self.eng = eng
        self.tm = tm
        self.energy_policy = energy_policy  # 'solar' = 纯太阳能；'mix' = 太阳能+聚变混合
        self.busy_until = 0.0
        self.next_check = 0.0
        self.pending: list[str] = []   # 待执行计划（未支付）
        self.awake_time = 0.0
        self.forced_idle = 0.0
        self._idle_since = None

    def asleep(self, now: float) -> bool:
        return (now / 3600) % 24 >= 16

    def interval(self) -> float:
        raise NotImplementedError

    def auto_manage_queue(self) -> bool:
        """Governor 在完成事件时自动续排；人类行为只在清醒检查时排队列。"""
        return False

    def pick_target(self) -> str:
        p = self.eng.planet
        # 仓库 urgency：库存接近仓容 80% 且未在排，优先扩仓（K-E05 治理手段）
        for r in ("M", "C", "D"):
            sb = STORAGE_OF_RES[r]
            if p.inv[r] > 0.8 * p.cap(r) and self.pending.count(sb) == 0:
                return sb
        supply, need = p.energy()
        if need > supply:
            # 能源缺口：mix 策略在聚变等级低于太阳能时优先聚变（密度价值）
            if self.energy_policy == "mix" and p.fusion_model and \
                    p.levels["FUSION"] < p.levels["SOLAR"] and self.pending.count("FUSION") == 0:
                return "FUSION"
            if self.pending.count("SOLAR") == 0:
                return "SOLAR"
        # 虚拟等级 = 当前等级 + 队列中已在排的同建筑数量，避免队列堆同一建筑
        virtual = {b: p.levels[b] + self.pending.count(b)
                   for b in ("METAL_MINE", "CRYSTAL_MINE", "DEUT_SYNTH")}
        return min(virtual, key=lambda b: virtual[b])

    def fill_queue(self) -> None:
        while len(self.pending) < self.PENDING_MAX:
            self.pending.append(self.pick_target())

    def start_next(self, now: float) -> bool:
        """从前序完成或唤醒处启动队列下一项：重新校验 + 扣费 + 创建执行任务。"""
        if now < self.busy_until or not self.pending:
            return False
        target = self.pending[0]
        p = self.eng.planet
        cost = upgrade_cost(self.eng.cost_getter(BUILD_KEYS[target]), p.levels[target] + 1)
        if not self.eng.pay(cost):   # 开始执行时再次校验（02.2）；付不起则留在队列
            return False
        self.pending.pop(0)
        t = self.eng.build_time(cost, self.tm)
        self.busy_until = now + t
        self.eng.schedule(now + t, "complete_building", building=target)
        self.eng.log.append({"t": now, "event": "start", "building": target,
                             "level": p.levels[target] + 1, "cost": cost, "duration_s": t})
        return True

    def maybe_act(self, now: float) -> None:
        if now < self.next_check:
            return
        interval = self.interval()
        self.next_check = now + interval
        if self.asleep(now):
            return
        self.awake_time += interval
        self.fill_queue()
        if self.start_next(now):
            self._idle_since = None
        elif now >= self.busy_until and self.pending:
            # 队列有计划但付不起：被迫闲置（K-E07 近似口径）
            if self._idle_since is None:
                self._idle_since = now
            self.forced_idle += interval

    def on_complete(self, now: float) -> None:
        if self.asleep(now):
            return
        if self.auto_manage_queue():
            self.fill_queue()
        self.start_next(now)


class NormalBot(Bot):
    def interval(self) -> float:
        return 4 * 3600


class ActiveBot(Bot):
    def interval(self) -> float:
        return 1.5 * 3600


class CasualBot(Bot):
    def interval(self) -> float:
        return 16 * 3600


class GovernorBot(NormalBot):
    def auto_manage_queue(self) -> bool:
        return True  # 总督：完成事件时自动续排已授权计划并立即接续


BOTS = {"Normal": NormalBot, "Active": ActiveBot, "Casual": CasualBot, "Governor": GovernorBot}


def run_one(name: str, rs: Ruleset, branch: dict, energy_policy: str = "solar") -> dict:
    tm = branch["time_model"]
    inp = branch["sim01_input"]
    planet = Planet(rs, inp["home_planet"]["inventory"],
                    fusion_model=branch.get("fusion_model") if energy_policy == "mix" else None)
    eng = Engine(rs, planet)
    eng.cost_getter = make_cost_getter(rs, branch)  # TBD 项回落实验分支候选值
    bot = BOTS[name](eng, tm, energy_policy)

    record_at = {h * 3600 for h in inp["record_hours"]}
    t_end = inp["window_hours"] * 3600
    for t in sorted(record_at):
        eng.schedule(t, "_record")
    for h in range(0, inp["window_hours"] + 1):
        eng.schedule(h * 3600, "_bot")
    eng.schedule(t_end + 1, "_end")

    series, milestones = [], {}
    while eng.queue:
        ev = heapq.heappop(eng.queue)
        eng.settle_to(ev.at)
        eng.now = ev.at
        if ev.kind == "complete_building":
            planet.levels[ev.payload["building"]] += 1
            b, lv = ev.payload["building"], planet.levels[ev.payload["building"]]
            eng.log.append({"t": ev.at, "event": "complete", "building": b, "level": lv})
            milestones.setdefault(f"{b}_L{lv}", round(ev.at / 3600, 2))
            bot.on_complete(ev.at)
        elif ev.kind == "_bot":
            bot.maybe_act(ev.at)
        if ev.at in record_at and (not series or series[-1]["hour"] != ev.at / 3600):
            supply, need = planet.energy()
            series.append({"hour": ev.at / 3600,
                           "inventory": {r: round(planet.inv[r], 1) for r in ("M", "C", "D")},
                           "levels": dict(planet.levels),
                           "energy_satisfaction": 1.0 if need == 0 else round(min(1, supply / need), 3)})
        if ev.at > t_end:
            break

    produced = planet.produced
    cap_loss_ratio = {r: (planet.cap_loss[r] / produced[r] if produced[r] > 0 else 0.0) for r in ("M", "C", "D")}
    worst_cap_loss = max(cap_loss_ratio.values())
    # §06.1 资产口径：库存按现值、建筑按实际累计投入（consumed 即已付成本）；
    # 库存与已投入互斥（支付时库存转出为建筑资产），不重复计价。
    asset_v = value_v(planet.inv["M"], planet.inv["C"], planet.inv["D"]) + \
        value_v(planet.consumed["M"], planet.consumed["C"], planet.consumed["D"])
    metrics = {
        "K-E05_worst_cap_loss_ratio": round(worst_cap_loss, 4),
        "K-E06_energy_low_time_ratio": round(eng.energy_low_time / t_end, 4),
        "K-E07_forced_idle_ratio": round(bot.forced_idle / bot.awake_time, 4) if bot.awake_time else None,
        "asset_value_v": round(asset_v, 1),
    }
    return {
        "behavior": name,
        "time_series": series,
        "milestones_hours": milestones,
        "metrics": metrics,
        "totals": {"produced": {r: round(produced[r], 1) for r in ("M", "C", "D")},
                   "consumed": {r: round(planet.consumed[r], 1) for r in ("M", "C", "D")},
                   "cap_loss": {r: round(planet.cap_loss[r], 1) for r in ("M", "C", "D")}},
        "conservation": eng.conservation_check(),
        "events": len(eng.log),
    }


def main() -> None:
    branch = json.loads(BRANCH.read_text(encoding="utf-8"))
    rs = Ruleset()
    runs = [run_one(name, rs, branch) for name in ("Normal", "Active", "Casual", "Governor")]
    # CR-002 提案 B 对比试验：Normal ×（纯太阳能 vs 太阳能+聚变）
    fusion_trial = {
        "solar_only": run_one("Normal", rs, branch, "solar"),
        "solar_plus_fusion": run_one("Normal", rs, branch, "mix"),
    }
    by_name = {r["behavior"]: r for r in runs}
    v_normal = by_name["Normal"]["metrics"]["asset_value_v"]
    # F-09：G = V_governor/V_normal − 1；V_normal=0 标不可计算（此处不会为 0，仍显式防护）
    governor_advantage = None if v_normal == 0 else round(
        by_name["Governor"]["metrics"]["asset_value_v"] / v_normal - 1, 4)
    comparisons = {
        "K-E10_governor_advantage_F09": {
            "value": governor_advantage,
            "reference_gate": "理想 0~5%；可接受 ≤10%；10~15% 警告；>15% 失败（§05.9，此处仅机制展示）",
        },
        "asset_ratio_vs_normal": {
            name: round(by_name[name]["metrics"]["asset_value_v"] / v_normal, 3)
            for name in ("Active", "Casual", "Governor")
        },
    }
    report = {
        "run_id": f"sim01-matrix-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        "core_version": rs.meta["core_version"],
        "ruleset": rs.meta["ruleset_version"],
        "time_model": {"source": BRANCH.name, "status": branch["time_model"]["unit_status"]},
        "gate_evidence": False,
        "gate_note": "实验时间假设下的机制回归。K-E 阈值判定仅作参考展示，不构成 Gate 通过证据（§06.2）。",
        "reference_thresholds": {"K-E05": {"Normal": 0.05, "Casual": 0.10}, "K-E07": {"Normal": 0.25}},
        "comparisons": comparisons,
        "fusion_trial": fusion_trial,
        "runs": runs,
    }
    out = ROOT / "sim" / "reports" / f"{report['run_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"报告: {out}")
    hdr = f"{'行为':<9} {'事件':>4} {'守恒':>4} {'K-E05仓损':>9} {'K-E06低能占比':>12} {'K-E07闲置':>9}  168h 等级(M/C/D/S)  168h 库存 M/C/D"
    print(hdr)
    for r in runs:
        m = r["metrics"]
        lv = r["time_series"][-1]["levels"]
        inv = r["time_series"][-1]["inventory"]
        print(f"{r['behavior']:<9} {r['events']:>4} "
              f"{'OK' if r['conservation']['ok'] else 'FAIL':>4} "
              f"{m['K-E05_worst_cap_loss_ratio']:>9.3f} {m['K-E06_energy_low_time_ratio']:>12.3f} "
              f"{(m['K-E07_forced_idle_ratio'] or 0.0):>9.3f}  "
              f"{lv['METAL_MINE']}/{lv['CRYSTAL_MINE']}/{lv['DEUT_SYNTH']}/{lv['SOLAR']}"
              f"{'':>6}{inv['M']:.0f}/{inv['C']:.0f}/{inv['D']:.0f}")
    print(f"\n资产价值 V（库存+累计投入，§06.1 口径）："
          + "  ".join(f"{n}={by_name[n]['metrics']['asset_value_v']:.0f}" for n in ("Normal", "Active", "Casual", "Governor")))
    print(f"K-E10 总督优势 F-09: {governor_advantage:+.2%}（参考 Gate：理想 0~5%，可接受 ≤10%，>15% 失败）")
    print(f"资产比 vs Normal: {comparisons['asset_ratio_vs_normal']}")

    print("\n[提案 B 对比试验] Normal 行为 × 能源路线（168h）")
    for label, r in fusion_trial.items():
        m = r["metrics"]
        lv = r["time_series"][-1]["levels"]
        inv = r["time_series"][-1]["inventory"]
        print(f"  {label:<18} 资产V={m['asset_value_v']:>8.0f}  K-E06低能={m['K-E06_energy_low_time_ratio']:.3f}  "
              f"K-E05仓损={m['K-E05_worst_cap_loss_ratio']:.3f}  "
              f"等级(M/C/D/S/F)={lv['METAL_MINE']}/{lv['CRYSTAL_MINE']}/{lv['DEUT_SYNTH']}/{lv['SOLAR']}/{lv['FUSION']}  "
              f"D库存={inv['D']:.0f}  氘消耗={r['totals']['consumed']['D']:.0f}  守恒={'OK' if r['conservation']['ok'] else 'FAIL'}")


if __name__ == "__main__":
    main()
