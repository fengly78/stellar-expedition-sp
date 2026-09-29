# -*- coding: utf-8 -*-
"""
矿脉储量系统 CR 测算（2026-09-27）。

问题框定：引入 vue-ts 矿脉机制（储量上限/位置系数/衰减保底/再生）后，
在 nova 单机线的产量曲线（objects.ts F-02 同族）下，矿脉何时枯竭、
衰减何时触发、再生能否形成循环。只算 web 线口径（SPEED=4）。

产量公式（对齐 web/src/game/objects.ts）：
  metal/h   = 30 * L * 1.1^L * posCoef * SPEED
  crystal/h = 21 * L * 1.1^L * posCoef * SPEED
  deuterium = 12 * L * 1.1^L * kt(温度) * SPEED   （kt≈1.3 中温带）
矿脉参数取 vue-ts ORE_DEPOSIT_CONFIG（50亿/30亿/15亿 基础储量 + 位置系数）。
"""
import json, io, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SPEED = 4
BASE = {"metal": 5e9, "crystal": 3e9, "deuterium": 1.5e9}
# 位置系数取 4/7/12 三档代表（内/中/外圈）
POS = {
    4:  {"metal": 0.95, "crystal": 1.10, "deuterium": 0.70},
    7:  {"metal": 1.00, "crystal": 1.00, "deuterium": 1.00},
    12: {"metal": 0.90, "crystal": 0.85, "deuterium": 1.40},
}
DECAY_START = 0.05
MIN_EFF = 0.2
REGEN_RATE = 0.01  # 每小时恢复初始储量 1%

def prod(res, level, pos_coef, temp_k=1.3):
    pf = level * 1.1 ** level
    base = {"metal": 30, "crystal": 21, "deuterium": 12}[res]
    return base * pf * pos_coef * SPEED * (temp_k if res == "deuterium" else 1)

def initial_deposit(res, pos):
    return BASE[res] * POS[pos][res]

rows = []
for pos in (4, 7, 12):
    for level in (10, 20, 30, 40, 50):
        for res in ("metal", "crystal", "deuterium"):
            pph = prod(res, level, POS[pos][res])
            dep = initial_deposit(res, pos)
            hours_to_deplete = dep / pph if pph else float("inf")
            days = hours_to_deplete / 24
            # 衰减触发点（储量降到 5%）
            hours_to_decay = dep * (1 - DECAY_START) / pph
            # 稳态：再生 1%/h 能支撑多少产量（净消耗=0 时的产量）
            steady_pph = dep * REGEN_RATE
            rows.append({
                "pos": pos, "lv": level, "res": res,
                "prod/h": round(pph), "deposit": f"{dep/1e9:.2f}G",
                "枯竭(天)": round(days, 1), "衰减触发(天)": round(hours_to_decay / 24, 1),
                "再生稳态/h": round(steady_pph),
            })

REPORTS = ROOT / "tools" / "reports"
REPORTS.mkdir(parents=True, exist_ok=True)
out_path = REPORTS / "ore-deposit-sim.json"
out = io.open(str(out_path), 'w', encoding='utf-8')
json.dump(rows, out, ensure_ascii=False, indent=1)
out.close()
print("报告已写入：%s" % out_path)

# 控制台摘要：只打关键切片
print(f"{'pos':>3} {'lv':>2} {'res':>9} {'prod/h':>12} {'deposit':>8} {'枯竭天':>8} {'衰减天':>8} {'再生稳态/h':>10}")
for r in rows:
    if r["lv"] in (20, 40) or (r["pos"] == 7 and r["lv"] in (10, 50)):
        print(f"{r['pos']:>3} {r['lv']:>2} {r['res']:>9} {r['prod/h']:>12,} {r['deposit']:>8} {r['枯竭(天)']:>8} {r['衰减触发(天)']:>8} {r['再生稳态/h']:>10,}")
