#!/usr/bin/env python3
"""config_validate.py — 版本化配置完整性校验（V1.3 §11.3 / §05.10 / GAP-02）

用法：
    python tools/config_validate.py [config/rulesets/balance_rc1.json]

校验规则（对应基线条款）：
  1. meta 必填字段齐全（§11.3：ruleset_version、status、hash 等）
  2. 每条参数必填字段齐全：key/value/unit/type/minimum/maximum/status/source（§11.3）
  3. status ∈ {Candidate, Testing, Frozen, TBD}；value=null 必须 status=TBD，反之亦然
  4. 数值型参数在 minimum/maximum 范围内（§11.3 范围校验）
  5. 跨字段关系：WORLD.YIELD Poor<=Normal<=Rich；STORAGE.CURVE g>1；F-06/F-07 引用存在（§11.3 跨字段）
  6. TBD 参数按模块归属汇总为阻塞清单——受影响模块必须拒绝启动（§11.3），
     不得以零或默认值替代（§05.10 / GDD-10 验收）
  7. 计算内容哈希并报告；meta.hash 为空时提示回填（§11.3 hash 字段）

退出码：0 = 结构校验通过（TBD 以警告列出）；2 = 结构错误；1 = 用法错误。
"""
from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

ALLOWED_STATUS = {"Candidate", "Testing", "Frozen", "TBD"}
REQUIRED_META = ["ruleset_version", "core_version", "status", "created_at"]
REQUIRED_PARAM_FIELDS = ["key", "value", "unit", "type", "minimum", "maximum", "status", "source"]
ALLOWED_TYPES = {"integer", "number", "string", "boolean", "object", "array"}

# 模块 → 必需参数 key（TBD 将阻塞对应模块启动，§11.3）
MODULE_REQUIREMENTS = {
    "economy": [
        "RESOURCE.M.PRODUCTION", "RESOURCE.C.PRODUCTION", "RESOURCE.D.PRODUCTION",
        "ENERGY.SOLAR", "ENERGY.M_DEMAND", "ENERGY.C_DEMAND", "ENERGY.D_DEMAND",
        "STORAGE.CURVE", "BUILD.METAL_MINE", "BUILD.CRYSTAL_MINE", "BUILD.DEUT_SYNTH",
        "BUILD.SOLAR", "BUILD.FUSION", "BUILD.M_STORAGE", "BUILD.C_STORAGE", "BUILD.D_STORAGE",
        "BUILD.ROBOTICS",
    ],
    "research": ["TECH.ENERGY", "TECH.IMPULSE", "TECH.ESPIONAGE", "TECH.ASTRO", "BUILD.LAB"],
    "shipyard": ["BUILD.SHIPYARD", "SHIP.SCOUT", "SHIP.SMALL_CARGO", "SHIP.LIGHT", "SHIP.HEAVY", "SHIP.COLONY"],
    "fleet": ["SHIP.SCOUT", "SHIP.SMALL_CARGO", "SHIP.LIGHT", "SHIP.HEAVY", "SHIP.COLONY", "TECH.COMPUTER"],
    "combat": ["SHIP.LIGHT", "SHIP.HEAVY", "COMBAT.LOOT_RATE", "COMBAT.DEBRIS_RATE", "COMBAT.TECH_GAIN",
               "TECH.WEAPONS", "TECH.SHIELD", "TECH.ARMOUR"],
    "colony": ["SHIP.COLONY", "TECH.ASTRO", "WORLD.ORBITS"],
    "protection": ["PROTECTION.INITIAL"],
    "ai": ["AI.PERSONALITY", "AI.BUDGET", "AI.RAID_MARGIN", "AI.LOSS_7D", "AI.INITIAL_STAGE",
           "AI.TARGET_POOL", "AI.TICK", "AI.RAID_LOSS_BUDGET"],
    "governor": ["GOV.LOGISTICS.EXAMPLE"],
}


def fail(errors: list[str], msg: str) -> None:
    errors.append(msg)


