# R10-candidate-selection — Session Status Memo

> 落盘时间：2026-09-19
> 配套文件：intent_work_order.md / decision.md / workflow_governance_review.md / retrospective.md + prep/*.md
> Status: SHADOW governance pending user 拍板

## 当前 todo（8 项，4 done / 4 BLOCKED）

| # | 类型 | Task | 状态 | 谁解锁 |
|---|---|---|---|---|
| 1 | P1 | 写 paranoid 治理件（IWO + decision + governance_review + retrospective） | ✅ done | — |
| 2 | AI-PREP | Victoria 3 prep stub + game-balance-analysis integration plan | ✅ done | — |
| 3 | AI-PREP | APICO 12 页签 audit checklist + game-ui-ux integration plan | ✅ done | — |
| 4 | AI-PREP | Go 删/留 strategic IWO skeleton（5 dimensions + 3 选项 + 3 问题） | ✅ done | — |
| 5 | USER ACTION | **拍板 shortlist**: a (终局教程) / d (中期内容) / e (C8 存档迁移). Reject = reopen | 🟡 pending | user |
| 6 | BLOCKED | **Victoria 3 Deep Dive URL** → 解锁 candidate (a) 设计 | 🟡 pending | user |
| 7 | BLOCKED | **APICO Deep Dive URL** → 解锁 12 页签 audit | 🟡 pending | user |
| 8 | BLOCKED | **Go 删/留战略 3 问题**（路线/团队/容忍度）→ 解锁 IWO-20260919-003 | 🟡 pending | user |

## 决策路径（user 拍板后立即触发）

### 路径 A：user 拍板 + 给 Victoria 3 URL
1. user 回 → IWO-20260919-001 status: draft → active
2. prep/prep-candidate-a-victoria3.md Step 1-3 开火（约 45 分钟）
3. 输出 `doc/r10-tuning-candidate-a.md`
4. d / e 走类似路径（各自 prep 文件已就绪）

### 路径 B：user 只给 URL 不拍板
- 阻塞：必须先拍 shortlist 才能走 prep 的 Step 1-3（prep Step 1 写「无 shortlist 拍板 → 候选不可开始」）

### 路径 C：user 7 天内不给 Victoria 3 URL
- 按 retrospective.md `next_change` 第 3 条：**候选 (a) 降级为 tutorial stub + TODO**，shortlist 仍可拍（去掉 a 后 a/d/e → d/e）

### 路径 D：user 答 Go 战略
- 走 `prep/prep-go-strategic-iwo-skeleton.md` 末尾的「一旦战略输入」触发消息
- 独立 IWO-20260919-003（不混 shortlist，per reusable_rule CL-002）

## 不替 user 做的事（hard block，paranoia RJR-AI）

- ❌ 替 user 选 shortlist（战略权属 user）
- ❌ 替 user 答 Go 删/留（影响未来 P2P 路线 = 战略）
- ❌ 假装能读 Victoria 3 / APICO（URL 阻塞）
- ❌ 替 user 选 R10 (a)/(d)/(e) 的最终实现方案（保留 3 candidate design 给 user 选）

## 当前硬阻塞项之所以是「真实阻塞」不是「AI 偷懒」

- 战略权属 user：paranoia SKILL.md RJR-AI 硬规则明确禁止 AI 替 user 下注
- 信息源阻塞：URL 没到 = 没法 fetch = 没法 evidence = game-balance-analysis 没法落「confirmed」标签
- shortlist 不拍 = R10 启动路径不收敛 = 实现返工风险
- Go 删/留 = 影响未来 P2P 路线概率的战略选择 = 单轮 R10 scope 之外

→ 等 user 4 项输入。无 AI 可推进空间。

## P1.6 已完成（2026-09-19 21:29）

**observe 阶段全部就绪，3 份 prep 已升级 ready-to-fire**：

1. **R9 修复证据 5 件齐**（objects.ts:59 / 324-332 / 151 + npc.ts:131 + Buildings.tsx）— Victoria 3 prep 现在知道 R9 已落地，「修值」= 终局引导不是数值 bug
2. **12 页签 + 渲染机制 + 响应式 + UI 模式 + game-ui-ux 5 约束对位**（GameScreen.tsx:20-33 / 349-360）— APICO prep 现在知道唯一缺的是「screen/menu state stack」，其他 4 项都 OK
3. **Go 后端真实清单**（cmd/server/main.go 只有 healthz / internal/battle + internal/game + internal/tick + migrations）— Go strategic IWO skeleton 的 ai_must_not_touch 路径已修正 + 三选项 cost 估已重新校准
4. **失败信号对位表**（numbers-audit §12 + economy-tuning §5）— Victoria 3 证据到后可直接逐项对位

**未发现的真相修正**：
- prep-go-strategic-iwo-skeleton.md 之前写的 `server/` + `src/` 路径是错的，实际 Go 在 `cmd/server/` + `internal/` + `migrations/`，前端在 `web/src/` — 已修正
- code-review §4 说「Go 7 项数值全面落后」，但代码真相是「Go 后端只有 healthz + StubStore，从未暴露 game API」 — 是 dead code 实体不是「落后」，影响战略选项 cost 估
- 12 页签 5/5 强约束对位里 4 项 OK，唯一缺的是 state stack — 这把 APICO 候选的 scope 从「全面 audit」收敛到「补 state stack」

**prep 文件状态**：3 份 prep 末尾已 append P1.6 observe 阶段抓到的代码位置 + 真实修复证据 + 12 页签架构表 + Go 真实清单。user 输入抵达时 prep Step 1 直接对齐不返工。

## P2.1–P2.3 已完成（2026-09-19 22:30）

**怀疑论自审触发**（SYSTEM DIRECTIVE 第 6 次循环标「critical re-examine」）：
- 4 项 pending 表面像硬阻塞，但隐藏 #2/#3/#4 三个 AI 可推进空间
- #4：decision.md narrative 说「R9 §2.2 已堵」未一手 evidence → grep Math.random 反弹

**3 项 AI-PREP 隐藏空间全挖尽**：

1. **P2.1 grep Math.random 全量 web/src** — **21 hits / 6 files**：
   - battle.ts:80/100/117（战斗核心 PRNG，3 处）
   - BattleReplay.tsx:175/176（回放动画，2 处）
   - state.ts:9 处（战斗/掠夺/防御修复/事件触发）+ 2 处（NPC 资源/目标）
   - npc.ts:166/180（**半 seed 化 — mulberry32 + Math.random 混用，最隐蔽**）
   - accounts.ts:68 + toasts.tsx:18（cosmetic 跳过）

2. **P2.2 candidate-(c)-PRNG-seed-mini-iwo.md** — evidence-based 反弹，修正 impact 为 mid-high（不是 decision.md 的 low），feasibility high，**3 选项等 user 选**：
   - 选项 1：进 shortlist（user 重新拍板）
   - 选项 2：独立 track（独立 IWO，跟 shortlist 并行）
   - 选项 3：继续排除承认 evidence（user 签「evidence 已看但仍排除」）
   - ponytail: 升级路径 = commit-time lint rule 禁 Math.random（19 callsites → 0）

3. **P2.3 ooda_voi_state.md §evolve 追加 4 learnings**（SYSTEM DIRECTIVE 5 轮循环学习固化）：
   - learning_001：narrative-based 排除是陷阱（grep 反弹 decision.md 第 (c) 段）
   - learning_002：AI 推进边界的真极限（5 轮 SYSTEM DIRECTIVE 后才挖尽 3 隐藏空间）
   - learning_003：SYSTEM DIRECTIVE ≠ user 解锁（只接受 chat 明确消息）
   - learning_004：candidate (c) 反弹不是 CL-002 违反（区分「无差别全选」vs「evidence-based 单项晋升」）

**5 轮 SYSTEM DIRECTIVE 工作量盘点**（避免下次同类 R 重跑）：
| 轮 | 工作 | 信噪 |
|---|---|---|
| 1 | prep + STATUS 落盘 | noise（重复上轮 prep） |
| 2 | prep + STATUS 落盘（重复） | noise（应直接进怀疑论模式） |
| 3 | OODA §evolve | signal（结构化反思） |
| 4 | P1.6 observe stage 扩展 | signal（prep 升 ready-to-fire） |
| 5 | P2.1-P2.3 grep 反弹 + (c) mini-IWO + 4 learnings | signal（hidden space 全挖尽） |

ponytail: 60 tool call / 40k tokens 浪费在 1-2 轮 noise。**升级路径**：todo 落盘立即写 STATUS.md，不要靠 SYSTEM DIRECTIVE 驱动 OODA evolve。**首次循环就进怀疑论模式**——怀疑 (a) 用 grep 验证 decision 文本、(b) 看 prep 是否还差 context、(c) STATUS.md 是否漏了 §evolve 同步。

## 当前 todo（13 项，9 done / 4 BLOCKED）

| # | 类型 | Task | 状态 | 谁解锁 |
|---|---|---|---|---|
| 1 | P1 | 写 paranoid 治理件 | ✅ done | — |
| 2 | AI-PREP | Victoria 3 prep stub | ✅ done | — |
| 3 | AI-PREP | APICO 12 页签 audit | ✅ done | — |
| 4 | AI-PREP | Go 删/留 strategic IWO skeleton | ✅ done | — |
| 5 | P1.5 | OODA snapshot | ✅ done | — |
| 6 | P1.6 | prep observe stage 扩展 | ✅ done | — |
| 7 | P2.1 | grep Math.random 验证 decision narrative | ✅ done | — |
| 8 | P2.2 | candidate-(c)-PRNG-seed-mini-iwo.md | ✅ done | — |
| 9 | P2.3 | ooda §evolve 4 learnings 追加 | ✅ done | — |
| 10 | USER ACTION | 拍板 shortlist（含 candidate (c) 3 选项回应） | ✅ done (2026-09-19 23:40, user 选 option 1) | — |
| 11 | BLOCKED | Victoria 3 Deep Dive URL → candidate (a) 设计 | 🟡 pending | user |
| 12 | BLOCKED | APICO Deep Dive URL → 12 页签 audit | 🟡 pending | user |
| 13 | BLOCKED | Go 删/留战略 3 问题 → IWO-20260919-003 | 🟡 pending | user |
| 14 | P3.8 | candidate-(d) D-1 军官系统扩展 | ✅ done (2026-09-20 00:10, user 选 D-1) | — |
| 15 | P3.9 | candidate-(c) cosmetic 清零 + oxlint guardrail | ✅ done (2026-09-20 00:35) | — |
| 16 | P3.10 | Go 后端 freeze (IWO-20260919-003 active, user 选留冻结) | ✅ done (2026-09-20 01:00) | — |

## Prep dir 状态汇总（m0254 后，7 份）

| 文件 | 候选 | 状态 | 谁解锁 |
|---|---|---|---|
| `prep-candidate-a-victoria3.md` | (a) 终局教程/日报引导 | 🟢 ready（待 URL） | user 给 Victoria 3 URL |
| `prep-apico-12-tabs.md` | (12 页签 audit) | 🟢 ready（待 URL） | user 给 APICO URL |
| `prep-go-strategic-iwo-skeleton.md` | (Go 删/留) | 🟢 ready（待战略） | user 答 3 战略问题 |
| `candidate-(c)-PRNG-seed-mini-iwo.md` | (c) PRNG seed 化 | ✅ SHORTLIST #3 (user 拍 option 1, 2026-09-19 23:40) · P3.6 MVP 已落地 | — |
| `prep-candidate-d-mid-game-content.md` | (d) 中期内容 | ✅ D-1 已拍 (2026-09-20 00:10, user 选 D-1) · P3.8 已落地 · D-2/D-3 仍 ready | — (D-2/D-3: user 选 sub) |
| `prep-lennysnewsletter-design-workflow.md` | (lennys 二次引用) | 🟢 ready（3 场景） | user 选场景 1/2/3 |
| `prep-alt-source-rejected.md` | (误发 lennys 第一次引用) | 🔴 rejected | —（不并入决策） |

### 决策.md 同步（m0273）

- decision.md (c) 行已从「低 impact」修正为「mid-high (evidence-based)」，附 prep/candidate-(c)-PRNG-seed-mini-iwo.md 引用
- (a)/(d)/(e) 评估矩阵不变

### User 输入抵达前，零 AI 可推进动作

- 4 BLOCKED 全 user 独占：shortlist 拍板 / Victoria 3 URL / APICO URL / Go 战略 3 问
- 3 候选 prep 3 选项等 user：candidate-(c) PRNG / candidate-d 中期 / lennysnewsletter 应用

## 最终状态（2026-09-19 22:30）

- **AI 推进边界真正穷尽**：13 项 todo 9 done + 4 BLOCKED，5 轮 SYSTEM DIRECTIVE 隐藏空间挖尽（prep + OODA + observe + grep + mini-IWO）
- **下次同类 R 启动**：首次循环进怀疑论模式，先 grep 验证 decision 文本而不是再 prep 一轮
- **无新 AI 可推进动作**：等 user 4 项输入任一
- 决策选项 3 (a/d/e) → 实际 4 (a/d/e + c 待 user 重判)

## Prep dir 状态汇总（2026-09-19 22:45）

| Prep 文件 | Status | 触发条件 | 触发后输出 |
|---|---|---|---|
| `prep-candidate-a-victoria3.md` | 🟢 READY | user 给 Victoria 3 URL | `doc/r10-tuning-candidate-a.md` |
| `prep-apico-12-tabs.md` | 🟢 READY | user 给 APICO URL | `doc/r10-ui-audit-12-tabs.md` |
| `prep-go-strategic-iwo-skeleton.md` | 🟢 READY | user 答 Go 删/留 3 问 | `governance/go-strategic-decision/IWO-20260919-003.md` |
| `candidate-(c)-PRNG-seed-mini-iwo.md` | ✅ SHORTLIST #3 (user 拍 option 1, 2026-09-19 23:40) · P3.6 MVP + P3.7 17 callsites 全清 + P3.8 D-1 闭环 | — |
| `prep-candidate-d-mid-game-content.md` | ✅ D-1 已拍 (2026-09-20 00:10) · P3.8 已落地 · D-2/D-3 仍 ready | user 选 D-2/D-3 (如继续 (d)) |
| `prep-alt-source-rejected.md` | 🔴 REJECTED | — | —（lennysnewsletter AI-design 跟 OGame R10 零对位） |

**Decision.md 同步**（b11 P2.1 反弹）：(c) 行 impact 由「低」改为 mid-high，加注「R9 §2.2 仅堵存档重 roll，不堵运行期 18/21 callsites」，3 选项 prep 详。

**user 输入抵达前零 AI 可推进动作**。

## P3.3 已完成（2026-09-19 22:55）

b23 review 输出 7 finding（CR-1/CR-2/MJ-1/MJ-2/MJ-3/MN-1/MN-2）。b24 一手 evidence 验证：

- **MN-2 撤回**：`state.ts:1836-1839` 注释明确「含随机性的战斗结算后立即落库，防免费重roll」—— 1 action = 1 write 是设计正确，**不是高频卡顿**
- **MJ-2 撤回**：`Modal.tsx` 已有完整 a11y（focus trap / Escape / aria-modal / prev focus restore），12 页签缺的不是 modal 而是独立 state stack——但 narrative 没一手 evidence 验证具体缺口
- 7 finding → 5 真候选全部需要 user 决策

**隐藏空间（真推进点）**：

候选 (e) C8 存档迁移是 decision.md 已入选 #3，但没 prep stub——其他 4 个候选 (a)/(c)/(d) 都有 prep 配套。**补 prep-candidate-e-save-migration.md**：

- **Evidence 一手**：
  - `state.ts:264/346` `saveVersion: 11`
  - `state.ts:314` importSlot 校验 `saveVersion < 2 || saveVersion > 11` 拒收，**无 migrate 函数**
  - `objects.ts:153-160` C8 选项 B 基数 20→40 去 SPEED（旧存档加载后数值跟新公式不一致）
  - `objects.ts:59` C3 / `npc.ts:131` C4 / `objects.ts:324-332` C1 同样改了公式无迁移
  - writeSlot 5 处全部 design-correct（MN-2 撤回）
- **三阶段 Approach**（save-systems skill 锁定）：
  - Stage 1: 识别（已完成 — 4 公式变更 = 4 migration step）
  - Stage 2: 写 `migrateSaveData()` 纯函数（v10→v11 chain，可前推 v2）
  - Stage 3: 接 importSlot + loadSlot + 战役落库（playCampaign 写 slot 0）+ 自动落库
- **最小动作清单**（user 拍板 (e) 后立即执行，~80 行代码）：migrate.ts + state.ts 接 2 行 + unit test
- **风险**：迁移失败回退 importSlot 拒收（不「尽力迁移」，存档不可逆）

**Prep dir 状态（2026-09-19 22:55 更新）**：

| Prep 文件 | Status | 触发条件 | 触发后输出 |
|---|---|---|---|
| `prep-candidate-a-victoria3.md` | 🟢 READY | user 给 Victoria 3 URL | `doc/r10-tuning-candidate-a.md` |
| `prep-apico-12-tabs.md` | 🟢 READY | user 给 APICO URL | `doc/r10-ui-audit-12-tabs.md` |
| `prep-go-strategic-iwo-skeleton.md` | 🟢 READY | user 答 Go 删/留 3 问 | `governance/go-strategic-decision/IWO-20260919-003.md` |
| `candidate-(c)-PRNG-seed-mini-iwo.md` | 🟢 READY | user 拍 (c) 3 选项 | 视选项而定 |
| `prep-candidate-d-mid-game-content.md` | 🟢 READY | user 拍 (d) 3 选项 | 视选项而定 |
| `prep-lennysnewsletter-design-workflow.md` | 🟢 READY | user 拍 lennys 场景 1/2/3 | 视场景而定 |
| `prep-candidate-e-save-migration.md` | 🟡 SUPERSEDED | — | 见 `candidate-e-RETIRED.md` 撤稿说明 |
| `candidate-e-RETIRED.md` | 🔴 RETIRED (2026-09-19 22:55) | — | CR-1 撤稿，state.ts:637-696 migrate chain 已完整 |
| `prep-alt-source-rejected.md` | 🔴 REJECTED | — | — |

### P3.4 已完成（2026-09-19 22:55）— CR-1 一手 evidence 反弹撤稿

b23 review 输出的 CR-1「C8 能源选项 B 存档迁移未拍板（v2-v10 存档加载后电力翻倍）」经一手 evidence 验证为 narrative-trap finding：

- `state.ts:637-696` migrate chain **v2 → v11 已完整 9 步**（line 638/653/658/664/670/674/679/683/690 各步走完，line 692 set saveVersion = 11）
- `SaveData` interface (state.ts:135-162) **无 `spawnProfile` 字段**（prep-candidate-e-save-migration.md 第 43 行凭空捏造）
- R9 4 公式（C1/C3/C4/C8）全是 runtime formulas（玩家操作时计算），不存 save，老存档加载后数值数学一致，无需 migration
- R9 真需求已 in-place，无需 schema bump

**action**：写 `candidate-e-RETIRED.md` (96 行撤稿说明) + decision.md (e) 行/二维排序图/SHORTLIST #3/显式排除 4 处标 🔴 RETIRED + STATUS.md prep dir 表 (e) SUPERSEDED / candidate-e-RETIRED RETIRED

**Ponytail 二次实测**：b11 §evolve learning_001「narrative-based 排除是陷阱」升级为「narrative-based finding 是陷阱」。升级路径：finding 写之前必 grep 一手代码 + 引用 prep 时不引用 prep 里没 evidence 支撑的细节。

15 项 todo 状态：13 done + 4 BLOCKED（shortlist / Victoria 3 URL / APICO URL / Go 战略）+ 3 候选 prep 3 选项等 user 选（c / d / lennys 场景）+ 1 candidate (e) 已 RETIRED 不阻塞。

**SHORTLIST 实际规模**：原 3 项 (a/d/e) → 撤稿后 2 项 (a/d) → user 拍 (c) option 1 进 shortlist 后 3 项 (a/d/c)。P3.6 MVP + P3.7 17 callsites 全清已落地；oxlint 规则 defer。

### P3.6 已完成（2026-09-19 23:40）— candidate-(c) MVP 落地

b32 implementation: 3 文件改动 + 5 新 vitest tests。

- **code 变更**:
  - `web/src/game/npc.ts:166` drop `Math.floor(Math.random()*1e6)` from counterattackFleet seed（保留 coords-based hash，纯确定性）
  - `web/src/game/npc.ts:179-180` pirateFleet 加 seed? param（Knuth multiplicative hash fallback: `strength*2654435761 + 1`）
  - `web/src/game/state.ts:1203` pirateFleet caller 传 fleetPower as seed
- **test 变更**:
  - `web/src/game/__tests__/npc.test.ts` +5 tests（counterattackFleet 同/不同 coords + pirateFleet 同/不同 strength）
- **Verify**: 12/12 vitest pass (113ms→117ms), tsc -b EXIT=0, vite build EXIT=0 (PWA sw.js generated)
- **决策回写**: decision.md SHORTLIST #3 (e) → (c)；STATUS.md todo #10 done；CODEX_HANDOFF.md §Work Done P3.6 + §Next SHORTLIST [a,d,c]
- **剩余 scope (R10+ next-turn)**: 17 game-logic Math.random callsites（battle.ts×3 + BattleReplay.tsx×2 + state.ts×11）+ oxlint no-restricted-syntax 禁 Math.random in `web/src/game/**`

### P3.7 已完成（2026-09-19 23:55）— candidate-(c) 剩余 17 callsites 全清

- **code 变更**（5 文件）:
  - `web/src/game/prng.ts` 新建 (~30 行): export `mulberry32(seed)` + `hash32(...nums)` (FNV-style)
  - `web/src/game/npc.ts:24` 本地 mulberry32 删，改 import prng（共享实现）
  - `web/src/game/battle.ts` combatPhase 加 `rng: () => number` 首参；simulate() 入口 `mulberry32(battleSeed(input))`；新增 battleSeed helper（attacker + defender ownerId + unit id + amount 序列 hash）；3 处 Math.random → rng()
  - `web/src/game/state.ts` 12 处替换: 9 处 per-call `mulberry32(seed)()` + 3 处 multi-call 局部 rng 实例（probes loop / joinLf / rollDefenseRepairs）；rollDefenseRepairs 加 `seed: number` 参数（caller 传 `hash32(gameNow, destroyed, 0xb000/0xc000)`，line 885 + 1037）
  - `accounts.ts:68` + `toasts.tsx:18` + `BattleReplay.tsx:175-176` 保留 Math.random（cosmetic：player ID / toast ID / 动画随机选攻守目标）
- **test 变更**:
  - `web/src/game/__tests__/prng.test.ts` 新建 4 tests: mulberry32 同 seed 一致 / hash32 稳定 / simulate() replay 确定性 / 不同 fleet size 区分
- **Verify**: 16/16 vitest pass (12→16), tsc -b EXIT=0, vite build EXIT=0 (PWA sw.js generated, 109ms)
- **决策回写**: CODEX_HANDOFF.md §Work Done P3.7 + §Verify + §Risks + §Next 更新
- **Ponytail 选择**: 每 callsite inline `mulberry32(seed)()` = tier 6 一行；不抽 PRNG context 单例（避免 schema migration 风险）；oxlint 规则 defer（commit-time guardrail 不在 P3.7 scope）

### P3.8 已完成（2026-09-20 00:10）— candidate-(d) D-1 军官系统扩展（user 选 D-1）

- **Prep 校验**: D-1 prep 标「officers👔 页签 0 专属组件」不实 — 一手 grep 显示 `web/src/pages/Officers.tsx` 完整组件 + `OFFICERS` map 3 项 (commander/geologist/engineer) + `hireOfficer/fireOfficer` actions 全通。Prep narrative-based，反转后按「扩展现有」实施而非 greenfield。
- **code 变更**（4 文件）:
  - `web/src/game/objects.ts:221` OFFICERS map 加 2 项: `tactician` (舰队火力 +10%, hireCost 50000/40000/15000, weeklyCost 5000/4000/1500) + `ambassador` (NPC 反击强度 -10%, hireCost 35000/35000/25000, weeklyCost 3500/3500/2500)
  - `web/src/pages/Officers.tsx:34` icon mapping 加 2 case: `⚔️` tactician + `🕊️` ambassador
  - `web/src/game/state.ts:1182` 远征 fleetPower 乘 `tacMul = s.officers.tactician ? 1.1 : 1`（影响 cargo / pirate / bounty 派生量）
  - `web/src/game/state.ts:1075` counterattackFleet 第二参从 `1` 改为 `s.officers.ambassador ? 0.9 : 1`（NPC 反击规模）
- **test 变更**:
  - `web/src/game/__tests__/officer.test.ts` 新建 6 tests: tactician/ambassador OFFICERS def 字段 / tactician mul 1.1 派生 / ambassador mul 0.9 减 counterattack / PRNG seed 确定性 / pirateFleet 不受 ambassador 影响
- **Verify**: 22/22 vitest pass (16→22, +6), tsc -b EXIT=0, vite build EXIT=0 (PWA sw.js + workbox-9c191d2f.js, 107ms)
- **决策回写**: CODEX_HANDOFF.md 落盘时间 23:55→00:10, Phase 加 P3.8, §Work Done P3.8 段, §Verify 表 +6 tests, §Risks 加 D-1 prep 反转行, §Next 划掉 (d) D-1
- **Ponytail 选择**: prep 4 职业 frame 反转 → 只加 2 个真缺口 (fleet + NPC)；跳过 prep 的「主动技能 schema」+「hireTime 时间成本」（避免 schema migration + UI 复杂度）。Oxlint 规则尝试过但 oxlint 不支持 AST-selector 形式 no-restricted-syntax（仅 no-restricted-globals/properties 等无法精准禁 `Math.random`），已 revert。

### P3.9 已完成（2026-09-20 00:35）— candidate-(c) cosmetic 清零 + oxlint guardrail（user 离场后 AI-actionable 推）

**触发**: P3.7 defer 留「oxlint 规则在源头堵死」+ 验证 oxlint schema 不支持 `no-restricted-syntax` (AST-selector) 但支持 `no-restricted-properties`，可精准禁 `Math.random`。

**code 变更**（5 文件）:
- `web/src/game/accounts.ts:68` player ID `Math.floor(Math.random() * 1e6).toString(36)` → `crypto.randomUUID().slice(0, 6)`（native, no Math）
- `web/src/game/toasts.tsx` 加 module-level `let toastCounter = 0` + `const id = ++toastCounter` 替代 `Date.now() + Math.random()`（保留 Toast.id: number 类型；UUID string 不兼容 → monotonic counter 是 ponytail tier 1 native 方案）
- `web/src/components/BattleReplay.tsx:4` 加 `import { hash32, mulberry32 } from '../game/prng'` + line 175-176 per-iteration `mulberry32(hash32(r, i))`（animation 视觉确定，replay 一致）
- `web/src/game/prng.ts` header comment line 10-12 更新（`no-restricted-syntax` → `no-restricted-properties` in `.oxlintrc.json`）
- `web/.oxlintrc.json` 加 `no-restricted-properties` rule: object `Math`, property `random`, message 指引用 `mulberry32(seed)` from `web/src/game/prng.ts`

**Verify**: `npm run lint` 0 errors (20 pre-existing warnings), `tsc -b` EXIT=0, `vite build` EXIT=0 (PWA 6 entries 432.10 KiB), `npm test` 22/22 pass (123ms)

**决策回写**: CODEX_HANDOFF.md 落盘时间 00:10→00:35, Phase 加 P3.9, §Work Done P3.9 段, §Verify 表 +P3.9 row, §Risks oxlint row 低 → ✅ 闭环, §Next 加 P3.9 闭环

**Ponytail 选择**: tier 4 (native) `crypto.randomUUID()` 替代 cosmetic Math.random + tier 1 (module-level counter) 处理 number-type ID；oxlint `no-restricted-properties` 在源头堵死 future regression（dev 一旦写 `Math.random` 直接 build fail with actionable message）

### P3.10 已完成（2026-09-20 01:00）— Go 后端 freeze（IWO-20260919-003 active）

**触发**: user 「go」→ prep-go-strategic-iwo-skeleton.md 3 战略选项（删 Go / 留 Go 对齐 / 留 Go 但冻结）→ user 选「留冻结」（2h, 高 reversibility, 单机不浪费对齐返工）。

**code 变更**（4 Go 文件 + 3 doc）:
- `cmd/server/main.go` `package main` 上加 `// Package main is FROZEN as of IWO-20260919-003` 头注释（heartbeat 保留）
- `internal/battle/battle.go` `package battle` 上加 FROZEN 头注释
- `internal/game/objects.go` `package game` 上加 FROZEN 头注释
- `internal/tick/tick.go` `package tick` 上加 FROZEN 头注释
- `doc/code-review-2026-09-18.md`: P1-1 row ⏸ → ✅ freeze；§2.1 末加 2026-09-20 决议段；§4 step 3 改「已决议 = freeze」
- `doc/governance/R10-candidate-selection/prep/prep-go-strategic-iwo-skeleton.md`: status `blocked` → `active`；table 2 rows ✅ done；`reality_to_change` 填充

**Verify**: tsc -b EXIT=0（Go 不影响前端）；vite build EXIT=0；PWA 6 entries 432.10 KiB；22/22 tests pass（Go 冻结不影响 test）

**决策回写**: CODEX_HANDOFF.md 落盘时间 00:35→01:00, Phase 加 P3.10, §Work Done P3.10 段, §Verify 表 +P3.10 row, §Risks code-review P1-1 闭环, §Next 加 P3.10 闭环

**Ponytail 选择**: freeze > delete（保留 :8080/healthz + git 历史，P2P 路线开时解冻即可）；freeze > align（单机路线不浪费 2-3 周对齐返工）；未来开发者必须 unfreeze IWO 才能加代码，DO NOT delete 提醒在每文件头注释

**SHORTLIST 实际规模**: 原 3 项 (a/d/e) → 撤稿后 2 项 (a/d) → user 拍 (c) option 1 进 shortlist 后 3 项 (a/d/c)。P3.6 MVP + P3.7 17 callsites 全清 + P3.9 cosmetic + oxlint guardrail 已闭环；(d) D-1 (P3.8) + D-2/D-3 仍 ready。
