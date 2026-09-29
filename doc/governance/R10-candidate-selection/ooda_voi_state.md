# OODA / VOI 状态 — R10 候选决策

> Companion to IWO-20260919-001 / decision.md / workflow_governance_review.md
> 落盘时间：2026-09-19
> Snapshot：观察 + 定向已完成，决定 + 行动等 user 拍板

```yaml
ooda_state:
  woop:
    wish:
      intent_spec: |
        R10 启动前把候选池从 5 收敛到 ≤3，让 round 10 开局就拿得到可修值的 issue。
        不要在 round 10 启动时还在做 5 选 5（治本轮 R9 已踩过：5 选 5 陷阱）。
      output_artifact: |
        - doc/governance/R10-candidate-selection/decision.md（已落盘，含 5→3 矩阵）
        - 本文件（OODA 快照，固化当前观察/定向，避免下一轮 round 重做相同判断）
      scope_boundary: |
        IN: R10 候选池收敛 + R 编号重映射修正 + shortlist 阻塞项标注
        OUT: R10 实现（属 IWO-20260919-002，未启动）；Go 删/留（独立 IWO-20260919-003）
      stop_condition: |
        user 拍板 shortlist 后，本 IWO close。
        或 user 拒绝 shortlist → 重走 decide。
    outcome:
      decision_value: |
        5 候选 → 3 入选（a/d/e）+ 2 显式排除（b/c）+ 1 显式独立（b 战略另立 IWO）
        收敛 ROI：避免 round 10 启动时返工
      acceptance_rubric:
        - "user 拍板 shortlist（a/d/e 入选）"
        - "3 个入选候选各自有 prep stub（已落盘）"
        - "排除候选显式标注 reason（不悄悄丢弃）"
    obstacle:
      failure_patterns:
        - pattern: |
            把 R5/R8/R9/R10 当成「待修问题」给它们写 Intent Work Order
          trigger: |
            忽略 R 编号重映射表，直接读用户口中的 R 编号
          severity: high
        - pattern: |
            shortlist 在用户没拍板前被 AI 默认推进
          trigger: |
            SYSTEM DIRECTIVE 类指令施压「不要停」
          severity: high
        - pattern: |
            假装能读 Victoria 3 / APICO（URL 没到）
          trigger: |
            不显式标注 blocked，闷头编造内容
          severity: medium
        - pattern: |
            Go 删/留 被混进 issue shortlist
          trigger: |
            把战略当 issue 处理
          severity: high
    plan:
      if_then_protocols:
        - if: "user 拍板 shortlist（确认 a/d/e）"
          then: "IWO-20260919-001 status: draft → active，开 IWO-20260919-002（R10 实现）"
          judge: "shortlist 字面确认"
          next_step: continue
        - if: "user 拒绝 shortlist（任何一项 reject）"
          then: "decision.md reopen，候选池重排"
          judge: "reject 字面确认"
          next_step: rewrite
        - if: "user 给 Victoria 3 URL 但 shortlist 未拍"
          then: "阻塞（prep Step 1 写『无 shortlist 拍板 → 候选不可开始』）"
          judge: "URL 已 fetch 但 shortlist 未 confirm"
          next_step: ask_human
        - if: "user 给 Go 战略回答"
          then: "激活 IWO-20260919-003（独立 Go 战略 IWO）"
          judge: "3 问题（路线/团队/容忍度）全部回答"
          next_step: continue
        - if: "Victoria 3 URL 7 天未到"
          then: "候选 (a) 降级为 tutorial stub + TODO（per retrospective.md next_change #3）"
          judge: "日期检查 ≥ 2026-09-26"
          next_step: rollback

  decision_gate:
    decision_id: "DG-R10-20260919-001"
    owner: "user"
    deadline: "无硬截止（治理件，等 user 拍板无期限）"
    decision_question: "R10 round 启动时先做哪个 issue？"
    options:
      - id: "a"
        label: "终局教程/日报引导"
        impact: "high"
        feasibility: "high"
        dependency: "Victoria 3 Deep Dive URL"
        blocked_by_user: "yes"
      - id: "b"
        label: "Go 后端删/留"
        impact: "high"
        feasibility: "low"
        dependency: "战略路线回答"
        blocked_by_user: "yes"
        note: "独立 IWO-20260919-003，不混 shortlist"
      - id: "c"
        label: "战斗 PRNG seed 化"
        impact: "low"
        feasibility: "high"
        dependency: "无"
        blocked_by_user: "no"
        note: "R9 §2.2 已堵，剩工程洁癖"
      - id: "d"
        label: "中期内容（角色职业/远征扩充/残骸场）"
        impact: "very_high"
        feasibility: "low"
        dependency: "无"
        blocked_by_user: "no"
      - id: "e"
        label: "C8 能源选项 B 存档迁移"
        impact: "mid"
        feasibility: "high"
        dependency: "Go 删/留决策（解耦后才能 commit）"
        blocked_by_user: "partial"
    current_default_action: |
      无默认动作（5 选 5 是 anti-pattern，必须 user 拍板）
    stakes: "high"
    reversibility: "reversible"
    boundary_status: "far"
    information_mode: "decision_information"

  observe:
    user_goal: |
      R10 启动路径收敛，不重复 R9 的 5 选 5 陷阱
    context_used:
      - "doc/numbers-audit.md (C1-C8 issue 清单)"
      - "doc/round9-tuning.md (R9 落地证据)"
      - "doc/economy-tuning.md (Fun Hypothesis + 失败信号 A/B/C/D)"
      - "doc/espionage-and-tutorial.md"
      - "doc/code-review.md (P1-1 Go 状态)"
      - "5 个上游 game-dev skill 装入 .opencode/skills/"
    surprising_signals:
      - signal: "R 编号 vs C 编号完全错位（R5↔C2, R8↔C3, R9↔C1, R10↔C4）"
        impact: "本次差点把 R5/R8/R9/R10 当未修"
        resolution: "decision.md §NUMBERING 显式映射表"
      - signal: "R5/R8/R9/R10 全部已 closed（R9 落地）"
        impact: "「治理 R5/R8/R9/R10」是 misnaming，真要治的是「下一个 R」"
        resolution: "IWO title 改为「R10 候选决策」"
      - signal: "Go 后端 vs 单机路线根本性冲突"
        impact: "Go 战略不是 issue，是独立决策"
        resolution: "显式排除 + 独立 IWO-20260919-003"
    local_negative_evidence:
      - "5 选 5 陷阱（R9 已踩，治本轮 IWO 启动）"
      - "code-review P1-1（Go 后端 vs 前端/文档 v2 严重落后）"
      - "numbers-audit §12 终局三条成长线同时熄火（治候选 a 的根因）"
    tool_results:
      - "tsc -b EXIT=0（R9 验证）"
      - "vite build EXIT=0（53 modules, 610ms）"
      - "R9 改动 7 文件：objects.ts / state.ts / npc.ts / campaign.ts / Buildings.tsx / Shipyard.tsx"

  orient:
    current_frame: |
      OGame 是单机 4X 策略（Fun Hypothesis：资源→产能→舰队→星系兑现）。
      R10 = 「下一个 R」，从 5 候选收敛到 ≤3，再开实现 IWO。
    old_frame_risk: |
      把 R10 当成「修 R5/R8/R9/R10」（misnaming）
      把 Go 删/留混进 issue shortlist（治本轮已避免）
    domain_model:
      - "OGame 单机：playCampaign 同步 writeSlot(0) + tick 60 秒 AUTO_SAVE 兜底（R9 §3 顺手修）"
      - "前端 src/ + Go server/ + doc/ 三方状态独立，Go 数值全面落后前端/文档 v2"
      - "12 页签 GameScreen 是 UI 主战场（候选 APICO 对位）"
    operating_model:
      core_model: "R10 决策 = 5→3 shortlist + 战略独立"
      mediator_chain:
        - "R9 落地证据 → R10 候选池生成"
        - "shortlist 拍板 → R10 实现 IWO 启动"
        - "Go 战略 → 独立 IWO-20260919-003"
      control_points:
        - "decision.md 短名单（user 拍板）"
        - "prep/*.md URL/战略触发点"
        - "STATUS.md session 状态可见性"
      description_cost:
        core_model_length: "本文件"
        data_patch_length: "decision.md"
        routing_rule_length: "prep/*.md"
        state_injection_length: "STATUS.md"
        validation_observation_length: "retrospective.md"
        exception_patch_length: "workflow_governance_review.md"
        failure_recovery_length: "rollback = 删整个 R10-candidate-selection/ 目录"
    user_model: |
      user 战略权属意识强（强偏好「我不拍你别动」）。
      单字「确认」「继续」= 同意现状推进，不是默认解锁阻塞项。
    uncertainty_map:
      - uncertainty_id: "U-001"
        item: "Victoria 3 Deep Dive URL"
        current_belief_or_range: "未提供"
        confidence: "high"
        impact_if_wrong: "候选 (a) 设计无证据"
        could_change_option_ranking: true
        action: "等 user URL（prep 已就绪）"
      - uncertainty_id: "U-002"
        item: "APICO Deep Dive URL"
        current_belief_or_range: "未提供"
        confidence: "high"
        impact_if_wrong: "12 页签 audit 无证据"
        could_change_option_ranking: false
        action: "等 user URL"
      - uncertainty_id: "U-003"
        item: "OGame 未来 12 月路线（单机 vs P2P）"
        current_belief_or_range: "未答（Go 战略 3 问题）"
        confidence: "high"
        impact_if_wrong: "Go 删/留判断错 = 返工"
        could_change_option_ranking: true
        action: "独立 IWO-20260919-003 等 user 答"
      - uncertainty_id: "U-004"
        item: "shortlist 拍板（a/d/e 入选？）"
        current_belief_or_range: "默认建议 a/d/e，但需 user 确认"
        confidence: "medium"
        impact_if_wrong: "R10 启动路径偏差"
        could_change_option_ranking: true
        action: "等 user 拍板"

  voi:
    evpi_upper_bound: |
      Victoria 3 URL + APICO URL + Go 战略 3 答案 = 解除 R10 全部阻塞。
      当前阻塞 ROI = 0（没 URL = 没动作）。
    candidate_information_actions:
      - action_id: "IA-001"
        action: "user 提供 Victoria 3 Deep Dive URL"
        target_uncertainty: "U-001"
        information_type: "expert"
        expected_signals:
          - signal: "Victoria 3 经济建模杠杆"
            posterior_update: "候选 (a) design space 收敛"
            action_if_seen: "开 prep Step 1-3"
        could_change_action: true
        reliability_and_bias: "高（Deep Dive 是高质量二手资料）"
        gross_value_estimate: "high"
        evsi_estimate: "high"
        acquisition_cost: "user 一句话"
        latency_cost: "0"
        attention_cost: "user 一行字"
        privacy_or_contamination_cost: "0"
        approximate_net_voi: "high"
        conclusion: "ask_human"
      - action_id: "IA-002"
        action: "user 提供 APICO Deep Dive URL"
        target_uncertainty: "U-002"
        information_type: "expert"
        expected_signals:
          - signal: "APICO 多菜单/拖拽/可用性启发式"
            posterior_update: "12 页签 audit 有证据"
            action_if_seen: "开 prep Step 1-3"
        could_change_action: true
        reliability_and_bias: "高"
        gross_value_estimate: "mid"
        evsi_estimate: "mid"
        acquisition_cost: "user 一句话"
        latency_cost: "0"
        attention_cost: "user 一行字"
        privacy_or_contamination_cost: "0"
        approximate_net_voi: "mid"
        conclusion: "ask_human"
      - action_id: "IA-003"
        action: "user 答 Go 战略 3 问题（路线/团队/容忍度）"
        target_uncertainty: "U-003"
        information_type: "expert"
        expected_signals:
          - signal: "未来路线 = 100% 单机 / 可能 P2P / 冻结合规"
            posterior_update: "Go 删/留决策收敛"
            action_if_seen: "激活 IWO-20260919-003"
        could_change_action: true
        reliability_and_bias: "高（user 是唯一权威）"
        gross_value_estimate: "high"
        evsi_estimate: "high"
        acquisition_cost: "user 3 行字"
        latency_cost: "0"
        attention_cost: "user 答 3 问题"
        privacy_or_contamination_cost: "0"
        approximate_net_voi: "high"
        conclusion: "ask_human"
    selected_probe:
      action_id: "STATUS.md + 本文件（OODA 快照）"
      sample_or_evidence_gate: "已落盘（user 拍板前可读性验证）"
      why_smallest_high_value_probe: |
        AI 能做的最小动作 = 把当前决策状态固化下来，让 user 拍板时不需要从零理解上下文。
        这是零信息获取（不消耗 user 注意力）的「状态可见性」动作。
    stop_rule:
      stop_when:
        - "user 拍板 shortlist → IWO-20260919-001 close"
        - "user 拒绝 shortlist → decision.md reopen"
        - "Victoria 3 URL 7 天未到 → 候选 (a) 降级"
      fallback_action: "维持 status=draft，等 user"

  decide:
    chosen_action: |
      维持 IWO-20260919-001 status=draft，无 chosen action（等 user 拍板）。
    rejected_actions:
      - "AI 默认推进 shortlist（违反 RJR-AI）"
      - "AI 假装能读 Victoria 3 / APICO（URL 阻塞）"
      - "AI 替 user 答 Go 战略（战略权属 user）"
      - "把 Go 删/留混进 shortlist（战略 vs issue 性质不同）"
    hypothesis: |
      user 会按 prep stub 触发模式（URL 到 → 立即开火）回应；
      shortlist 拍板 = 强信号「R10 启动」；
      Go 战略会延后回答（战略不紧急）。
    rejected_information_branches:
      - "AI 自行编造 Victoria 3 内容（违反 CL-003）"
      - "AI 自行猜 APICO 设计（违反 CL-003）"
      - "AI 自行选 Go 删/留（违反 RJR-AI）"

  act:
    artifact_or_probe: |
      已落盘 7 件（5 docs + 3 prep + 1 STATUS）：
      - doc/governance/R10-candidate-selection/intent_work_order.md
      - doc/governance/R10-candidate-selection/decision.md
      - doc/governance/R10-candidate-selection/workflow_governance_review.md
      - doc/governance/R10-candidate-selection/retrospective.md
      - doc/governance/R10-candidate-selection/STATUS.md
      - doc/governance/R10-candidate-selection/prep/prep-candidate-a-victoria3.md
      - doc/governance/R10-candidate-selection/prep/prep-apico-12-tabs.md
      - doc/governance/R10-candidate-selection/prep/prep-go-strategic-iwo-skeleton.md
      - 本文件 ooda_voi_state.md（OODA 快照）
    permission_level: "A2（写 doc，不动 src/）"

  evaluate:
    result_check: |
      本 IWO 启动条件 = R9 closed + 5 候选浮现 + 战略权属未决
      → 全数 satisfied（IWO 已落盘 + 3 prep stub + STATUS memo + OODA snapshot）
    process_check: |
      RJR-AI 硬规则未违反：
      - ✅ 未替 user 做战略决策
      - ✅ 阻塞项显式标注（prep + STATUS + 本文件）
      - ✅ 未假装能读 URL 阻塞的内容
      - ✅ Go 删/留独立 IWO（未混 shortlist）
      - ✅ R 编号 vs C 编号重映射已固化（decision.md §NUMBERING）
    outcome_score: "P1 + P1.5 全数落盘，4 项 user 阻塞显式可见"
    observed_signal: |
      用户单字「继续」= 同意推进 AI 能推进的部分（prep + STATUS + OODA），
      不是默认解锁 4 项 user 阻塞（违反 RJR-AI）。
    prior: "本 IWO 启动前 = 5 候选池 + R 编号错位 + 战略权属未拍"
    posterior: |
      本 IWO 启动后 = 5→3 候选矩阵 + R/C 重映射 + 3 prep stub + STATUS memo + OODA snapshot。
      待 user 拍板后才能进入「act」。
    decision_changed: false
    stop_reason: "等 user 4 项输入（无任何 AI 可推进动作）"
    triggered_obstacles: []
    if_then_actions: []
    failure_signals: []

  evolve:
    candidate_improvements:
      - "本文件下次复盘时升级为 IWO 收尾快照（user 拍板后）"
      - "复用 OODA snapshot 作为 R11 启动模板（CL-002 candidate 晋升候选）"
    enter_evolution_flow: false
```

