# Candidate (c) PRNG Seed-化 — Evidence-based Re-evaluation

> 落盘：2026-09-19
> 状态：mini-IWO（独立 track，不进 R10 shortlist）
> 触发：`decision.md` 把 (c) 标「low impact × high feasibility 排除」— 本文件用一手 grep evidence 反推
> 配套：decision.md §"显式排除 (c)" 段

## 为什么写这份

`decision.md` 写：

> (c) 战斗 PRNG seed 化 - low impact × high feasibility - **显式排除**（R9 §2.2 已堵，剩工程洁癖）

这是 **narrative-based 排除**，不是 **evidence-based 排除**。R9 §2.2 修的是「save 后 re-roll 收益」这条 root cause 链，**没**修所有 PRNG 调用栈。本文件给一手数据。

## 一手 grep（`web/src/**/*.ts(x)` 全量）

`Select-String -Pattern "Math\.random|Math\.floor\(Math\.random" -AllMatches` 全量扫，**21 hits / 6 文件**。

### 分类（按 game-logic vs cosmetic）

| 文件:行 | 性质 | R9 §2.2 覆盖？ |
|---|---|---|
| `game/battle.ts:80` | 战斗目标选择 | ❌ 未覆盖 |
| `game/battle.ts:100` | 反击判定 `Math.random() < 1 - ratio` | ❌ 未覆盖 |
| `game/battle.ts:117` | 撤退概率 `Math.random() < 1 - 1/rf` | ❌ 未覆盖 |
| `components/BattleReplay.tsx:175` | 回放动画：随机选攻守目标 | ❌ 未覆盖 |
| `components/BattleReplay.tsx:176` | 回放动画：随机选攻守目标 | ❌ 未覆盖 |
| `game/state.ts:736` | roll = Math.random() | ❌ 未覆盖 |
| `game/state.ts:881` | Math.random() < chance（事件触发） | ❌ 未覆盖 |
| `game/state.ts:1054` | Math.random() < chance && weakest | ❌ 未覆盖 |
| `game/state.ts:1071` | destroyChance | ❌ 未覆盖 |
| `game/state.ts:1078` | 0.05 概率分支 | ❌ 未覆盖 |
| `game/state.ts:1161` | roll = Math.random() | ❌ 未覆盖 |
| `game/state.ts:1169` | 掠夺 cargo `Math.random() * 2500` | ❌ 未覆盖 |
| `game/state.ts:1176` | joinLf `Math.random() > 0.5 ? 1 + floor(random*3) : 0` | ❌ 未覆盖 |
| `game/state.ts:1842` | **rollDefenseRepairs** (R6/C6 修复用了 Math.random) | ⚠️ 部分覆盖（root cause 同源，调用栈不同） |
| `game/state.ts:739` | NPC 资源投放 2000 + floor(random*4000) | ❌ 未覆盖 |
| `game/state.ts:750` | planets[Math.floor(...)] 目标选择 | ❌ 未覆盖 |
| `game/npc.ts:166` | **`mulberry32(coords.system * 31337 + coords.position * 7919 + Math.floor(Math.random() * 1e6))`** | ⚠️ **半 seed 化（最危险）** |
| `game/npc.ts:180` | **`mulberry32(Math.floor(Math.random() * 1e9))`** | ⚠️ **全 fresh seed** |
| `game/accounts.ts:68` | 玩家 ID 生成 | ✅ 跳过（cosmetic） |
| `components/toasts.tsx:18` | Toast ID | ✅ 跳过（cosmetic） |

### Summary

- **game-logic PRNG**：19 hits / 18 callsites（rollDefenseRepairs 算 1）
- **半 seed 化（mulberry32 + Math.random 混用）**：2 hits / npc.ts
- **R9 §2.2 实际覆盖**：0 / 18（叙事说「已堵」，实际 root cause 链只堵了 1 个函数）
- **R6/C6 rollDefenseRepairs 同源但调用栈不同**：state.ts:1842（防御修复逐座 70% 掷骰）
- **cosmetic（可跳过）**：2 hits

## 3 个最危险点

### 1. `npc.ts:166/180` — 半 seed 化

```ts
// npc.ts:166 — seed 注入 fresh entropy（半确定性）
const rng = mulberry32(coords.system * 31337 + coords.position * 7919 + Math.floor(Math.random() * 1e6))
// npc.ts:180 — seed 本身就是 fresh entropy（全随机）
const rng = mulberry32(Math.floor(Math.random() * 1e9))
```

