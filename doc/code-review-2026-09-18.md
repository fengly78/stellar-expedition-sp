# OGame 代码审查报告

- **日期**：2026-09-18
- **已修复并验证**（同日）：见下方进度。验证方式为 `tsc -b` + `vite build`，均返回 0 错误（53 modules transformed）。`go` 未安装，Go 侧修改未经编译验证。

| 原问题 | 状态 |
|---|---|
| P0-1 建筑前置漏判科技（33/43 无法建造） | ✅ 已修 `state.ts:1194`、`Buildings.tsx:37`，并顺带把 UI 的「科技#113」改成真实科技名＋当前等级 |
| P0-2 UI 产量显示失真 | ✅ 已修，新增 `planetProduction()` 作为结算与 UI 的单一真值源 |
| P0-3 战斗回放不刷新 | ✅ 已修，`Reports.tsx` 补 `key`，`BattleReplay` 改用 `useMemo`；顺带修了大规模战斗单位画到画布外的问题 |
| P1-1 Go 后端 7 项数值落后 | ✅ IWO-20260919-003 freeze (2026-09-20) — 见 §2.1 + §4 step 3 |
| P1-2 Go 战斗确定性被 map 迭代破坏 | ✅ 已修 `battle.go` 排序后展开，并新增混合舰种回归测试 `TestDeterminismMixedFleets` |
| P1-3 NPC 难度分档双标 | ✅ 已修 `npc.ts`，`generateNpc` 改用 `npcDifficultyOf` |
| P1-4 随机数被 `Math.random` 污染 | ⏸ 未动，涉及战斗 seed 化改造，见经济文档「待决策」 |
| P1-5 Go tick 静默丢弃失败事件 | ✅ 已修 `tick.go`，失败/未注册不再标记 Complete |
| P2 清单 | ✅ 已修：shipBuildTime 判空、Codex 文案与产出公式、accounts 运行时校验、Modal 闭包与依赖抖动 |

---
- **范围**：`internal/`、`cmd/`、`migrations/`（Go 后端）＋ `web/src/`（React/TS 前端）
- **方式**：全量静态阅读（约 40 个源文件）
- **重要前置说明**：本次审查期间本机 shell（bash / PowerShell）不可用，**`go build`、`go test`、`tsc`、`oxlint`、`vite build` 均未执行**。报告结论全部来自源码静态分析，未经编译器与测试验证。修复前请先跑通构建与现有 `battle_test.go`。

---

## 0. 总体结论

项目当前是**两套并行实现**，且二者互不相连：

| | Go 后端 | Web 前端 |
|---|---|---|
| 状态 | **骨架** | **完整可玩** |
| 存储 | 仅有 SQL schema，无 persistence 实现 | localStorage 单机存档 |
| HTTP | 仅 `GET /healthz` | 不调用任何后端接口 |
| 数值版本 | **停留在旧版** | 已更新到文档 v2 |

实际"已经完成的游戏"是 `web/` 下的 React 前端；`internal/` + `migrations/` 是一份**已经落后于前端数值的平行实现**。这是当前最大的结构性风险：两套数值同源扩散，日后任何一边改动都会造成战斗结算与经济系统的静默偏差。

建议二选一：**要么删除 Go 侧逻辑，把它降级为"未来迁移目标"注释，明确前端为唯一真值源；要么立刻启动对齐**（详见第 4 节）。

---

## 1. P0 — 阻断级（玩家可直接感知的功能失效）

### 1.1 建筑 33「地形改造器」与 43「跳跃门」永远无法建造
- `web/src/pages/Buildings.tsx:37`
- `web/src/game/state.ts:1194`（`upgradeBuilding`）

```ts
meetsRequires(planet.buildings, def.requires)   // 只传了建筑等级
```

`BUILDINGS[33].requires = { 31:4, 113:4 }`、`BUILDINGS[43].requires = { 41:2, 117:5 }`，其中 **113（能源技术）、117（脉冲引擎）是科技 id**，在 `planet.buildings` 里恒为 0，判定永远 false。

这不是单纯的 UI 灰显：后端 `upgradeBuilding` 用的是同一份错误拼接，**实际逻辑层面也拒绝执行**。对比 `Shipyard.tsx:28` 已正确写成 `{...buildings, ...defenses, ...techs}`。

**连带后果**：
- 母星建筑空间永久锁死在 200（`maxFields` 的唯一扩容路径断掉）
- 跳跃门功能整体不可用
- 依赖月球的链路（成就 #17、Sensor Array/Phalanx 玩法）受损

**修复**：两处都改成 `meetsRequires({ ...planet.buildings, ...techs }, def.requires)`。

### 1.2 UI 显示产量与实际产出不符（殖民地偏差最高 30%）
- `web/src/components/GameScreen.tsx:91-93`
- `web/src/pages/Overview.tsx:30-32`
- 对照组（正确实现）：`web/src/game/state.ts:350-352`

`produce()` 正确应用了 `posCoef`，但顶栏与总览页调用 `metalProduction(b[1] ?? 0)` 时**省略了第二参数**（默认 1），且两处都未乘地质学家军官的 `geoMul = 1.15`。