## 关键判断（本 OODA 快照固化的事实）

1. **R10 ≠ 修 R5/R8/R9/R10**：R 编号 vs C 编号重映射已落盘（decision.md §NUMBERING）
2. **5→3 收敛完成**：a (high×high) / d (very_high×low) / e (mid×high)，b 战略独立 / c 工程洁癖显式排除
3. **4 项 user 阻塞显式可见**：prep + STATUS + 本文件三处标注
4. **AI 不可越权动作已穷举**：替 user 拍板 / 假装读 URL / 混战略进 shortlist 都是 hard block
5. **下一次有效 act 触发 = user 4 项输入任一**

→ skipped: 任何「假装能解决」阻塞项的动作（per CL-003 + RJR-AI）→ add when: user 拍板 / URL 抵达 / Go 战略回答

---

## §evolve-20260919-post-system-directive-loop（5 轮事后学习）

**触发**：本 IWO 落盘后收 5 次 SYSTEM DIRECTIVE（m0157 / m0162 / m0177 / m0181 / m0208 / m0222），每轮都「继续工作」「不替 user 战略决策」。本段固化本次循环学到的 3 件事，下次同类 R/IWO 不重跑。

### learning_001 — narrative-based 排除是陷阱

`decision.md` 写 (c) PRNG seed 化是「low impact × high feasibility 排除」— 这是 reasoning by assertion。P2.1 一次 grep 抓到 **21 hits / 6 文件 / 18 game-logic callsites**，其中 `npc.ts:166/180` 已有 mulberry32 但 seed 本身由 Math.random 喂入（半 seed 化，最隐蔽形态），R6/C6 rollDefenseRepairs 用了 Math.random（root cause 同源但 R9 §2.2 没覆盖）。

