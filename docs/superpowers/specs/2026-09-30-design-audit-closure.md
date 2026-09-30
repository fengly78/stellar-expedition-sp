# Stellar Expedition 全面设计审计、收尾与闭环

> 日期：2026-09-30
> 审计对象：当前“全新图形化 OGame”设计分支全部核心设计与 RC2 Candidate 配置。
> 审计结论：**设计发散阶段可以结束。架构、核心循环、配置权威、玩法状态机和实施 Gate 已形成闭环；数值平衡仍须通过模拟和实现验证后才能 Frozen。**

## 1. 本轮真正发现的问题

### P0 — 会导致实现错误

#### P0-01 前置条件双重真相源
实体 JSON 与 `prerequisites_rc2_candidate.json` 不一致，共发现 88 个实体存在镜像差异。

**已修复：**
- 完整前置图作为权威源；
- 已同步回四类 entity fragment；
- manifest 规定不一致即启动失败。

#### P0-02 Combat v2 输入不完整
战斗规格要求 accuracy / signature / evasion / sensor / stealth，但舰船配置此前没有这些字段。

**已修复：**
新增 `tactical_stats_rc2_candidate.json`，22 艘舰全部覆盖。

#### P0-03 命中公式存在未定义语义
此前 `signature_inverse_norm` 没有明确归一化方法。

**已修复：**
改成固定 0–100 属性尺度和精确公式，禁止运行时猜默认归一化。

#### P0-04 RC1 → RC2 仓库迁移会丢等级
RC1 是 Metal/Crystal/Deuterium 三种仓库，RC2 视觉目录只有一个 B005。

**已修复：**
B005 改成 composite facility：
- METAL_STORAGE
- CRYSTAL_STORAGE
- DEUTERIUM_STORAGE

一个 2.5D 建筑外观，三个权威 component level。

#### P0-05 旧 ID 没有完整迁移表
一次性重写如果没有显式 mapping，旧舰队/建筑/科技可能丢失或错映射。

**已修复：**
新增 `legacy_mapping_rc2_candidate.json`。

### P1 — 会导致玩法闭环断裂

#### P1-01 45 分钟 Scout 目标不可达
Scout 完整前置链累计成本约 16.4k V，而旧模拟起始资源只有 500M/500C/0D。

**已修复设计：**
引入一次性 Tutorial Grant，并作为显式系统 Source 进入账本和 Source/Sink 模拟。

最终大小仍需要 Simulator 校准，不能直接 Frozen。

#### P1-02 星球只有初始/最大槽位，没有扩容路径
**已修复：**
Base Tier T0–T4 明确决定 Surface / Underground / Orbit 容量。

#### P1-03 “所有建筑是否必须放得下”语义不清
审计计算：
- Surface 全设施 slot cost：28
- Surface Max：24
- Orbit 全设施 slot cost：16
- Orbit Max：10

**设计裁决：**
这不是 bug。单星球不能容纳所有设施，强制专业化和多星球产业分工。

#### P1-04 Combat 克制表存在死标签
`bomber -> defense` 原本没有单位带通用 defense 标签；
`dreadnought -> structure` 也没有有效 target。

**已修复：**
- 所有防御实体增加 `defense`；
- 战略防御核心增加 `structure`。

#### P1-05 Combat multiplier 双重配置
Balance 与 Combat 文件同时存一份克制倍率，未来一定漂移。

**已修复：**
只保留 `combat_rc2_candidate.json` 为战斗倍率权威源。

#### P1-06 新手 Power Score 不可执行
原方案使用“归一化 economy/research/military”，但没有归一化基准。

**已修复：**
固定为可审计 V 公式，并引入 7 日军事峰值防止故意降分。

#### P1-07 AI 与玩家命令竞争未定义
**已修复：**
优先级：
```text
PLAYER_MANUAL
> AUTOPILOT_DEFENSIVE_EMERGENCY
> AUTOPILOT_MAINTENANCE
```

#### P1-08 市场成交失败路径不完整
此前只写“物流有时间”，没有 escrow、失败、半交割语义。

**已修复：**
Beta1 固定 OPEN → MATCHED → IN_TRANSIT → DELIVERED，双方 escrow，原子交割，不允许部分成交。

#### P1-09 Vertical Slice 缺世界/PvE 配置
**已修复：**
新增 `universe_pve_rc2_candidate.json` 和对应规格。

## 2. 结构验证结果

当前 RC2 Candidate：

| 类型 | 数量 |
|---|---:|
| Buildings | 34 |
| Technologies | 31 |
| Ships | 22 |
| Defenses | 12 |
| Tactical Ship Definitions | 22 |

静态审计结果：

- dangling ID：0
- prerequisite level > max：0
- Building/Technology cycle：0
- prerequisite mirror mismatch：0
- missing building placement：0
- missing tactical ship definition：0
- duplicated combat authority：0
- invalid legacy mapping target：0

这意味着**配置结构现在可以进入 Validator 实现阶段**。

## 3. 唯一权威规则

总入口：

`config/rulesets/ruleset_manifest_rc2_candidate.json`

任何服务端模块都不得自己选择“哪个 JSON 更可信”。

编译链：

