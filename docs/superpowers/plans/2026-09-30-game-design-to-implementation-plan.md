# Stellar Expedition 游戏设计落地实施计划

> 日期：2026-09-30
> 依赖：
> - graphical-vps-architecture-design
> - game-core-spec
> - economy-progression-spec
> - fleet-pvp-combat-spec
> - ai-empire-autopilot-spec
> - 2_5d-web-mobile-ux-spec
> - content-catalog-spec
> - market-alliance-liveops-spec

## Phase 0：设计冻结

- [ ] 建立 balance schema
- [ ] 建立建筑/科技/舰船/防御 ID
- [ ] 确认 MVP 内容清单
- [ ] 确认资源公式与时间倍率
- [ ] 确认新手保护规则
- [ ] 确认 AI Autopilot 权限边界
- [ ] 确认 PvP 战报字段

输出：
- versioned game config
- balance v0.1
- schema docs

## Phase 1：可玩的星球经济

- [ ] 账号/会话
- [ ] 主星创建
- [ ] 资源生产
- [ ] 能源约束
- [ ] 建筑升级
- [ ] 科研
- [ ] 制造
- [ ] 队列
- [ ] 2.5D 星球场景
- [ ] 移动端布局

验收：玩家可以从新账号发展到第一艘侦察单位。

## Phase 2：星系与舰队

- [ ] 星系生成
- [ ] 目标可见性
- [ ] 舰队编成器
- [ ] 航时与燃料
- [ ] 运输
- [ ] 部署
- [ ] 侦察
- [ ] 回收
- [ ] 殖民

验收：玩家可以完成第一次跨星球任务。

## Phase 3：战斗与 PvE

- [ ] Rust CombatPort
- [ ] battle snapshot versioning
- [ ] 海盗 NPC
- [ ] 战斗结算
- [ ] 残骸
- [ ] 防御修复
- [ ] 战报摘要
- [ ] 战斗回放

验收：同 seed 回放一致，奖励进入账本。

## Phase 4：PvP 与保护

- [ ] PvP 匹配边界
- [ ] 新手保护
- [ ] 攻击预警
- [ ] 掠夺
- [ ] 撤退策略
- [ ] 反骚扰
- [ ] 情报时效
- [ ] 联盟共享接口预留

验收：受保护玩家不可被越级无限掠夺。

## Phase 5：AI Autopilot

- [ ] Policy schema
- [ ] budget/risk engine
- [ ] economic governor
- [ ] auto queue
- [ ] incoming attack defense
- [ ] fleet evacuation
- [ ] action audit
- [ ] offline summary

验收：离线 8 小时后所有 AI 动作可解释、可追溯。

## Phase 6：NPC AI Empire

- [ ] AI economy
- [ ] observation model
- [ ] goal system
- [ ] raid utility
- [ ] hostility memory
- [ ] retreat
- [ ] expansion
- [ ] recovery

验收：NPC 不读取玩家隐藏数据库状态，且攻击需要经济动机。

## Phase 7：市场与联盟

- [ ] 市场订单
- [ ] 税费
- [ ] 物流任务
- [ ] 联盟
- [ ] 共享情报
- [ ] 联盟标记
- [ ] 联盟工程 v1

## Phase 8：LiveOps

- [ ] 动态事件
- [ ] 排行榜
- [ ] 赛季
- [ ] balance_version
- [ ] telemetry
- [ ] GM 审计工具

## Phase 9：上线门槛

- [ ] 30 天经济模拟
- [ ] 1000+ bot 经济压力模拟
- [ ] 舰队组合 Monte Carlo 平衡测试
- [ ] Worker 崩溃恢复
- [ ] 数据守恒
- [ ] Web 性能
- [ ] 移动端 E2E
- [ ] 新手 15 分钟体验测试
- [ ] AI 权限安全测试
- [ ] PvP 滥用测试

## 开发优先级

P0：
- 星球经济
- 建筑/科技
- 舰队
- 星系
- PvE
- PvP 基础
- 新手保护
- 战报

P1：
- AI Autopilot
- NPC AI
- 市场
- 联盟

P2：
- 区域控制
- 赛季
- 高级联盟工程
- 高级舰队模块

## 最终原则

先做“一个真的能玩、能理解、能持续发展的宇宙”，再扩充内容。任何新系统必须进入资源、时间、风险、情报、空间中的至少一个核心约束，不增加没有决策价值的菜单。

## 设计阶段收尾状态 — 2026-09-30

设计工作已经通过全面审计收口。

从本节开始，本计划的 Phase 0 不再表示“继续补玩法文档”，而表示完成以下工程证据：

- Ruleset Compiler
- Semantic Validator
- Legacy Mapping Validator
- Economy Simulator v2
- Combat v2 Harness
- Release Gate evidence store

范围冻结与正式 Gate 见：
`2026-09-30-scope-freeze-release-gates.md`

总审计结论见：
`../specs/2026-09-30-design-audit-closure.md`

新的非阻塞玩法需求默认进入 Beta1 后 Backlog。

