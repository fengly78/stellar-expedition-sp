# Stellar Expedition 范围冻结与 Release Gate

> 日期：2026-09-30
> 状态：Implementation Handoff

## 1. Beta1 范围冻结

Beta1 必须交付：

- Web + responsive mobile
- 2.5D 主星
- 资源/能源
- 建筑/研究/船坞/防御
- Galaxy
- Scout/Intel
- Transport/Deploy/Attack/Recycle/Colonize
- PvE
- PvP
- New Player Protection
- Combat v2 + Replay
- Autopilot v1
- Market Beta1
- Alliance v1
- Migration
- Audit/Observability/Backup

## 2. 明确不进入 Beta1

- Native mobile
- Ship fitting
- Real-time tactical combat
- Interceptable player market cargo
- Insurance
- Advanced diplomacy
- Alliance sovereignty endgame
- Full season reset system
- Complex carrier fitting
- Paid power acceleration
- Multi-VPS scaling

## 3. Gate 0 — Ruleset

必须：

- manifest 可编译
- schema valid
- semantic valid
- prerequisite DAG
- all refs exist
- frozen override audit
- legacy mapping valid
- content hash stable

失败：不得启动服务。

## 4. Gate 1 — Vertical Slice

真实浏览器流程：

```text
new account
→ planet
→ build
→ research
→ scout
→ galaxy
→ intel
→ fleet
→ PvE
→ combat
→ report
→ logout
→ autopilot
→ login
→ summary
```

桌面、360–430px 手机宽度均通过。

## 5. Gate 2 — Economy

Release Evidence：

- 1000 bots
- 4 strategies
- 10 planet archetype seeds
- 30 days
- tutorial sources included
- market transfer excluded from Source
- PvE/PvP separately measured

阻断：
- core milestone unreachable
- source/sink sustained >1.3
- source/sink sustained <0.8
- one strategy >2× Balanced
- P90/Median >3×
- Autopilot advantage >12%

## 6. Gate 3 — Combat

每个正式 matchup 至少 10,000 seeds。

阻断：

- deterministic replay failure
- majority matchup single ship win >65% at equal V
- EW exceeds configured cap
- Command Aura exceeds cap
- impossible retreat state
- negative/NaN combat values
- reward/debris double settlement

## 7. Gate 4 — PvP/Abuse

必须验证：

- P0/P1 不被联盟宣战绕过
- self-lowering score cannot cheaply farm protected players
- repeated attack decay
- Aggressor Window
- Return Shield cooldown
- market self-match forbidden
- reward idempotency
- Autopilot cannot enable PvP without policy

## 8. Gate 5 — Migration

迁移演练必须证明：

```text
Σ old resource = Σ new resource
Σ old fleet counts = Σ new fleet counts
old storage levels = B005 component levels
active finish_at preserved
legacy battle immutable
```

任何 unmapped authoritative content 阻断迁移。

## 9. Gate 6 — Operations

必须：

- Worker restart safe
- retry safe
- dead letter observable
- MariaDB backup restore
- rollback rehearsal
- health endpoints
- structured logs
- rate limit
- auth/session security tests
- DB connection failure tests
- Rust failure tests

## 10. Freeze Discipline

设计变更分三级：

### Balance Change
只改 Candidate 参数，不改变 schema。

### Rule Change
改变公式/状态机，需要 change record + regression。

### Scope Change
新增系统，默认推迟到 Beta1 后。

Beta1 开发期间禁止“顺手加系统”。

## 11. Done Definition

Beta1 的 Done 不是“页面能打开”。

必须同时满足：

- Functionally playable
- Server authoritative
- Recoverable
- Auditable
- Deterministic where required
- Mobile usable
- Migration safe
- Balance evidence recorded