以 `POS_COEF`（`objects.ts:288-304`）为例，殖民地实际与显示的偏差：

| 位置 | 金属（显示/实际） | 晶体（显示/实际） |
|---|---|---|
| 1 号位 | 1.00 / **0.80** | 1.00 / **1.30** |
| 15 号位 | 1.00 / **0.75** | 1.00 / **0.70** |

玩家按 UI 数值规划建造，会遇到"资源不够"的莫名失败。

**修复**：UI 侧提取一个共享的 `productionRates(planet, techs, officers, event)` 纯函数，与 `produce()` 共用同一套计算。

### 1.3 战斗回放：切换不同战报时画面不刷新
- `web/src/components/BattleReplay.tsx:69-75`
- `web/src/pages/Reports.tsx:55`

```tsx
if (slotsRef.current === null) {       // 仅首次构建，之后永不重建
  slotsRef.current = { attackers: ..., defenders: ... }
}
```

`Reports.tsx` 渲染 `<BattleReplay input={r.input} output={r.output} />` 时**未传 `key`**。React 复用同一组件实例 → 展开第二条战报时，画布上仍是上一条的舰船布局与颜色，只有右下角文字更新。

**修复**：`<BattleReplay key={r.id} ... />`（最省事），或改用 `useMemo(() => buildSlots(...), [input, output])`。

**附带问题**：`BattleReplay.tsx:51-52` 的布局 `cols = min(10, ceil(sqrt(total)))`，1000 艘舰队 → 100 行 × 24px = 2400px，远超画布 360px 高度，大规模战斗时绝大多数单位画在可视区之外。

---

## 2. P1 — 功能正确性

### 2.1 Go 后端数值全面落后（清单）
对照 `doc/mvp-balance.md` 与 `web/src/game/objects.ts`，`internal/game/objects.go` 存在至少 7 处漂移：

| 项 | Go (`objects.go`) | 前端 / 文档 v2 | 行号 |
|---|---|---|---|
| 金属/晶体/重氢产量基数 | 30 / 20 / 12 | **50 / 35 / 18** | Go:101,105,109 / TS:139,143,148 |
| 建筑时间公式 | `÷ 2^机器人等级` | **`÷(1+机器人等级)`** | Go:152 / TS:213 |
| 舰船时间公式 | `÷ 2^船坞等级` | **`÷(1+船坞等级)`** | Go:156 / TS:219 |
| 殖民船成本 | 10000/20000/6000 | **8000/12000/4000** | Go:47 / TS:40 |
| 脉冲引擎成本×倍率 | 2000/4000/600 ×2.0 | **1200/2000/500 ×1.6** | Go:91 / TS:129 |
| 船坞 / 实验室 / 能源 factor | 2.0 | **1.75** | Go:67,71,89 / TS:64,68,127 |
| 209 回收船 | **缺失** | 存在（回收任务是 MVP 功能） | Go:40-49 / TS:41 |

其中**建筑时间公式**影响最恶劣：Go 侧机器人厂 Lv.20 时时间是 Lv.0 的 1/1048576，等于秒建，经济曲线瞬间崩塌。

> **2026-09-20 决议（IWO-20260919-003）**：架构决策 = **freeze**。Go 后端从来未接入前端（web/src/state.ts 是 canonical，`:8080/healthz` 是唯一接触面）。Freeze 而非 delete：保留 :8080/healthz + git 历史，P2P 路线开时直接解冻即可；freeze 而非 align：单机路线不浪费 2-3 周对齐返工。cmd/server + internal/{battle,game,tick} 4 文件已加 `// Package X is FROZEN as of IWO-20260919-003` 头注释 + 不进 CI。

### 2.2 Go 战斗模拟不满足确定性保证
- `internal/battle/battle.go:117-133`（`expandFleets`）

```go
for _, u := range f.Units {   // Go map 迭代顺序是随机的
```

单位展开顺序随 map 迭代而变，改变了 RNG 调用序列。**多种舰船混合参战时，同一个 seed + 同一份输入会产生不同的战斗结果**。

而 `migrations/0001_init.sql:99` 的 `battle_reports.seed` 字段正是为回放而设计的——回放会与原始战斗对不上。

`battle_test.go:32` 的 `TestDeterminism` **恰好用单一舰种（100 架 204）通过**，掩盖了该缺陷。

**修复**：遍历前对 `map` 的 key 做显式排序；并把测试数据改为混合舰种。

### 2.3 NPC 难度分档存在双重标准
- `web/src/game/npc.ts:47` → `system <= 10 ? 1 : 2`
- `web/src/game/npc.ts:119` → `system <= 12 ? 1 : 2`

system 11–12 的 NPC 在**生成时**按"困难"配置（更多重战机、高斯炮），但后续的 `npcRegen` 资源回复速率与争夺强度却按"中等"计算。

**修复**：抽出单一 `difficultyOf(system)`，两处共用。

