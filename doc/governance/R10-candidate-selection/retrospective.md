# Retrospective — R10 候选决策

> Companion to IWO-20260919-001 + workflow_governance_review.md
> Status: pending（待 user 拍板后填 verified_judgments）

## original_intent

用 1 份 shadow governance 把 R10 候选从 5 减到 ≤3，避免 round 10 启动时还在 5 选 5。

## completion_state

pending（user 未拍板）

## verified_judgments

（待 user 拍板后填）

## uncertain_items

- 候选 (a) 终局教程的真实影响面 → 需要 Victoria 3 Deep Dive 解锁
- 候选 (d) 中期内容的工程量级 → 当前估 ≥ R5，未细化
- 候选 (e) C8 存档迁移 → 强耦合 Go 删/留决策，未解耦前不能 commit

## next_change

- 若 user 拍板 shortlist → 开 IWO-20260919-002（R10 修值方案实现），本 IWO close
- 若 user 拒绝 shortlist → 修订 decision.md，重走 decide 步
- 若 P2 (Victoria 3 URL) 7 天内不解锁 → 候选 (a) 降级为 tutorial stub + TODO

## reusable_rules（候选晋升）

- `round_X_starts_with_governance_iwo`: 每轮 round 启动前必须有 1 份 shadow governance 锁 shortlist
- `closed_R_numbers_dont_reappear`: 已 closed 的 R 编号不在新 IWO 出现（避免术语污染，治本次差点把 R5/R8/R9/R10 当未修）
- `strategic_decisions_get_separate_iwo`: 战略决策（如 Go 删/留）必须独立 IWO，不混进 issue shortlist
- `p_blocked_items_marked_explicitly`: 阻塞项必须在 decision.md 显式标注，禁止假装能解决

## candidate_learning

| ID | 学习点 | 来源 | 状态 |
|---|---|---|---|
| CL-001 | 「R5/R8/R9/R10 已 closed」与「治理 R10」是两个动作，前者已完成 | numbers-audit C# → R 编号重映射 | candidate |
| CL-002 | shadow governance 是治『5 选 5 陷阱』的最小手段，ponytail 适用 | decision.md 决策方法 | candidate |
| CL-003 | Victoria 3 文章若不提供，候选 (a) 应降级而非阻塞整个 shortlist | economy-tuning §0 Fun Hypothesis | candidate |

## promotion_status

candidate（需要至少 1 次 R10 round 跑完后验证 CL-001/CL-002/CL-003 是否真有用，再决定晋升为 validated）
