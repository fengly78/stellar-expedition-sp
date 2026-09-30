# Stellar Expedition 垂直切片实施计划

> 日期：2026-09-30  
> 目标：把当前设计收敛成一个可以真实玩 24 小时的新 OGame 垂直切片。

## Slice 目标

玩家必须能完成：

```text
创建账号
→ 进入 2.5D 主星
→ 建矿/能源
→ 建实验室
→ 研究
→ 建船坞
→ 造 Scout
→ 打开 Galaxy
→ 侦察 NPC
→ 造战斗舰
→ PvE 战斗
→ 查看 Rust 战报
→ 离线
→ AI Autopilot 执行低风险管理
→ 再上线查看 Summary
```

## Phase 1 — Ruleset Loader

- [ ] 加载 RC1
- [ ] Overlay RC2 Candidate
- [ ] Entity registry
- [ ] Prerequisite DAG validator
- [ ] Frozen override audit
- [ ] Ruleset hash
- [ ] active_ruleset DB table

## Phase 2 — Planet Domain

- [ ] planet archetype
- [ ] capacity
- [ ] slot
- [ ] zone
- [ ] placement validation
- [ ] base tier
- [ ] specialization schema

## Phase 3 — 2.5D Planet UI

- [ ] fixed isometric camera
- [ ] surface zones
- [ ] orbit layer
- [ ] building anchors
- [ ] visual stages
- [ ] context panel
- [ ] build ghost
- [ ] mobile bottom sheet

## Phase 4 — Economy

- [ ] RC2 building definitions
- [ ] production
- [ ] energy
- [ ] build queue
- [ ] research queue
- [ ] shipyard queue
- [ ] milestone telemetry

## Phase 5 — Galaxy

- [ ] systems
- [ ] orbit slots
- [ ] NPC target
- [ ] intel level
- [ ] fleet composer
- [ ] travel time/fuel

## Phase 6 — Combat v2

- [ ] self-contained snapshot
- [ ] fixed PRNG
- [ ] 6 rounds
- [ ] targeting
- [ ] hit formula
- [ ] damage
- [ ] role multipliers
- [ ] retreat
- [ ] event replay

## Phase 7 — PvE

- [ ] pirate outpost
- [ ] loot
- [ ] debris
- [ ] recycler optional
- [ ] battle report
- [ ] replay UI

## Phase 8 — Autopilot v1

- [ ] policy
- [ ] reserve floor
- [ ] economy upgrade
- [ ] empty queue refill
- [ ] energy emergency
- [ ] no PvP default
- [ ] offline summary

## Phase 9 — Simulation Gate

- [ ] 24h new account sim
- [ ] prerequisite reachability
- [ ] 1000 combat seeds
- [ ] economy source/sink
- [ ] autoplay advantage

## Slice Exit Criteria

- 新玩家 45 分钟内能完成第一次侦察。
- 4 小时内能完成第一次 PvE。
- 所有 UI 流程同时支持桌面/移动。
- Battle snapshot 可确定性回放。
- Autopilot 默认不能主动 PvP。
- 24h 经济不出现硬卡点。
- RC2 配置修改无需重编译客户端。
