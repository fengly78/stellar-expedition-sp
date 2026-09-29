#!/usr/bin/env python3
"""config_completeness.py — RC1 ↔ 代码消费 双向完整性审计（游戏完整性检查 2026-09-23）。

三项检查：
  A. 消费覆盖：RC1 每个参数键是否被 game-server 代码读取（静态键 + 动态前缀族）→ 找死键。
  B. 读取闭合：代码静态读取的键是否都在 RC1 → 找缺键（fail-closed 风险点）。
  C. 分支包含：branches/*.json 的键值是否与 RC1 一致（种子叠加无漂移）。

用法：python tools/config_completeness.py   （退出码 0=完整；1=有发现）
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RC1 = ROOT / "config/rulesets/balance_rc1.json"
PHP_DIRS = [ROOT / "game-server/app"]

# 动态前缀族：代码以拼接方式读取（'SHIP.' . $x 等）——命中前缀即视为消费
DYNAMIC_PREFIXES = [
    "BUILD.", "TECH.", "SHIP.", "DEFENSE.", "REQUIRES.",
]

# 常量映射消费（regex 抓不到）：MINES 常量表 / PENDING_KEY 等
CONST_CONSUMED = {
    "RESOURCE.M.PRODUCTION", "RESOURCE.C.PRODUCTION", "RESOURCE.D.PRODUCTION",
    "ENERGY.M_DEMAND", "ENERGY.C_DEMAND", "ENERGY.D_DEMAND",   # ProductionService::MINES
    "QUEUE.BUILD.PENDING",                                     # BuildEnqueueHandler::PENDING_KEY
}

# 前瞻参数（已批准、机制未建/另有承载）：如实分类，不计为缺陷
FORWARD_DECLARED = {
    "REFUND.BUILD_STARTED", "REFUND.RESEARCH_STARTED", "REFUND.SHIP_UNDELIVERED",
    "REFUND.NOT_STARTED", "REFUND.COMPLETED",     # 退款比例：取消/退款命令不在 MVP 11 命令内
    "PROTECTION.INITIAL",                          # 新手保护时长：服务端未实现（web 单机另硬编码）
    "AI.PERSONALITY", "AI.BUDGET", "AI.RAID_MARGIN", "AI.LOSS_7D", "AI.INITIAL_STAGE",
    "AI.TARGET_POOL", "AI.TICK", "AI.RAID_LOSS_BUDGET",   # AI tick 为零作弊骨架，未读参数族
    "GOV.LOGISTICS.EXAMPLE",                      # 总督物流示例策略（GDD-06 玩家可设项）
    "VALUE.RESOURCE",                              # F-05 估值权重：python 公式函数承载（文档化）
    "WORLD.YIELD", "WORLD.ORBITS",                 # 世界生成参数：星系/殖民目标校验未实现
}

# 有意保留的备选分支（不被种子叠加，CR-004 B-alt 未采纳口径）
INTENTIONAL_BRANCH_ALTS = {"counteresp_classic_084.json"}


def php_sources() -> list[Path]:
    files: list[Path] = []
    for d in PHP_DIRS:
        files.extend(d.rglob("*.php"))
    return [f for f in files if "vendor" not in f.parts]


def main() -> int:
    data = json.loads(RC1.read_text(encoding="utf-8"))
    rc1_keys = [p["key"] for p in data["parameters"]]
    rc1_set = set(rc1_keys)
    rc1_by_key = {p["key"]: p for p in data["parameters"]}

    static_reads: dict[str, list[str]] = {}
    pat = re.compile(r"->(?:get|getFloat)\(\s*'([A-Za-z][A-Za-z0-9_.]*)'")
    for f in php_sources():
        text = f.read_text(encoding="utf-8", errors="replace")
        for m in pat.finditer(text):
            key = m.group(1)
            if not key.endswith("."):   # 'BUILD.' 等拼接字面量归动态前缀
                static_reads.setdefault(key, []).append(f.name)

    # 子键消费：读 'FLEET.FORMULA.distance' 覆盖 RC1 对象键 'FLEET.FORMULA'
    static_prefixes = {k.rsplit(".", 1)[0] for k in static_reads if "." in k}

    consumed_static = set(static_reads) | CONST_CONSUMED
    dead: list[str] = []
    for k in rc1_keys:
        if k in consumed_static or k in FORWARD_DECLARED:
            continue
        if any(k.startswith(p) for p in DYNAMIC_PREFIXES):
            continue
        if k in static_prefixes:
            continue
        dead.append(k)

    missing: list[str] = []
    for k in sorted(consumed_static - CONST_CONSUMED):
        if not k[0].isupper():
            continue   # 请求属性（game_owner_id 等）非规则键
        if k in rc1_set:
            continue
        parent, _, field = k.rpartition(".")
        pv = rc1_by_key.get(parent, {}).get("value")
        if isinstance(pv, dict) and field in pv:
            continue   # 对象参数子字段（FLEET.FORMULA.distance 等）
        missing.append(f"{k}  ← {sorted(set(static_reads.get(k, [])))}")

    # 分支包含性：子字段键（SHIP.X.field）与 RC1 对象参数比对子字段值
    branch_conflicts: list[str] = []
    for bf in sorted((ROOT / "config/rulesets/branches").glob("*.json")):
        if bf.name in INTENTIONAL_BRANCH_ALTS:
            continue
        b = json.loads(bf.read_text(encoding="utf-8"))
        for p in b.get("parameters", []):
            k = p["key"]
            if k in rc1_by_key:
                if json.dumps(rc1_by_key[k]["value"], sort_keys=True) != json.dumps(p["value"], sort_keys=True):
                    branch_conflicts.append(f"{bf.name}: {k} 值与 RC1 不一致")
            elif "." in k:
                parent, _, field = k.rpartition(".")
                pv = rc1_by_key.get(parent, {}).get("value")
                if isinstance(pv, dict) and field in pv:
                    if json.dumps(pv[field], sort_keys=True) != json.dumps(p["value"], sort_keys=True):
                        branch_conflicts.append(f"{bf.name}: {k} 子字段值与 RC1 不一致")
                else:
                    branch_conflicts.append(f"{bf.name}: {k} 父对象缺失于 RC1")
            else:
                branch_conflicts.append(f"{bf.name}: {k} 不在 RC1")

    print("=" * 64)
    print(f"RC1 参数 {len(rc1_keys)} 项；PHP 静态读取 {len(consumed_static)} 键；分支文件 {len(list((ROOT / 'config/rulesets/branches').glob('*.json')))} 个")
    print("=" * 64)

    print(f"\n[A] 死键（RC1 有、无代码消费、不属动态族）：{len(dead)}")
    for k in dead:
        print(f"  - {k}")
    print(f"\n[B] 缺键（代码静态读取、RC1 无）：{len(missing)}")
    for k in missing:
        print(f"  - {k}")
    print(f"\n[C] 分支漂移：{len(branch_conflicts)}")
    for c in branch_conflicts:
        print(f"  - {c}")

    problems = len(dead) + len(missing) + len(branch_conflicts)
    print(f"\n合计发现：{problems}")
    if problems == 0:
        print("完整性审计通过：无死键、无缺键、分支与 RC1 零漂移。")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
