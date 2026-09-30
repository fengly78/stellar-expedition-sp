# Stellar Expedition AI 帝国与玩家离线托管规格

> 状态：v0.1 设计基线  
> 日期：2026-09-30

## 1. 双 AI 体系

项目中的 AI 分为两类，必须严格区分：

### 1.1 NPC AI Empire
服务器中的非玩家帝国，是世界生态的一部分，会生产、扩张、贸易、侦察、掠夺、战争和撤退。

### 1.2 Player Autopilot
代表玩家在离线期间执行授权动作的 AI 秘书/总督。它不能获得 NPC 特权，也不能绕过玩家自身资源、舰队和时间约束。

## 2. 玩家 AI 托管目标

解决“睡觉时怎么办”而不把游戏变成全自动挂机。

AI 可以：
- 收取并重新安排合法队列；
- 根据预算升级建筑；
- 自动续接研究；
- 自动制造预设舰船；
- 调整资源运输；
- 在受到攻击时执行预设防御；
- 让高风险舰队撤离或分散；
- 进行低风险 PvE/采集；
- 向玩家总结发生了什么。

默认不允许：
- 主动发起高风险 PvP；
- 加入/退出联盟；
- 花费稀有或付费资产；
- 拆除重要建筑；
- 清空全部资源进行单次决策；
- 改变账号安全设置。

## 3. 托管权限模型

玩家用 Policy 配置 AI，而不是给自然语言无限权限。

每个 Policy 包括：
- scope；
- budget；
- risk_limit；
- allowed_actions；
- forbidden_actions；
- reserve_floor；
- time_window；
- targets；
- escalation_rule。

示例：
```text
经济总督：
- 可升级矿场与能源建筑
- 单次支出 <= 当前库存 20%
- 金属/晶体/重氢各保留安全库存
- 不升级超过 8 小时的项目
- 不取消玩家手动队列
```

## 4. 风险预算

AI 所有主动行为都计算风险分：
- 资源暴露；
- 舰队损失概率；
- 目标敌对程度；
- 情报新鲜度；
- 航行时间；
- 玩家最近在线时间；
- 是否处于战争状态。

风险分超过 Policy 阈值时：
- 不执行；
- 或只执行防御动作；
- 或请求玩家确认。

## 5. AI 决策可解释性

每个 AI 行为必须记录：
- trigger；
- considered_options；
- selected_action；
- reason_codes；
- expected_cost；
- actual_cost；
- result；
- linked_policy_version。

UI 不需要展示内部推理链，但必须展示简明理由，例如：
- “能源余量低于 12%，因此先升级太阳能阵列。”
- “检测到 2 小时后有来袭舰队，因此将主力舰队转移到安全星球。”
- “目标情报已过期 5 小时，未执行自动袭击。”

## 6. 玩家离线摘要

玩家上线后首先看到 AI Summary：
- 离线时长；
- 完成的建筑/研究；
- 资源变化；
- 舰队任务；
- 受到的攻击；
- AI 防御动作；
- 拒绝执行的高风险动作；
- 建议处理事项。

提供“为什么”入口查看每项动作对应 Policy。

## 7. NPC AI 帝国目标

NPC 不是无限刷怪，而是一个经济主体。

AI 帝国拥有：
- 星球；
- 库存；
- 生产；
- 建筑；
- 科技；
- 舰队；
- 情报；
- 外交状态；
- 战略目标。

## 8. AI 动机

AI 发起行为必须有可解释动机。

主要 Utility：
- SURVIVAL：降低被消灭风险
- GROWTH：扩张与提高产能
- WEALTH：获取资源
- SECURITY：打击高威胁目标
- TERRITORY：控制区域
- REVENGE：对持续攻击者提高敌意
- OPPORTUNITY：抓住低风险高收益目标
- DIPLOMACY：维持协议或联盟

## 9. AI 为什么会打劫玩家

AI 只有在满足条件时才执行 Raid：
- 目标存在可见资源；
- 侦察可信度足够；
- 预计收益 > 燃料 + 风险成本；
- 自身舰队有余量；
- 目标不在保护范围；
- 攻击不会破坏更高优先级战略；
- 最近攻击冷却满足。

建议评分：
```text
raid_score =
  expected_loot
  - fuel_cost
  - expected_loss
  - retaliation_risk
  + strategic_pressure
  + hostility_bonus
```

只有 raid_score 高于动态阈值才攻击。

## 10. AI 性格模板

AI 帝国可配置人格参数，而非写死脚本：