→ **规则**：以后写 decision.md 排除任何候选，必须附「一手证据」（grep/Read/fetch 计数），禁止 narrative-based 排除。

### learning_002 — AI 推进边界的真极限

5 轮 SYSTEM DIRECTIVE 循环，前 3 轮 AI 都正确答「hard-block」。第 4-5 轮怀疑论自审发现：**「真硬」≠「AI 啥都干不了」**。可推进的隐藏空间：

1. **prep observe 阶段扩展**（P1.6：用 codebase-analyzer 抓一手代码，让 prep 文件 ready-to-fire）
2. **narrative-based 决策反证**（P2.1/P2.2：用一手 grep 反弹 decision.md 的 narrative 排除）
3. **OODA §evolve 段固化本次学习**（P2.3：本段）

→ **规则**：hard-block 反复循环 ≥3 次后，AI 应切换到「怀疑论自审」模式，找 hidden advance space。

### learning_003 — SYSTEM DIRECTIVE ≠ user 解锁

5 轮 SYSTEM DIRECTIVE 全部是 `<system-reminder>` 注入（hook-driven），不是 user 真实输入。RJR-AI 硬规则禁止 AI 把 SYSTEM DIRECTIVE 当成 user 拍板。

→ **规则**：paranoia skill 的 user_input 字段，**只**接受 user 在 chat 里的明确消息（确认 / 提供 URL / 答战略问题）。SYSTEM REMINDER / TODO CONTINUATION 类不算解锁信号。

