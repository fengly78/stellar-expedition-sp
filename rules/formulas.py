#!/usr/bin/env python3
"""rules/formulas.py — Balance Data RC1 公式层规则模型（TEST-01 L1）

依据《新 OGame 游戏设计与工程基线 V1.3》§05.2 实现 F-01~F-07。
F-08（建筑时间）状态为 Blocked（单位与 T_min 未校准），本模块拒绝提供其实现，
调用方必须显式处理 NotImplementedError（§05.2：不得默认输出为秒或分钟）。

本模块是规则模型/测试工具（§11.1 允许先行），不是生产结算代码：
生产结算的权威实现归属服务端（PHP）与战斗/模拟（Rust），本模块作为
跨语言等价性测试的参照（V1.3 §13.3 同快照同种子同结果）。

所有数值来自 config/rulesets/balance_rc1.json；禁止在本文件硬编码候选参数
（表28 红线）。TBD 参数在加载时即报错，不得以零或默认值替代（§05.10）。
"""
from __future__ import annotations

import json
import math
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "rulesets" / "balance_rc1.json"


class ConfigTBDError(RuntimeError):
    """引用了 TBD（无冻结值）的参数。对应 §11.3：受影响模块必须拒绝启动。"""


class Ruleset:
    def __init__(self, path: Path = CONFIG_PATH):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        self.meta = data["meta"]
        self._params = {p["key"]: p for p in data["parameters"]}

    def get(self, key: str):
        p = self._params.get(key)
        if p is None:
            raise KeyError(f"配置不存在: {key}")
        if p["status"] == "TBD" or p["value"] is None:
            raise ConfigTBDError(f"参数 {key} 为 TBD，禁止以零或默认值替代（§05.10）")
        return p["value"]


# ---- F-01 升级成本：C_r(L) = ceil(C_r,1 * g^(L-1))，每种资源分别取整 ----
def upgrade_cost(base: dict, level: int) -> dict:
    if level < 1:
        raise ValueError("level 必须 >= 1")
    g = base["g"]
    if g is None:
        raise ConfigTBDError("成本倍率 g 为 TBD（如军事科技，§05.5）")
    return {r: math.ceil(base[r] * g ** (level - 1)) for r in ("M", "C", "D")}


def upgrade_cost_cumulative(base: dict, from_level: int, to_level: int) -> dict:
    """L=from+1 .. to 的累计成本（from=0 表示从零级升到 to）。"""
    total = {"M": 0, "C": 0, "D": 0}
    for lv in range(from_level + 1, to_level + 1):
        c = upgrade_cost(base, lv)
        for r in total:
            total[r] += c[r]
    return total


# ---- F-02 矿场基础产量：P(0)=0；P(L)=p*L*a^(L-1) ----
def base_production(prod: dict, level: int) -> float:
    if level < 0:
        raise ValueError("level 必须 >= 0")
    if level == 0:
        return 0.0
    return prod["p"] * level * prod["a"] ** (level - 1)


# ---- F-03 实际产量：P_actual = P(L) * e * B；e=min(1, supply/need)；need=0 时 e=1 ----
def energy_satisfaction(e_supply: float, e_need: float) -> float:
    if e_need == 0:
        return 1.0
    if e_need < 0 or e_supply < 0:
        raise ValueError("能源供需不得为负")
    return min(1.0, e_supply / e_need)


def actual_production(prod: dict, level: int, e_supply: float, e_need: float, b: float = 1.0) -> float:
    """b 只含明确启用的环境与合法修正（WORLD.YIELD 等），不含隐藏加成。"""
    return base_production(prod, level) * energy_satisfaction(e_supply, e_need) * b


# ---- F-04 仓容：S(L)=S0+S1*(g^L-1)/(g-1)，L>=0 ----
def storage_capacity(curve: dict, level: int) -> float:
    if level < 0:
        raise ValueError("level 必须 >= 0")
    s0, s1, g = curve["S0"], curve["S1"], curve["g"]
    if level == 0:
        return float(s0)
    return s0 + s1 * (g ** level - 1) / (g - 1)


# ---- F-05 内部估值：V = M + 2C + 3D（分析用，非交易汇率）----
def value_v(m: float, c: float, d: float) -> float:
    return m + 2 * c + 3 * d


# ---- F-06 殖民容量 Pmax=1+ceil(A/2)；任务槽 Fmax=2+ComputerLevel ----
def colony_cap(astro_level: int) -> int:
    if astro_level < 0:
        raise ValueError("astro_level 必须 >= 0")
    return 1 + math.ceil(astro_level / 2)


def fleet_slots(computer_level: int) -> int:
    if computer_level < 0:
        raise ValueError("computer_level 必须 >= 0")
    return 2 + computer_level


# ---- F-07 军事科技线性增益：X = X0*(1+k*L)，中心 k=0.05 ----
def military_gain(base_value: float, tech_level: int, k: float) -> float:
    if tech_level < 0:
        raise ValueError("tech_level 必须 >= 0")
    return base_value * (1 + k * tech_level)
