#!/usr/bin/env python3
"""cr_batch_apply_20260923.py —— CR 批量批准执行（所有者 2026-09-23 口头「批准」）。

批准范围（依据各 CR 文档速决卡，全部推荐「批准」）：
  CR-20260921-002  A 三仓库成本 / B 聚变成本+产出+氘耗 / C 军事科技 g=2.00
  CR-20260921-003  A H口径 floor(SI/10)（重战1200·小运500·殖民舰 50/100/3000）
                   B 五舰 speed/fuel/cargo 回填（双源：OGameX + ogamespec 经典）
                   C rapidfire 仅登记 重战→小运 = 3
                   E F-08 上游同构式 + universe_speed=1（f08 校准）
  CR-20260923-004  A SHIP.*.unit_id 202/204/205/208/210
                   B INTEL.COUNTER_ESP + INTEL.REVEAL（OGameX 现代式——已实现侧）
                   C debris_fields（已落地，归档）
  CR-20260923-005  DEFENSE 八对象 + REQUIRES.DEFENSE + 修复 70±10 + 防御残骸率 0
  经典机制组        SHIP.*.engine（含小运脉冲换挡）/ 温度系数 / 自然基础产量 / 经典比例掠夺
  附带（决策速批版 E0/W1 范围内既有结论）：
                   TIME 三族 / FLEET.FORMULA 上游常数 / REQUIRES.TECH·SHIP 最小空表（MVP 口径，
                   前置收紧留 CR 后续——登记于各条 source）

动作：参数写 status=Frozen、meta.status=Frozen、effective_at=2026-09-23；
     meta.hash 由执行者按 config_validate 输出回填（本脚本 --write-hash 步骤二）。
用法：
  python tools/cr_batch_apply_20260923.py apply     # 写入 RC1（先备份 .bak）
  python tools/cr_batch_apply_20260923.py hash DIGEST  # 回填 meta.hash
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

RC1 = Path("config/rulesets/balance_rc1.json")
APPROVED = "Frozen"
NOTE = "所有者批准 2026-09-23（CR 批量，见 tools/cr_batch_apply_20260923.py）"

# ---- 参数补丁：key → (value 覆盖/合并字典, unit, type, source 补充) ----
MERGE_INTO = {
    "BUILD.FUSION": ({"M": 150, "C": 60, "D": 30, "g": 1.5}, "M/C/D", "object", "CR-002 B"),
    "BUILD.M_STORAGE": ({"M": 1000, "C": 0, "D": 0, "g": 1.6}, "M/C/D", "object", "CR-002 A"),
    "BUILD.C_STORAGE": ({"M": 1000, "C": 500, "D": 0, "g": 1.6}, "M/C/D", "object", "CR-002 A"),
    "BUILD.D_STORAGE": ({"M": 1000, "C": 1000, "D": 0, "g": 1.6}, "M/C/D", "object", "CR-002 A"),
    "TECH.WEAPONS": ({"g": 2.0}, "M/C/D", "object", "CR-002 C"),
    "TECH.SHIELD": ({"g": 2.0}, "M/C/D", "object", "CR-002 C"),
    "TECH.ARMOUR": ({"g": 2.0}, "M/C/D", "object", "CR-002 C"),
    # 五舰（CR-003 A/B + CR-004 A + 经典机制 engine；build_time=F-08 式在 S0/N0/speed1 的锚点值）
    "SHIP.SCOUT": ({"speed": 100000000, "fuel": 1, "build_time": 3600, "unit_id": 210,
                    "engine": {"drive": "COMBUSTION", "bonus": 0.1}}, "M/C/D", "object", "CR-003 B/CR-004 A/经典机制"),
    "SHIP.SMALL_CARGO": ({"speed": 5000, "fuel": 10, "build_time": 5760, "unit_id": 202,
                          "engine": {"drive": "COMBUSTION", "bonus": 0.1,
                                     "switch": {"tech": "IMPULSE", "level": 5, "base_mul": 2, "fuel_mul": 2, "bonus": 0.2}}},
                         "M/C/D", "object", "CR-003 B/CR-004 A/经典机制(小运脉冲换挡)"),
    "SHIP.LIGHT": ({"cargo": 50, "speed": 12500, "fuel": 20, "build_time": 5760, "unit_id": 204,
                    "engine": {"drive": "COMBUSTION", "bonus": 0.1}}, "M/C/D", "object", "CR-003 B/CR-004 A/经典机制"),
    "SHIP.HEAVY": ({"cargo": 100, "speed": 10000, "fuel": 75, "build_time": 14400, "unit_id": 205,
                    "rapidfire": {"202": 3},
                    "engine": {"drive": "IMPULSE", "bonus": 0.2}}, "M/C/D", "object", "CR-003 A·B·C/CR-004 A/经典机制；rapidfire 键=目标 unit_id(202 小运)"),
    "SHIP.COLONY": ({"A": 50, "S": 100, "H": 3000, "speed": 2500, "fuel": 1000, "build_time": 43200,
                     "unit_id": 208, "engine": {"drive": "IMPULSE", "bonus": 0.2}}, "M/C/D", "object", "CR-003 A(50/100/3000)·B/CR-004 A/经典机制"),
}

# ---- 新增参数 ----
def P(key, value, unit, ptype, source, minimum=None, maximum=None):
    return {"key": key, "value": value, "unit": unit, "type": ptype,
            "minimum": minimum, "maximum": maximum, "status": APPROVED, "source": f"{source}；{NOTE}"}

NEW_PARAMS = [
    # 反侦察（CR-004 B，OGameX 现代式——实现侧）
    P("INTEL.COUNTER_ESP", {"divisor": 4, "level_offset": 1}, "参数组", "object", "CR-004 B；上游 CounterEspionageService 同构"),
    P("INTEL.REVEAL", {"gap_exponent": 2, "fields": {
        "ships": {"probes": 2, "level": 1}, "defense": {"probes": 3, "level": 2},
        "buildings": {"probes": 5, "level": 3}, "research": {"probes": 7, "level": 4}}},
      "参数组", "object", "CR-004 B；上游 EspionageMission 同构；剩余探针按存活封顶(我方更保守口径)"),
    # 战斗补充
    P("COMBAT.LOOT_SPLIT", "classic_thirds", "模式", "string", "经典机制组；上游 battle.php:108-150 同构"),
    P("COMBAT.DEFENSE_REPAIR", {"base": 70, "delta": 10}, "百分比", "object", "CR-005；上游 battle.php:32-94"),
    P("COMBAT.DEFENSE_DEBRIS_RATE", 0, "比例", "number", "CR-005；经典 did=0", 0, 1),
    # 聚变产出/氘耗（CR-002 B 公式；恒 3:1）
    P("ENERGY.FUSION", {"base": 30, "factor": 1.12}, "能源/小时", "object", "CR-002 B；产出 30L×1.12^(L-1)"),
    P("ENERGY.FUSION_DEMAND", {"base": 10, "factor": 1.12}, "重氢/小时", "object", "CR-002 B；氘耗 10L×1.12^(L-1)，氘尽停转"),
    # 经典机制组
    P("RESOURCE.D.TEMPERATURE", {"base": 1.28, "per_degree": -0.002, "offset": 40}, "系数", "object", "经典机制组；1.28-0.002×(最低温+40)"),
    P("RESOURCE.BASE_PRODUCTION", {"M": 20, "C": 10}, "每小时", "object", "经典机制组；自然基础产量"),
    # TIME 三族（F-08 上游同构式；f08 校准 speed=1）
    P("BUILD.TIME", {"model": "upstream", "constant": 2500, "universe_speed": 1, "t_min_seconds": 30,
                     "robotics_level_R": 0, "nanite_level_N": 0}, "参数组", "object", "CR-003 E；F-08 校准(sim/reports f08-calibrate)"),
    P("RESEARCH.TIME", {"model": "upstream", "constant": 1000, "lab_factor": 0, "universe_speed": 1, "t_min_seconds": 30},
      "参数组", "object", "CR-003 E；上游研究系数 1000"),
    P("SHIP.TIME", {"model": "upstream", "constant": 2500, "shipyard_level_S": 0, "nanite_level_N": 0,
                    "universe_speed": 1, "t_min_seconds": 30}, "参数组", "object", "CR-003 E；F-08 校准"),
    # 舰队公式族（SOURCE-01 审计 §1 上游式）
    P("FLEET.FORMULA", {"universe_speed": 1,
        "distance": {"same_system": 5, "per_orbit": 5, "orbit_base": 1000, "per_system": 95,
                     "system_base": 2700, "per_galaxy": 20000},
        "duration": {"constant": 35000, "base_overhead_s": 10, "speed_factor_divisor": 10},
        "fuel": {"divisor": 35000, "speed_term_base": 10, "minimum": 1}}, "参数组", "object", "SOURCE-01 §1.1-1.3 上游式；sv=每舰速度值语义(2026-09-23 实证)"),
]

# 防御八对象（CR-005，经典 0.84 权威值）
DEFENSES = {
    "ROCKET": {"M": 2000, "C": 0, "D": 0, "A": 80, "S": 20, "H": 200, "unit_id": 401, "rapidfire": {}},
    "LIGHT_LASER": {"M": 1500, "C": 500, "D": 0, "A": 100, "S": 25, "H": 200, "unit_id": 402, "rapidfire": {}},
    "HEAVY_LASER": {"M": 6000, "C": 2000, "D": 0, "A": 250, "S": 100, "H": 800, "unit_id": 403, "rapidfire": {}},
    "GAUSS": {"M": 20000, "C": 15000, "D": 2000, "A": 1100, "S": 200, "H": 3500, "unit_id": 404, "rapidfire": {}},
    "ION": {"M": 2000, "C": 6000, "D": 0, "A": 150, "S": 500, "H": 800, "unit_id": 405, "rapidfire": {}},
    "PLASMA": {"M": 50000, "C": 50000, "D": 30000, "A": 3000, "S": 300, "H": 10000, "unit_id": 406, "rapidfire": {}},
    "SMALL_DOME": {"M": 10000, "C": 10000, "D": 0, "A": 1, "S": 2000, "H": 2000, "unit_id": 407, "rapidfire": {}, "max": 1},
    "LARGE_DOME": {"M": 50000, "C": 50000, "D": 0, "A": 1, "S": 10000, "H": 10000, "unit_id": 408, "rapidfire": {}, "max": 1},
}
for name, val in DEFENSES.items():
    NEW_PARAMS.append(P(f"DEFENSE.{name}", val, "单价/属性", "object", "CR-005；经典 0.84 techs.php 权威值"))
    NEW_PARAMS.append(P(f"REQUIRES.DEFENSE.{name}", {}, "前置", "object", "CR-005；MVP 最小空表（经典实验室依赖留后续 CR 收紧）"))

# 前置最小表（TECH/SHIP 全族；MVP 口径，收紧留后续）
for tech in ["ENERGY", "COMBUSTION", "IMPULSE", "COMPUTER", "ASTRO", "ESPIONAGE", "WEAPONS", "SHIELD", "ARMOUR"]:
    NEW_PARAMS.append(P(f"REQUIRES.TECH.{tech}", {}, "前置", "object", "MVP 最小空表（前置收紧留后续 CR）"))
for ship in ["SCOUT", "SMALL_CARGO", "LIGHT", "HEAVY", "COLONY"]:
    NEW_PARAMS.append(P(f"REQUIRES.SHIP.{ship}", {}, "前置", "object", "MVP 最小空表（SOURCE-01 §2 前置树留后续 CR）"))


def apply() -> int:
    data = json.loads(RC1.read_text(encoding="utf-8"))
    shutil.copy(RC1, RC1.with_suffix(".json.bak"))

    by_key = {p["key"]: p for p in data["parameters"]}
    merged = 0
    for key, (patch, _u, _t, src) in MERGE_INTO.items():
        p = by_key.get(key)
        if p is None:
            print(f"FATAL: 未找到待合并参数 {key}")
            return 2
        v = dict(p["value"]) if isinstance(p["value"], dict) else {}
        v.update(patch)
        p["value"] = v
        p["status"] = APPROVED
        p["source"] = f"{p.get('source', '')}；{src}；{NOTE}"
        merged += 1

    existing = set(by_key)
    added = 0
    for p in NEW_PARAMS:
        if p["key"] in existing:
            print(f"FATAL: 新增参数已存在 {p['key']}")
            return 2
        data["parameters"].append(p)
        added += 1

    for f in data["formulas"]:
        if f["id"] == "F-08":
            f["status"] = APPROVED
            f["expression"] = "T=max(T_min, ceil(3600*(M+C)/(2500*(1+R)*2^N*speed)))（上游同构式）"
            f["source"] = f"{f.get('source', '')}；CR-003 E 批准；f08 校准 universe_speed=1"
            f.pop("blocker", None)

    data["meta"]["status"] = "Frozen"
    data["meta"]["effective_at"] = "2026-09-23"
    data["meta"]["hash"] = None
    data["meta"]["notes"] = ("RC1 批准冻结（2026-09-23 所有者批准 CR-002/003/004/005+经典机制组，"
                             "执行记录 tools/cr_batch_apply_20260923.py）。value=null 表示 TBD 的规则不再适用——"
                             "本版零 TBD。hash 按 config_validate 输出回填。")

    RC1.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK：合并 {merged} 项，新增 {added} 项，F-08 解封，meta→Frozen；备份 balance_rc1.json.bak")
    print("下一步：python tools/config_validate.py 取哈希 → 本脚本 hash <DIGEST>")
    return 0


def write_hash(digest: str) -> int:
    data = json.loads(RC1.read_text(encoding="utf-8"))
    data["meta"]["hash"] = digest
    RC1.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK：meta.hash = {digest}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "apply":
        sys.exit(apply())
    if len(sys.argv) >= 3 and sys.argv[1] == "hash":
        sys.exit(write_hash(sys.argv[2]))
    print(__doc__)
    sys.exit(1)