这是 OGame 当前最隐蔽的 bug：开发者**以为**自己有 seed 化（mulberry32 在），但 seed 本身由 `Math.random()` 喂入 → 实际每次刷新都是 fresh entropy → replay 一致性完全失效 → code-review §4 P1-4「战斗确定性被 Math.random 污染」**仍然成立**。

### 2. `state.ts:1842` rollDefenseRepairs — R6/C6 修复 root cause 同源

R6/C6 修了「逐座 70% 掷骰」逻辑，但 `Math.random() < 0.7` 在 load + replay 时仍会 re-roll。R9 §2.2 「战役落库」修了「save 后收益不被 re-roll」，**没**修「save 后防御修复不被 re-roll」。

玩家行为：save → reload → 看到 5/8 防御修好；同 save → reload → 看到 6/8 防御修好。

### 3. `battle.ts:80/100/117` — 战斗核心 PRNG

- 80：目标选择（每次攻击选哪个 defender）
- 100：反击概率 `Math.random() < 1 - ratio`
- 117：撤退概率 `Math.random() < 1 - 1/rf`

这 3 个调用影响**战斗结果**（不是动画）。R9 §2.2 只 freeze 了「最终收益」，没 freeze「中间 dice roll」→ 同 fleet 攻击同 NPC，结果**会**因 reload 而变（dice 重 roll）。

## 影响重判

decision.md 原评：「low impact × high feasibility 排除」

修正后（基于 19 game-logic callsites + 2 半 seed 化 + 1 个核心战斗链）：

- **impact**：**mid-high**（不是 low）—— 影响 replay 一致性、save-load 一致性、NPC 行动可复现性、code-review P1-4 闭环
- **feasibility**：**high** —— 已有 mulberry32 模板（npc.ts 用了），改写模式固定
- **scope 估**：19 callsites × 平均 3 行 diff = ~60 行 TS 改动 + 1 个 PRNG 抽象
- **依赖**：无（独立 track，不依赖任何 user 战略输入）

## 建议（mini-IWO，不进 R10 shortlist）

```
IWO-20260919-004: PRNG seed 化（独立 track）
  status: draft
  authority_level: P2_draft（写代码 + 单元测试）
  parent: code-review §4 P1-4
  scope:
    1. 引入 single PRNG context（seed = slotVersion * 1e9 + state.tick + playerId）
    2. 19 game-logic Math.random() 全部替换为 context.next()
    3. npc.ts:166/180 半 seed 化 → 全 seed 化（用 coords.system/position/timeWindow 作为 seed）
    4. 加 1 个 replay 一致性 unit test（save → reload → diff = 0）
  rollback: revert 1 commit（无 schema migration 牵连）
  human_gate_triggers:
    - 修改存档 schema（不需要）
    - 改写 game balance 公式（不需要）
    - 改 player ID 生成（不需要）
  estimated_lines: ~60 TS + ~30 test
  estimated_time: 2-3 小时
```

## 给 user 的 3 选项

1. **进 R10 shortlist**：替换 (e) C8 存档迁移 或 跟 (e) 并行（影响 R10 时间盒）
2. **走独立 track**：不进 R10 shortlist，单独排期（推荐 — 不抢 R10 资源）
3. **继续排除**：承认 evidence 但仍判断 ROI 低（需要 user 拍 — AI 已不主张 narrative 排除）

## 与 (a)/(d)/(e) 的关系

- 不冲突：(a) 终局教程、(d) 中期内容、(e) C8 存档迁移都是「设计/UX 类」
- 不依赖：(c) 是纯技术债清理，跟其他 3 项无 shared work
- 不阻塞：可独立完成

## 关联文件

- `decision.md` §显式排除 (c)
- `code-review.md` §4 P1-4（战斗 PRNG）
- `R9 §2.2`（战役落库，root cause 同源但覆盖范围有限）
- `prep/prep-candidate-a-victoria3.md` 附录 A（PRNG 跟数值修值无直接关系）

## ponytail 标记

> ponytail: 19 callsites 是当前快照。`Math.random()` 调用栈可能在 R10 实施期间继续增长（OODA 推论：每次新加 game-logic 随机分支都会叠加）。**升级路径**：commit-time 加 lint rule（`no-restricted-syntax` 禁 `MemberExpression[object.name='Math'][property.name='random']`），在源头堵死。