```text
RC1 Frozen base
→ RC2 entity fragments
→ prerequisite verification
→ planet layout
→ tactical stats
→ protection/autopilot
→ combat
→ universe/PvE
→ economy calibration
→ legacy mapping
→ semantic validator
→ content hash
→ Compiled Ruleset
```

## 4. 核心玩法闭环

已经形成：

```text
Resource
→ Build / Research
→ Shipyard
→ Scout
→ Intel
→ Fleet Mission
→ PvE / PvP
→ Battle
→ Loot / Debris / Loss
→ Repair / Rebuild / Trade
→ Expansion
→ Specialization
→ Alliance / Territory
→ Long-term Sink
```

离线闭环：

```text
Player Policy
→ Autopilot Planner
→ Normal Command
→ Domain Validation
→ Worker
→ Audit
→ Offline Summary
```

不存在“AI 直接改 DB”的旁路。

## 5. 经济闭环

### Source
- 基础生产
- Tutorial Grant
- PvE Reward
- PvP Loot
- Debris
- Event Reward
- Market Transfer（不是全服 Source）

### Sink
- 建筑
- 科技
- 舰船
- 防御
- 燃料
- 市场税
- 高级维护
- Alliance Project
- 战损

### Transfer
必须与 Source/Sink 分开统计：
- 玩家市场
- 玩家运输
- 联盟内部转移

否则会错误计算通胀。

## 6. 战斗闭环

输入：
- self-contained snapshot
- ruleset_version
- engine_version
- seed

计算：
- EW
- targeting
- hit
- shield/hull
- special ability
- retreat
- victory

输出：
- battle result
- replay event stream
- destroyed units
- debris basis
- retreat result

经济结算由领域服务完成，Rust 不写数据库。

## 7. PvP / 新手保护闭环

已覆盖：
- P0/P1/P2/P3
- Power Score
- 攻击实力比
- Aggressor Window
- 重复攻击衰减
- Protected Resource
- Recovery
- Return Shield
- Alliance War 与保护边界

仍需人口模拟确认参数，不再需要继续发明规则。

## 8. 2.5D UI 闭环

2.5D 不是权威状态。

```text
Server slot/building state
→ visual stage
→ scene anchor
→ animation
```

客户端不能通过拖动模型直接改变服务端位置。

低端设备与无障碍模式可退化为区域列表，不损失功能。

## 9. 市场/联盟闭环

Beta1 市场：
- escrow
- match
- non-interceptable timed logistics
- atomic delivery
- tax sink
- idempotent technical rollback

明确延后：
- 商队拦截
- 市场保险
- 部分交割
- 舰船/模块自由市场

联盟已覆盖：
- roles
- shared intel
- markers
- war
- project
- protected-player boundary
- audit

## 10. 架构审计

新主链路继续采用：

- React + TypeScript
- TypeScript API
- TypeScript Worker
- Rust Combat
- MariaDB
- Nginx
- 单 VPS 起步

仓库现有 `game-server/` PHP/Laravel 是遗留参考实现，不是新生产架构。

`server/` 当前仍是未初始化占位，因此下一阶段必须在新 TypeScript Server 初始化后，把 Ruleset Compiler/Validator 作为第一批基础模块。

## 11. 仍然没有“验证完成”的内容

必须明确区分：

### 设计已闭环，但尚未实证
- 34 建筑具体成本
- 31 科技具体成本
- 22 舰属性
- Tactical 0–100 参数
- Role multipliers
- Tutorial Grant 大小
- Day1/3/7/14/30 资产区间
- PvE 奖励
- New Player ratio threshold
- Autopilot 8–12% 优势目标

这些仍是 Candidate。

只有 Simulator / Combat Harness / E2E 有证据后才允许 Frozen。

## 12. 不再继续扩的设计

在第一个 Beta 前冻结以下范围，不继续增加系统：

- 不增加更多建筑
- 不增加更多科技
- 不增加更多舰种
- 不做舰船自由装配/模块系统
- 不做实时 RTS 战斗
- 不做可拦截市场商队
- 不做原生 iOS/Android App
- 不做 Kubernetes/微服务
- 不让 LLM 获得无限游戏权限
- 不做复杂联盟政治树
- 不做付费数值加速设计

这些内容如以后需要，走新 Design Change Request。

## 13. 下一阶段的唯一主线

设计结束后按以下顺序：

1. Ruleset Compiler + Validator
2. Legacy Migration Validator
3. 24h/30d Economy Simulator v2
4. Rust Combat v2 Harness
5. TypeScript Domain + Worker
6. 2.5D Planet Vertical Slice
7. Galaxy + Scout + PvE
8. Autopilot v1
9. PvP Protection
10. Market/Alliance Beta1
11. Migration rehearsal
12. Release Gates

## 14. 最终设计状态

**Architecture：Closed for implementation**

**Core Gameplay：Closed for implementation**

**Ruleset Structure：Closed for implementation**

**Migration Semantics：Closed for implementation**

**Balance Values：Candidate — requires evidence**

**Art assets / visual production：Implementation backlog**

从这一点开始，继续大量写玩法文档会降低效率。新需求必须先判断是否阻塞 Vertical Slice；不阻塞则进入 Backlog。
