# Stellar Expedition Balance RC2 Candidate 设计规格

> 状态：Candidate  
> 日期：2026-09-30  
> 基线：`config/rulesets/balance_rc1.json`  
> 原则：RC1 已 Frozen 的经典机制不在本文件中静默覆盖；RC2 以兼容扩展、显式 override 和新增配置为主。

## 1. RC2 的目的

RC1 已经解决了第一轮“规则可执行”问题，但内容仍偏经典 OGame 骨架。RC2 的目标是把以下新设计接入同一套可版本化规则：

- 2.5D 星球建筑体系；
- 星球专精；
- 更丰富的舰船角色；
- 侦察/反侦察；
- 战术姿态；
- AI Autopilot；
- NPC AI Empire；
- 市场/物流；
- 更平滑的新手成长。

RC2 不是直接上线版本，必须经过模拟、E2E 和规则审计后才能从 Candidate 晋升 Frozen。

## 2. 兼容策略

### 2.1 Frozen 不覆盖原则

RC1 中状态为 `Frozen` 的 key：
- 不在 RC2 中以同 key 偷换值；
- 需要改变时必须登记显式 override；
- override 必须包含 rationale、old_value、new_value、migration、tests。

### 2.2 新内容 ID

新内容采用稳定业务 ID：

- 建筑：`B001...`
- 科技：`T001...`
- 舰船：`S001...`
- 防御：`D001...`
- 战术姿态：`STANCE_*`
- AI 策略：`POLICY_*`

旧 RC1 key 作为 legacy_key 保留，避免数据库、战报与旧存档失去可追溯性。

## 3. 统一资源估值

继续沿用 RC1 内部估值：

```text
V = M + 2C + 3D
```

用途：
- AI 决策；
- 平衡比较；
- PvP 收益分析；
- 舰船性价比分析。

它不是玩家市场固定汇率。

## 4. 建筑成本模型

基础式保持：

```text
cost_r(level) = ceil(base_r × growth^(level - 1))
```

RC2 增加：
- category_growth；
- max_level；
- slot_cost；
- energy_delta；
- maintenance；
- milestone_effects。

建筑时间统一抽象为：

```text
T_build =
  max(
    min_seconds,
    base_time × time_growth^(level-1)
    / build_speed
    / robotics_bonus
    / nanite_bonus
  )
```

在旧实现尚未迁移前，RC1 的线上时间函数仍为权威；RC2 公式先用于新 TypeScript 服务。

## 5. 科技成本模型

```text
cost(level) = base_cost × growth^(level-1)
T_research = base_time × time_growth^(level-1) / research_speed / lab_bonus
```

军事科技默认保持 RC1 的 5%/级线性增益，避免指数战斗膨胀。

非军事科技优先提供：
- 解锁；
- 效率；
- 可见性；
- 风险；
- 自动化；

而不是无限叠加纯百分比。

## 6. 舰船属性模型

统一属性：

- hull：结构值
- shield：护盾
- attack：基础火力
- speed：基础航速
- fuel：单位标准距离燃料系数
- cargo：货舱
- sensor：传感器
- stealth：隐匿
- signature：特征值
- evasion：规避
- role_tags：角色标签
- weapon_tags：武器标签
- target_tags：优先目标

RC1 的 A/S/H 映射：
- A → attack
- S → shield
- H → hull

## 7. 战斗角色倍率

不再大量复制旧 rapid-fire，RC2 引入有限标签克制：

| 攻击标签 | 目标标签 | 基础倍率 |
|---|---|---:|
| light | small | 1.20 |
| interceptor | bomber | 1.35 |
| heavy | capital | 1.20 |
| bomber | defense | 1.40 |
| siege | structure | 1.50 |
| ew | sensor | 1.25 |
| point_defense | fighter | 1.30 |

倍率只是候选值，仍需 Rust Monte Carlo 验证。

## 8. 战术姿态参数

| 姿态 | 速度 | 燃料 | 火力 | 生存 | 可见度 | 撤退 |
|---|---:|---:|---:|---:|---:|---:|
| Balanced | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Economy | 0.80 | 0.72 | 0.95 | 1.00 | 0.90 | 1.00 |
| Aggressive | 1.10 | 1.25 | 1.08 | 0.95 | 1.20 | 0.85 |
| Defensive | 0.90 | 1.00 | 0.92 | 1.12 | 1.00 | 1.20 |
| Stealth | 0.78 | 1.18 | 0.90 | 0.96 | 0.55 | 1.10 |
| Raid | 1.05 | 1.12 | 0.96 | 0.92 | 1.05 | 1.30 |

所有倍率必须写入 battle/fleet snapshot，确保回放一致。

## 9. 新手成长预算

目标不是“立刻送大量资源”，而是让每个系统按顺序可达：

- 0–15 分钟：矿场、能源、机器人、实验室；
- 15–45 分钟：船坞、侦察；
- 1–4 小时：运输、第一批战斗单位、PvE；
- 12–24 小时：稳定经济循环；
- Day 2–4：殖民；
- Week 1：多星球分工；
- Week 2+：中型舰队与联盟玩法。

RC2 的所有前置和成本都必须通过这条时间路径验证。

## 10. 星球专精参数

每颗星球在中期选择一个主专精，基础候选：

| 专精 | 核心增益 | 核心代价 |
|---|---|---|
| Industrial | 制造/金属效率 | 科研效率略降 |
| Research | 研究效率 | 船坞吞吐略降 |
| Energy | 能源/重氢 | 地表建筑容量较低 |
| Military | 船坞/防御/雷达 | 民用产能略低 |
| Trade | 市场/物流 | 防御成本更高 |
| Frontier | 扫描/殖民/航程 | 生产效率偏低 |

专精不能永久锁死，允许高成本重构。

## 11. 配置验证规则

RC2 配置 CI 必须验证：

1. ID 唯一。
2. legacy_key 不重复映射。
3. prerequisite 不形成环。
4. 成本非负。
5. growth >= 1。
6. max_level 合理。
7. 所有舰船至少有一个 role_tag。
8. 所有内容都能从新账号状态沿前置图到达。
9. 不能引用不存在的科技/建筑。
10. Frozen override 必须有 change_record。
11. 战斗属性可序列化进 snapshot。
12. balance_version 必须进入所有结算审计。

## 12. 晋升 Frozen 的门槛

RC2 必须同时满足：

- 30 天经济模拟无严重通胀/卡点；
- Day 1/3/7 成长目标达到设计窗口；
- 至少 1000 个 bot 的压力模拟；
- 舰队组合不存在明显单一最优；
- PvP 攻击收益中位数处于可控范围；
- 新手被攻击后恢复时间符合目标；
- AI Autopilot 不突破授权；
- 所有新配置通过 schema validator；
- RC1 存档迁移与回放测试通过。
