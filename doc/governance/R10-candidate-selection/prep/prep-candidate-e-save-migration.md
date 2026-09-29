# Prep Stub — Candidate (e) C8 Save Migration

> 落盘时间：2026-09-19
> 配套文件：`decision.md`（已写入选 #3，本文件为 ready-to-fire 补齐）
> Skill 路由：`save-systems` (skill(name="save-systems"))
> 来源：b23 review finding CR-1（critical）+ b24 evidence 验证

## Decision Object (锁死)

老存档（saveVersion 10 或以下）加载后，C8 能源公式（objects.ts:153-160「选项 B」发电基数 20→40 不乘 SPEED）、C3 晶体曲线（objects.ts:59 factor 1.6→1.5）、C4 NPC 再生（npc.ts:131 400/1000/1600）、C1 研究指数（objects.ts:324-332 cost^0.3）四件 R9 修复改了存档语义但**没加 schema_version 迁移**——所有 v10- 存档加载后数值会跟新公式不一致。

**outcome**：v10- 老存档首次加载自动迁移到 v11，玩家无感；v12+ 上限生效（拒收）。

## Evidence Baseline (一手抓)

| 字段 | 位置 | 状态 |
|---|---|---|
| saveVersion 字段 | `state.ts:264` / `:346` (snapshot) / `:314` (import 校验) | confirmed=11 |
| import 校验 | `state.ts:314`：`saveVersion < 2 \|\| saveVersion > 11` 拒收 | confirmed 无 migrate |
| C8 公式变更 | `objects.ts:153-160` 注释：基数 20→40，去 SPEED | confirmed R9 落地 |
| C3 公式变更 | `objects.ts:59` factor 1.6→1.5 | confirmed R9 落地 |
| C4 公式变更 | `npc.ts:131` 800→400/1000→1000/1600→1600（800+difficulty*1200） | confirmed R9 落地 |
| C1 公式变更 | `objects.ts:324-332` 指数软化 cost^0.3 | confirmed R9 落地 |
| writeSlot 调用 | `state.ts:620/624/1312/1839/1904` 5 处 | confirmed design-correct（撤回 MN-2） |

## 三阶段 Approach（save-systems skill 锁定）

### Stage 1：识别（Identify）— 已完成

- saveVersion 当前值：11
- 4 个公式变更（C1/C3/C4/C8）= 4 个 migration step
- 影响范围：所有 v10- 老存档首次加载
- 拒绝策略：v12+ 仍走 importSlot 拒收（`saveVersion > 11`）

### Stage 2：迁移函数（Migrate）

新增 `migrateSaveData(data: SaveData): SaveData` 纯函数：

```text
migrate(v10) -> v11
├─ data.saveVersion: 10 -> 11
├─ data.planets[].buildings: 不变（建筑等级语义没变）
├─ data.npcs[].spawnProfile: 4 字段 × 3 难度 = 12 NPC 资源重算
├─ data.planets[].resources: 不动（资源是 snapshot 不重算）
└─ data.researchQueue: 不动（researchQueue 是「进行中」不是「已完成」）

migrate(v9)  -> v10 -> v11  (chain)
migrate(v2)  -> ... -> v11   (chain)
```

**风险控制**：纯函数，不改 input；用 try/catch 包 migrate，失败回退 importSlot 拒收 + 提示「请检查存档」。

### Stage 3：接入（Wire）

`importSlot()` (state.ts:310) + `loadSlot()` 调用入口前插 `migrateSaveData(parsed.data)`：

```text
importSlot
├─ 解析 JSON
├─ saveVersion 校验（拒收 <2 或 >11）
├─ [NEW] migrateSaveData(data) ← 在这里
├─ localStorage.setItem(key, raw)
└─ 触发重载 GameStore

state 启动 loadSlot
├─ localStorage.getItem(key)
├─ JSON.parse
├─ [NEW] migrateSaveData(data) ← 在这里（防 autosave 边界外）
├─ setState(...)
└─ render
```

## Tradeoffs

| 方案 | 优 | 劣 |
|---|---|---|
| **forward migration chain（推荐）** | 玩家无感、自动、可逆 | 代码量大（要写 10 个 vN→vN+1 step） |
| 单步 jump（v10 → v11） | 代码量小 | v9-v2 玩家不会自动迁移，体验断层 |
| 一次性 big-bang（删 v10- 存档） | 零代码 | 用户极不友好，且违反 save-systems 「迁移优先于拒收」硬规则 |
| 弹窗问玩家「重新打一局」 | 干净 | 不诚实——R9 修复本质上是「修了 bug」，不是「重新设计」 |

## Skill Routing

| 阶段 | skill | action |
|---|---|---|
| Stage 1 | `save-systems` (skill(name="save-systems")) | Read references/versioning-and-migration.md §Schema Version Chain |
| Stage 2 | `save-systems` | 写 `migrateSaveData` 纯函数 + 单元测试（不需要跑游戏，pure function） |
| Stage 3 | `save-systems` | 接 importSlot + loadSlot 调用 |

## 最小动作清单（user 拍板 (e) 后立即执行）

1. 读 save-systems skill 的 `references/versioning-and-migration.md`
2. 写 `web/src/game/migrate.ts`（pure function + types）
3. state.ts:import + state.ts:314 importSlot 之前调 migrate + state.ts loadSlot 之前调 migrate
4. 写 1 个 unit test：v10 → v11 4 个字段都被改
5. `tsc -b` + `vite build` 双 build 验证

预计代码量：~80 行（migrate.ts 50 行 + state.ts 接 2 行 + test 30 行）

## 阻塞

- ❌ 不消耗 user shortlist 拍板 BLOCKED（(e) 已是 decision.md 入选 #3）
- ❌ 不消耗 Victoria 3 URL / APICO URL / Go 战略 BLOCKED
- ❌ 不消耗任何 user 战略决策（migrate 策略是技术决策）
- ✅ 唯一消耗：user 给「执行信号」（说「跑 (e)」即可触发最小动作清单）

## Ponytail 真限制

- migrate 函数是 pure function，但**用户存档不可逆**——必须 try/catch + 失败拒收，不能「尽力迁移」
- migrate 调用点要全栈审计：importSlot / loadSlot / 自动落库路径 / 战役落库（playCampaign 写 slot 0）都要走 migrate
- v10- 老存档 + v11 新存档并存期间，localStorage 体积翻倍（不同 key 命名隔离）

## 关联

- 关联 prep：`prep-candidate-a-victoria3.md`（R10 终局教程 / 不同候选）
- 关联 prep：`candidate-(c)-PRNG-seed-mini-iwo.md`（独立 track，PRNG seed 化）
- 关联 prep：`prep-candidate-d-mid-game-content.md`（独立 track，中期内容）
- decision.md：已入选 #3，本文件补齐 ready-to-fire