- Expansionist：扩张型
- Merchant：贸易型
- Raider：掠夺型
- Fortress：防御型
- Technologist：科技型
- Opportunist：机会型

人格只影响权重，不改变基础规则。

## 11. AI 视野限制

AI 不能读取数据库里的玩家完整状态。

它只能使用：
- 自身侦察结果；
- 公共信息；
- 联盟/阵营共享；
- 历史战报；
- 区域事件；
- 自身观测到的航线。

这样避免“作弊 AI”。

## 12. AI 经济

NPC AI 同样需要：
- 生产资源；
- 建造设施；
- 制造舰船；
- 消耗燃料；
- 维护扩张；
- 承担损失。

为了服务器生态，可以配置“宏观校正系数”，但任何特殊补贴必须记录为系统注入，并与普通资源账本区分。

## 13. AI 难度

难度不通过“偷看数据 + 数值翻倍”实现。

主要调节：
- 决策频率；
- 情报分析水平；
- 风险容忍度；
- 舰队组合质量；
- 资源利用效率；
- 反应延迟；
- 战术姿态选择。

## 14. AI 与 EVE 式世界生态的借鉴方向

借鉴的是“经济主体与风险空间”，不是复制 EVE 的复杂度：

- 高价值区域更危险；
- 物流和航线有战略意义；
- 玩家与 NPC 都对资源节点产生争夺；
- 市场、战争、侦察互相影响；
- 高价值行为在世界中留下可观察痕迹。

## 15. 自动化安全边界

Autopilot 必须有硬限制：
- 每小时动作频率限制；
- 最大资源支出比例；
- 最大可动用舰队比例；
- 最大 PvE 风险；
- PvP 默认关闭；
- 关键行为需要玩家显式开启；
- Policy 修改立即记录审计。

## 16. 实现建议

AI 分三层：

### 16.1 Rule/Policy Layer
硬规则、权限、预算、保护边界。

### 16.2 Planner Layer
根据目标生成候选动作并评分。

### 16.3 Executor Layer
把动作转为普通游戏 Command，进入与真人完全相同的 API/领域服务/任务队列。

AI 不直接写数据库。

## 17. 数据结构

建议核心表：
- ai_agents
- ai_policy_versions
- ai_goals
- ai_observations
- ai_decisions
- ai_action_requests
- ai_action_results
- ai_relationships

Autopilot 与 NPC 可共用 Decision/Action 日志，但权限上下文不同。

## 18. MVP

### Player Autopilot v1
- 经济升级；
- 队列续接；
- 资源安全线；
- 来袭时舰队撤离；
- 上线摘要。

### NPC AI v1
- 海盗据点；
- 生产与舰队恢复；
- 侦察；
- 基于收益的 Raid；
- 战损后退缩；
- 基础敌意记忆。

## 19. 验收标准

- AI 每个动作都能追溯到 Policy 或 NPC Goal。
- Autopilot 无法执行未授权 PvP。
- NPC AI 无法读取未侦察的玩家资源。
- AI 战斗使用与玩家相同的 Rust 战斗核心。
- AI 资源变化进入同一账本审计体系。
- 玩家上线后 30 秒内能理解离线期间发生的主要事件。

## 20. RC2 收尾裁决：命令仲裁与并发

Autopilot 不拥有独立写数据库通道。最终动作都转换成普通 Command。

同一玩家资源/队列存在竞争时，优先级固定：

```text
PLAYER_MANUAL
> AUTOPILOT_DEFENSIVE_EMERGENCY
> AUTOPILOT_MAINTENANCE
```

规则：

1. 玩家手动命令永远可以覆盖之后尚未执行的 Autopilot 计划。
2. Autopilot 不取消已经开始的玩家手动 Build/Research/Manufacture。
3. Autopilot 只在空闲执行槽或玩家授权的 pending slot 中补任务。
4. 防御紧急动作（撤舰/分散）只有 Policy 明确授权才能执行。
5. 每个 AI Command 必须带 `source=AUTOPILOT`、`policy_version`、`decision_id`。
6. Policy 更新只影响尚未执行的新动作，不追溯修改已完成结算。
7. 默认 `allow_pvp=false`；结构化 Policy 没有开启 PvP 时，自然语言提示不能绕过它。
8. AI 的预算、reserve floor 和 risk limit 在 Command 提交时与真正执行时都要重新校验。

NPC AI 仍是独立 owner，但同样经过 Command/Domain/Worker，不允许直写资源。

