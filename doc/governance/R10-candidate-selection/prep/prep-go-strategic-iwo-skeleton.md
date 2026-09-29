# Prep: Go 删/留 Strategic IWO Skeleton

> AI-PREP stub | 不替 user 做战略决策 | 战略输入后立即开火
> 来源依据：code-review §4「要么删 Go 降级为迁移目标注释，要么立刻启动对齐」
> Skill 待调：`paranoia-ai-system-evolver`

## 当前阻塞

| 项 | 状态 | 谁解锁 |
|---|---|---|
| 战略选择（删 Go / 留 Go 对齐 / 留 Go 但冻结） | ✅ user 选「留 Go 但冻结」(2026-09-20) | user |
| 战略输入一旦给，开完整 IWO-20260919-003 | ✅ active — 4 Go 文件 FROZEN + code-review P1-1 闭环 | user |

## 为什么这是独立 IWO（不混 shortlist）

- 决策性质 = 战略（影响未来 P2P/联机路线），不是 issue
- RJR-AI 硬规则：战略判断属 user 剩余判断权，AI 只辅助论证
- shortlist 是 issue 决策，混进战略 = 治理污染（CL-003 已标）

## IWO 骨架（user 填战略后即可激活）

```yaml
intent_work_order:
  schema_version: "1.2.0"
  work_order_id: "IWO-20260919-003-SKELETON"
  title: "Go 后端战略决策 — 删 / 留对齐 / 留冻结"
  status: "active"  # 2026-09-20 user 选 freeze → 4 Go 文件 FROZEN 头注释 + code-review P1-1 闭环

  intent:
    reality_to_change: "Go 后端从来未接入前端（web/src/state.ts 是 canonical，`:8080/healthz` 是唯一接触面）。Freeze 让后端成为 reference + P2P 解冻路径，不浪费对齐返工，也不丢失 git 历史。"
    parent_project_goal: |
      OGame 是单机 4X 策略游戏（Fun Hypothesis：资源→产能→舰队→星系兑现）。
      Go 后端骨架是否保留取决于：
      (1) 单机路线下是否仍是死代码
      (2) 未来 P2P/联机路线概率
      (3) 团队是否有 Go 维护能力
    desired_world_state: "[待填]"

  acceptance:
    verifier_role: "user"
    acceptance_criteria:
      - "3 个战略选项（删 / 留对齐 / 留冻结）的对比矩阵落地"
      - "每个选项的 cost-of-reversal 估值"
      - "战略选项落地后 7 天内可执行，无返工"

  autonomy:
    authority_level: "P2_draft"
    human_gate_triggers:
      - "删 Go 目录（删除真实代码 = Human Gate #4）"
      - "改 Go 代码到对齐前端（修改死代码 = Human Gate #3）"
      - "冻结 Go（标记 deprecated = Human Gate #2 long-term memory）"

  boundaries:
    must_not_sacrifice:
      - "R9 验证链（tsc -b + vite build）"
      - "doc/code-review.md 已记录的所有 P1 问题不被本次决策回避"
    ai_can_freely_change:
      - "本 IWO 草稿状态"
    ai_must_not_touch:
      - "E:\\Ogame\\cmd\\server\\**（Go 入口）"
      - "E:\\Ogame\\internal\\**（Go 包：battle / game / tick）"
      - "E:\\Ogame\\migrations\\**（SQL 迁移）"
      - "E:\\Ogame\\web\\src\\**（React/TS 前端）"

  observe_stage:  # P1.6 在 2026-09-19 21:29 已落实
    go_backend_inventory:
      - "cmd/server/main.go (1476B, 66 行) — HTTP 入口，只有 GET /healthz 路由 + StubStore + heartbeat"
      - "internal/battle/battle.go (7989B) — 战斗模拟（未被 main 引用）"
      - "internal/battle/battle_test.go (3841B)"
      - "internal/game/objects.go (9445B) — 游戏对象模型（未被 main 引用）"
      - "internal/tick/tick.go (2883B) — tick 结算（main 调用 StubStore）"
      - "migrations/ (4356B) — SQL 迁移"
    verdict: |
      Go 后端实际是 dead code 实体（不是「严重落后」，是「从未接入」）。
      前端 web/src/state.ts (82KB) 完全独立走 React state machine，
      不通过任何 HTTP 调用 Go，唯一接触面是 :8080/healthz 心跳。
      code-review §4 描述的「7 项数值全面落后」准确 — 它们在 internal/game/objects.go 里写了一份 v1 数据，
      从未被 main.go 通过 HTTP 暴露过任何 /v2/contracts 路由。
    strategic_choice_implication: |
      「删 / 留对齐 / 留冻结」三选项对比的 cost 估要重新校准：
      - 「删」的实际成本 = 删 5 个文件 + 4 个 migration（git 留历史）
      - 「对齐」的实际成本 = 不仅 7 项数值，还要从 main.go 加 routes + main 和前端发请求（不是单纯改 internal/objects.go 数据）
      - 「冻结」= 标 deprecated + README，但保留 :8080 心跳监听

  loop_contract:
    loop_steps:
      - "observe: code-review §4 的 Go 状态摸清"
      - "orient: 3 选项放进 (cost × reversibility × strategic-fit) 三维"
      - "decide: user 战略选择"
      - "act: 按选项落地（删 / 对齐 / 冻结）"
      - "evaluate: 7 天后验证 R10 进展是否被 Go 决策拖慢"
    stop_conditions:
      - "user 战略选择后 status → active"
      - "战略选择落地 7 天后 retrospective"
```

## 3 战略选项（待 user 选）

| 选项 | 描述 | cost 估 | reversibility | strategic-fit（待 user 评） |
|---|---|---|---|---|
| **删 Go** | 删 server/ + 改 README 为「历史服务端骨架，已废弃」 | 1 小时（删 + 文档） | 高（git 留历史） | 单机路线 ✓ / P2P 路线 ✗ |
| **留 Go + 对齐 v2** | 启动对齐返工：7 项数值追前端 + 加 /v2/contracts + 测试 | 2-3 周 | 中（写过的代码可改） | 单机 ✗（返工）/ P2P ✓ |
| **留 Go + 冻结** | 标 deprecated + README 警告 + 不进 CI | 2 小时（标 + 文档） | 高（解冻即可恢复） | 单机 ⚠ / P2P △ |

## user 需要回答的 3 个问题

1. **战略路线**：OGame 未来 12 个月内是 100% 单机，还是可能开 P2P/联机？
2. **团队能力**：是否有 Go 维护人手？没有就排「留 Go 对齐」
3. **容忍度**：能否接受 server/ 目录继续存在作为「迁移目标注释」？

## 关键边界

1. **不替 user 选战略**——这是 RJR-AI 硬规则
2. **删 Go 必须走 Human Gate**——删真实代码 = Human Gate #4
3. **无论选什么，code-review P1-1 必须显式 close**——避免「选了战略但 P1-1 还开着」的烂账

## 一旦战略输入的最小触发消息

> 「Go 战略 = [删/留对齐/留冻结]。开完整 IWO-20260919-003，预计 30 分钟出。」

→ skipped: 当前删 Go / 改 Go 代码 / 写对齐脚本（战略阻塞）→ add when: user 战略输入。