### 2.4 "确定性"随机数被 `Math.random()` 污染
- `web/src/game/npc.ts:150` `counterattackFleet`：用 `Math.random()` 生成 mulberry32 种子
- `web/src/game/npc.ts:164` `pirateFleet`：同上
- `web/src/game/battle.ts:80,100,117`：`simulate()` 全程 `Math.random()`，**无 seed 概念**

既有 `mulberry32` 的价值被完全抵消；战斗结果不可复现 → "Ctrl+F5 刷战斗"成为可能。若需要重保护 Association：前端 `simulate` 应接受 seed 参数并注入 PRNG（Go 侧 `battle.go:70` 已用 `rand.NewPCG` 做出了正确示范，可直接参考移植）。

### 2.5 Go tick 引擎会静默丢弃失败事件
- `internal/tick/tick.go:76-88`

```go
if !ok {
    slog.Warn("no handler registered", ...)
} else if err := h(ctx, ev); err != nil {
    slog.Error("handler failed", ...)
}
if err := e.store.Complete(ctx, ev.ID); err != nil { ... }   // 无论如何都 Complete
```

handler 缺失或执行失败时，事件依然被标记为已完成，**定时事件（建造完成、舰队抵达）会被永久丢失**。

**修复**：仅在执行成功时才 `Complete`；失败走重试计数 / 死信。

---

## 3. P2 — 次要问题

| # | 位置 | 问题 |
|---|---|---|
| 1 | `pages/Codex.tsx:23,37-39,61,86` | 图鉴文案过时：写"建筑 10 / 舰船 9 / 防御 8"，实际 **15 / 12 / 10**；产量文案仍是 30/20/12 |
| 2 | `pages/Codex.tsx:142` | 写"防御战后 70% 修复"，与 `doc/mvp-balance.md:125`「MVP 不做防御修复」矛盾（但 `state.ts:780` 实际实现了修复，**属文档过时**） |
| 3 | `game/objects.ts:218` | `shipBuildTime` 兜底分支直接解引用 `DEFENSES[shipId].cost`，未知 id 抛 `undefined.cost`；应先 `isDefense` 判空 |
| 4 | `components/DispatchWizard.tsx:167` | 货载输入只依赖 HTML `max` 属性，手工输入可超星球储量与货仓上限，UI 无任何提示 |
| 5 | `components/DispatchWizard.tsx:198` | `step===2 && preview`，preview 为 null 时整块空白且无"上一步"，形成死界面 |
| 6 | `game/accounts.ts:17` | `JSON.parse(raw) as Profile[]` 未校验即断言，localStorage 损坏会让 `undefined` 向下游扩散 |
| 7 | `components/Modal.tsx:4-10` | `useEffect` 依赖 `[onClose]`，调用方普遍传内联箭头函数 → 每次渲染重复 add/remove keydown |
| 8 | `pages/Shipyard.tsx:35,111` | 展示导弹发射井容量占用，但 `capHit` 只判 `maxCount`（502/503 的 `maxCount=0`），UI 永远不触发超载提示（`state.ts:1270` 的实际校验是对的） |
| 9 | `internal/tick/tick.go:65` | `process` 使用 `context.Background()`，父 ctx 取消后仍在继续执行 |
| 10 | `cmd/server/main.go:58-59` | 信号处理分支里 `defer shutdownCancel()` 位于 `select` 分支内，实际直到函数返回才执行 |

---

## 4. 建议的处理顺序

1. **先跑通构建**（当前无法验证）：`go build ./... && go test ./...`、`cd web && npm i && npm run build`。这是修复前的前置条件。
2. **修 P0 三件事**：meetsRequires 拼接（1.1）、UI 产量显示（1.2）、BattleReplay 的 key（1.3）。这三处改动都很小，但直接影响可玩性。
3. **做一次架构决策**：Go 后端是删是留。**已决议**（IWO-20260919-003, 2026-09-20）= **freeze**：保留 :8080/healthz 与 git 历史，不对齐 §2.1 的 7 项数值（不浪费 2-3 周），也不删除（保留 P2P 解冻路径）。`cmd/server` + `internal/{battle,game,tick}` 4 文件已加 FROZEN 头注释。
4. **修 §2.2 + §2.4 的确定性链**：统一 seed 化 PRNG，堵住"刷新重开战斗"。
5. **清理 P2**：文案与文档不同步的部分建议一次性在数据和文案之间统一；其余按优先级排入常规迭代。

---

## 5. 做得好的地方

- `web/src/game/state.ts` 的存档迁移链（v2 → v10，第 562-612 行）逐版本递进、可读性好，值得保留这套模式。
- 矿产资源流转（建造扣费 → 队列 → 完成 → 取消返还）三条队列的对称性处理干净。
- `migrations/0001_init.sql` 的部分索引设计到位（`arrive_at` / `return_at` / `execute_at` 的部分索引），注释也解释了 JSONB 选型理由。
- 前端战斗系统完整覆盖了：多舰队参战、快速射击、护盾 1% 弹开、残骸场、月球生成、防御 70% 修复，符合原设计意图。