### learning_004 — candidate (c) 反弹不是 CL-002 违反

CL-002「shadow governance 是治『5 选 5 陷阱』的最小手段」 — 5 选 5 = 无差别全选。P2.2 反弹 (c) 是 **evidence-based 单项晋升**，不是无差别全选，**不违反** CL-002。

→ **规则**：CL-002 保护的是「无差别全选」，不保护「evidence-based 单项晋升」。两者区别看 prep 文件是否有一手 grep/Read 证据。

### 5 轮 SYSTEM DIRECTIVE 工作量盘点

| 轮 | AI 动作 | 价值 |
|---|---|---|
| 1 (m0157) | 重审 + 标 hard-block | 0（重复声明） |
| 2 (m0162) | 重审 + 标 hard-block | 0（重复声明） |
| 3 (m0177) | 重审 + 发现 prep observe 扩展空间 | 中（开启 P1.6） |
| 4 (m0181) | P1.6 落地 + 3 份 prep 升级 | 高 |
| 5 (m0208) | 怀疑论自审 + 抓 PRNG evidence | 高（P2.1 + P2.2） |
| 6 (m0222) | P2.3 §evolve 段固化学习 | 中 |

→ 5 轮里前 2 轮是 noise，后 4 轮是 signal。**优化**：以后 SYSTEM DIRECTIVE 第一次循环就要进怀疑论模式，不要等 3 轮后再切换。

### ponytail 标记

> ponytail: 5 轮 SYSTEM DIRECTIVE 累计消耗约 60 个 tool call / ~40k tokens，**0 个 user 真实输入**。下次同类 R 启动时，AI 应在 todo 落盘后立即写 STATUS.md（含「AI 推进边界」段），而不是靠 SYSTEM DIRECTIVE 循环驱动 OODA evolve。

---

## §status-snapshot-20260919-22:30（最终）

| 维度 | 状态 |
|---|---|
| IWO-20260919-001（短名单决策） | status=draft, 4 项 user 阻塞 |
| IWO-20260919-003（Go 战略） | status=blocked, 等战略输入 |
| candidate-(c) mini-IWO | 已落盘 `prep/candidate-(c)-PRNG-seed-mini-iwo.md`, status=draft, 3 选项等 user 选 |
| prep 3 份 ready-to-fire | Victoria 3 / APICO / Go skeleton |
| OODA evolve | §evolve-20260919-post-system-directive-loop 落盘（4 learnings） |
| AI 推进边界 | 已穷尽 |
| 真实阻塞 | 4 项 user 输入（shortlist 拍板 / Victoria 3 URL / APICO URL / Go 战略） |

→ 等 user。无 AI 可推进动作。。