def content_hash(data: dict) -> str:
    """**去掉 meta.hash 之后**文档的 canonical sha256 —— 即 meta.hash 的可验证口径。

    抽成独立函数是因为这个口径必须在「校验处 / 测试 / 文档」三处一致；
    口径一旦漂移，「冻结性验证」就等于失效而没人察觉。
    """
    stripped = copy.deepcopy(data)
    stripped.get("meta", {}).pop("hash", None)
    return hashlib.sha256(
        json.dumps(stripped, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()


def validate(path: Path) -> int:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FATAL: 无法读取或解析配置 {path}: {exc}")
        return 2

    meta = data.get("meta", {})
    for f in REQUIRED_META:
        if f not in meta or meta[f] in (None, ""):
            fail(errors, f"meta 缺少必填字段: {f}")

    params = data.get("parameters", [])
    if not isinstance(params, list) or not params:
        fail(errors, "parameters 为空或不是数组")
        params = []

    by_key: dict[str, dict] = {}
    tbd_keys: list[str] = []

    for i, p in enumerate(params):
        where = p.get("key", f"parameters[{i}]")
        for f in REQUIRED_PARAM_FIELDS:
            if f not in p:
                fail(errors, f"{where}: 缺少字段 {f}")
        st = p.get("status")
        if st not in ALLOWED_STATUS:
            fail(errors, f"{where}: 非法 status={st!r}")
        if p.get("type") not in ALLOWED_TYPES:
            fail(errors, f"{where}: 非法 type={p.get('type')!r}")
        v = p.get("value")
        if v is None and st != "TBD":
            fail(errors, f"{where}: value=null 但 status={st!r}（TBD 必须显式标记）")
        if v is not None and st == "TBD":
            fail(errors, f"{where}: status=TBD 但 value 非空（TBD 不得以零或默认值填充）")
        if st == "TBD":
            tbd_keys.append(where)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            lo, hi = p.get("minimum"), p.get("maximum")
            if isinstance(lo, (int, float)) and v < lo:
                fail(errors, f"{where}: value {v} < minimum {lo}")
            if isinstance(hi, (int, float)) and v > hi:
                fail(errors, f"{where}: value {v} > maximum {hi}")
        if p.get("key") in by_key:
            fail(errors, f"{where}: key 重复")
        by_key[p.get("key", where)] = p

    # 跨字段关系
    wy = by_key.get("WORLD.YIELD", {}).get("value") or {}
    if wy and not (wy.get("Poor", 0) <= wy.get("Normal", 0) <= wy.get("Rich", 0)):
        fail(errors, "WORLD.YIELD: 必须满足 Poor<=Normal<=Rich")
    sc = by_key.get("STORAGE.CURVE", {}).get("value") or {}
    if sc and not sc.get("g", 0) > 1:
        fail(errors, "STORAGE.CURVE: g 必须 > 1")
    for p in params:
        fid = p.get("formula")
        if fid and not any(f.get("id") == fid for f in data.get("formulas", [])):
            fail(errors, f"{p.get('key')}: 引用了不存在的公式 {fid}")

    # 模块阻塞分析
    print("=" * 60)
    print(f"配置: {path.name}  规则集: {meta.get('ruleset_version')}  状态: {meta.get('status')}")
    print("=" * 60)
    blocked_modules = {}
    for mod, keys in MODULE_REQUIREMENTS.items():
        missing = [k for k in keys if k not in by_key]
        tbd = [k for k in keys if k in tbd_keys]
        # 对象内 null 字段（如 SHIP.*.speed=null）也算部分阻塞
        partial = []
        for k in keys:
            v = by_key.get(k, {}).get("value")
            if isinstance(v, dict):
                null_fields = [kk for kk, vv in v.items() if vv is None]
                if null_fields:
                    partial.append(f"{k}({','.join(null_fields)})")
        if missing or tbd or partial:
            blocked_modules[mod] = (missing, tbd, partial)

    if blocked_modules:
        print("\n[TBD 阻塞清单 —— 受影响模块必须拒绝启动（§11.3）]")
        for mod, (missing, tbd, partial) in blocked_modules.items():
            print(f"  模块 {mod}: BLOCKED")
            for k in missing:
                print(f"    - 缺失参数: {k}")
            for k in tbd:
                print(f"    - TBD: {k}")
            for k in partial:
                print(f"    - 字段 TBD: {k}")
    else:
        print("\n所有登记模块配置完整（无 TBD 阻塞）")

    # 内容哈希
    #
    # 2026-09-29：把「计算」升级为「比对」，并修正了「比对什么」这个更根本的问题。
    #
    # ① 为什么此前从未比对：这里只在 meta.hash 为**空**时提示回填，从不与内容比对。
    #    于是 balance_rc1.json 的 meta.hash 早已漂移却一直没人发现。
    #    后果：保护冻结规则集的**只有流程和纪律，没有代码**。
    #
    # ② 比对口径必须排除 meta.hash 自身：`meta.hash` 就**在被哈希的文档内部**，
    #    若拿「整文件哈希」去比，数学上永远不可能相等（自指不动点不存在）。
    #    DB 侧之所以自洽，是因为 hash 存在**单独的列**里、不在 content_json 内。
    #    故此处的不变量定义为：**去掉 meta.hash 后**文档的 canonical sha256。
    #    （这一点是写脚本时被自己的安全检查拦下来的：最初按整文件哈希回填，
    #      校验直接报「回填后整文件哈希与写入值不符」。）
    _stripped = {k: v for k, v in data.items()}
    _meta = dict(_stripped.get("meta") or {})
    _meta.pop("hash", None)
    _stripped["meta"] = _meta
    content_sha = content_hash(data)
    whole_sha = hashlib.sha256(
        json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    print(f"\n内容哈希 sha256（不含 meta.hash）: {content_sha}")
    print(f"整文件 sha256（含 meta.hash，仅供对照）: {whole_sha}")

    claimed = str(meta.get("hash") or "").strip()
    if not claimed:
        warnings.append("meta.hash 为空，评审通过后应回填「不含 meta.hash 的内容哈希」")
    elif claimed != content_sha:
        # 报 ERROR 而非 WARN：hash 与内容不符意味着「冻结」这一承诺无法被验证，
        # 继续放行等于让冻结性彻底失去机器约束。
        errors.append(
            f"meta.hash 与内容不符（声称 {claimed[:16]}…，实际 {content_sha[:16]}…）："
            "配置被改动或 hash 未同步回填；冻结规则集失去机器约束"
        )
    else:
        print("  meta.hash 与内容一致（冻结性可验证）")

    print(f"\n参数总数: {len(params)}；TBD: {len(tbd_keys)}；公式: {len(data.get('formulas', []))}")
    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        print(f"\n结构错误 {len(errors)} 项:")
        for e in errors:
            print(f"  ERROR: {e}")
        return 2
    print("\n结构校验通过。注意：Candidate/TBD 不等于已验证，冻结须 SIM 报告支持（§05.1）。")
    return 0


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("config/rulesets/balance_rc1.json")
    sys.exit(validate(target))
