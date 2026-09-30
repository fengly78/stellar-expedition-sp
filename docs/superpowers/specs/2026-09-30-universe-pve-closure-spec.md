# Stellar Expedition 宇宙拓扑与 PvE 闭环规格 v0.1

> 状态：Candidate
> 日期：2026-09-30
> 目的：补齐 Vertical Slice 中“Galaxy → 侦察 → PvE → 战斗 → 奖励 → 战报”的世界规则闭环。

## 1. 宇宙拓扑

首轮候选容量：

- Galaxy：5
- System / Galaxy：250
- Orbit Slot / System：15
- 坐标从 1 开始
- Deep Space Node 不消耗殖民轨道

这些都是服务端配置，不写死在客户端。

## 2. Orbit Slot

Orbit Slot 状态：

- EMPTY
- PLAYER_PLANET
- NPC_PLANET
- DEBRIS
- TEMPORARY_EVENT

同一坐标只能存在一个主占用实体，但 Debris 可作为附属状态存在。

殖民命令必须在提交与实际到达时各校验一次目标空闲状态，避免并发双殖民。

## 3. Deep Space Node

用于：

- 海盗
- 远征
- 遗迹
- 异常
- 虫洞
- LiveOps

Deep Space Node 具有：

- node_id
- template_id
- spawned_at
- expires_at
- seed
- visibility
- reward_state

## 4. 新玩家主星分配

约束：

- 每个 System 的新玩家主星有软上限。
- 避免连续多个 System 完全没有活跃玩家。
- 不把所有新账号固定出生在相同 Orbit。
- 分配算法使用可记录 seed。
- Homeworld 生成结果必须可审计。

第一版不根据付费、地区或玩家能力改变出生资源质量。

## 5. PvE Encounter

### PIRATE_SCOUT

推荐阶段：Day0–1

舰队：
- 3 × S006 Light Fighter

候选奖励：
- 500 M
- 250 C
- 50 D

### PIRATE_RAIDER

推荐阶段：Day1–3

舰队：
- 8 × S006
- 2 × S007

候选奖励：
- 1800 M
- 900 C
- 250 D

### PIRATE_PATROL

推荐阶段：Day3–7

舰队：
- 15 × S006
- 5 × S007
- 2 × S008

候选奖励：
- 6000 M
- 3000 C
- 800 D

所有 PvE 战斗进入与 PvP 相同的 Rust CombatPort。

## 6. PvE 奖励

奖励是显式系统 Source：

`ledger_source = SYSTEM_PVE_REWARD`

残骸仍按 Combat debris 规则生成。

必须分开记录：

- event reward
- loot
- debris
- repair/refund

无有效战斗结果不能发放 Encounter Reward。

## 7. 幂等

每个 Encounter 的奖励唯一键：

```text
encounter_id + participant_id + settlement_version
```

重复 Worker 执行不能重复：

- 发奖励
- 生成残骸
- 写战报
- 增加任务进度

## 8. 重复刷取

同一模板的短周期收益衰减候选：

- 第一次：100%
- 第二次：70%
- 第三次：40%
- 第四次及以后：20%

Encounter 重生候选：
- 20–60 分钟随机窗口

第一版不使用体力值。

主要限制来自：

- 航时
- 燃料
- 战损
- Encounter 数量
- Reward Decay

## 9. Event NPC 与 NPC AI Empire

必须区分。

### Event NPC
- 由模板和 seed 生成
- 可以有系统奖励
- 不要求完整产业链
- UI 显示“事件/海盗”

### NPC AI Empire
- 有星球、经济、库存、科技、舰队
- 所有损失和制造进入账本
- 不能读取隐藏玩家状态
- UI 显示独立势力

不可用 Event NPC 的“系统生成舰队”逻辑冒充完整 AI Empire。

## 10. 可见性

Galaxy 默认只能展示公共信息：

- 坐标
- 类型
- 玩家/势力公开名
- 联盟公开标识
- 基础活动信号

资源、舰队、科技、防御必须依赖情报等级。

## 11. Vertical Slice Gate

必须验证：

1. 新玩家 Galaxy 周边存在至少一个安全 PvE。
2. Encounter 可被 Scout 侦察。
3. 派舰需要燃料。
4. 战斗由 Rust 计算。
5. 奖励写账本。
6. 战报包含 encounter_id、battle_id、ruleset_version。
7. Worker 重试不重复奖励。
8. Encounter 过期后不能继续结算新任务。
