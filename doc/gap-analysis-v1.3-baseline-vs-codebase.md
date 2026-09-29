# E:\Ogame 代码库 对照《新 OGame 游戏设计与工程基线 V1.3》差距分析

- 分析日期：2026-09-21（第二版，替代 v1.2 对照版）
- 基线文档：`新OGame_游戏设计与工程基线_V1.3.docx`（Core Rules 1.0 / Balance Data RC1 / 第 13 章技术路线裁决）+ `新OGame_项目收尾与开发交接_V1.0.md`
- 代码现状：单机 React/TS 原型（`web/src`，zustand + localStorage，22 个 vitest 通过）+ 冻结的 Go 骨架（`cmd/`、`internal/`、`migrations/`，840 行，IWO-20260919-003 FROZEN，从未接线）
- **结论先行**：V1.3 第 13 章已把技术路线裁决为 **Web/PWA 客户端 + PHP/Laravel 服务端 + Rust 战斗与模拟 + MariaDB/MySQL**。这使此前"Go 冻结 vs OGameX 路线"的开放性冲突变成确定性处置问题：**Go 骨架正式出局（保留历史，不解冻）；TS 前端保留但须剥离全部结算逻辑并按 MVP 裁剪；服务端与战斗引擎需按 PHP/Rust 新建**。设计文档阶段已关闭，后续改动只能走 Change Request。

---

## 1. 技术路线对照（V1.3 第 13 章新增，最高优先级）

| 层级（表27） | V1.3 裁决 | 代码现状 | 差距与处置 |
|---|---|---|---|
| PC 客户端 | TypeScript 响应式 Web，仅交互/展示/命令提交 | `web/src` React/TS 单机原型，**客户端持有全部结算逻辑**（state.ts 1975 行：生产、战斗、任务、NPC、存档） | 🟡 部分可复用。UI/页面/组件可演进；**结算逻辑必须全部剥离**，改为提交 GameCommand + 渲染服务端状态 |
| 手机客户端 | 同一 Web/PWA，无独立游戏逻辑 | 前端已是响应式 + PWA（vite build 生成 sw.js/workbox） | 🟢 方向一致，是现状与基线最契合的部分 |
| 游戏服务端 | **PHP 8.x + Laravel**（延续 OGameX 方向） | Go 1.22 骨架（healthz + 空 tick 引擎），FROZEN，从未接线 | 🔴 **路线不符**。Go 骨架不再是"待解冻资产"，而是待处置遗产 |
| 战斗与模拟 | **Rust**（WASM 或服务模块），确定性重放，结果回服务端提交 | Classic 战斗有 Go（`internal/battle/battle.go`，PCG 种子可回放）与 TS（`web/src/game/battle.ts`）双实现 | 🟡 实现不可用（语言不符），但作为 Rust 模块的**等价性测试参照**价值高（13.3 要求同快照同种子同结果） |
| 数据库 | MariaDB/MySQL，表名以 SOURCE-01 审计为准 | `migrations/0001_init.sql` 为 Postgres 方言（BIGSERIAL/JSONB），仅 7 表，无 commands/rulesets/outbox/ledger | 🔴 方言与内容均需重做；仅设计教训（轨道唯一约束、到期事件索引）可迁移 |
| 移动封装 | Post-MVP 评估 | 无 | N/A，不阻塞 |

### 语言所有权红线（表28）对照现状

| 红线 | 现状违反情况 |
|---|---|
| 前端不复制权威结算公式 | 🔴 严重违反：objects.ts/battle.ts/state.ts 包含全部公式与结算 |
| 控制器不绕过命令和账本 | 🔴 无服务端，无从谈起；E1 新建时必须内建 |
| 不以客户端计算结果作为奖励依据 | 🔴 单机原型天然违反（架构未到位前的固有状态） |
| 配置不藏在代码常量 | 🔴 违反：两份硬编码常量表（objects.ts 537 行 / objects.go 255 行）且**已互相漂移**（殖民船成本 8000/12000/4000 vs 10000/20000/6000） |

## 2. Go 骨架处置建议（路线冲突的正式关闭）

V1.2 对照版将此标为"开放冲突"；V1.3 裁决后处置路径已清晰：

1. **不解冻、不删除**：保留 git 历史与 FROZEN 头注释；`battle.go` 的确定性战斗实现抽出作为 Rust 等价性测试的参照语料。
2. **作废 IWO-20260919-003 的解冻条款**：原条款"P2P 路线开时解冻"已被 V1.3 技术裁决取代，应通过一次 Change Request 正式关闭该 IWO，避免后续开发者误以 Go 为服务端起点。
3. **`migrations/0001_init.sql` 标记为历史参考**：MariaDB/MySQL 迁移以 SOURCE-01 审计结果为准重新建立，不在 Postgres 方言上演进。

## 3. TS 前端剥离结算的映射（V1.3 客户端定位）

现有 `web/src` 到 PWA 客户端的改造清单：

| 现有模块 | 处置 | 目标形态 |
|---|---|---|
| `objects.ts`（舰船/建筑/科技/防御常量+公式） | 拆分：纯展示元数据（名称/图标）留前端；**成本、产量、时间公式全部移除**，改由 Preview 接口返回 | 前端只渲染服务端 Preview 的成本/时间/前置 |
| `state.ts`（1975 行状态机：tick 结算、任务推进、NPC、战斗调用） | **整体退役为单机 demo**；新客户端以服务端状态为唯一真相，本地仅缓存视图状态 | zustand store 变为 API 缓存 + 乐观 UI，离线不伪造结果（13.2） |
| `battle.ts` + `prng.ts` | 退役为参照实现；mulberry32/种子纪律写入 Rust 模块等价性测试 | Rust Classic 引擎 + 等价性测试套件 |
| `npc.ts`（自动 regen + 模板反击） | 废弃；海盗按 GDD-05 重做于服务端 | 服务端真实经济 AI 实体 |
| 越界功能（回收 209、远征、导弹、防御 401+、月球/密集阵、死星 214、商人、军官、战役/成就扩展） | 按 04.2 隔离：UI 入口下线或隐藏，常量归档为 Post-MVP 参考 | MVP 五舰五任务十二建筑九科技 |
| 页面层（12 页面 + GameScreen + 响应式/PWA） | **主要可复用资产**：按 MVP 范围裁剪页面集，接入命令 API | PC/移动同源 PWA 客户端 |

## 4. 架构与结算基线（07 / GDD-13 / 11.3）差距

与 V1.2 对照结论一致且不变，按 V1.3 技术栈重新指明落点：

| 基线要求 | 现状 | 落点 |
|---|---|---|
| 统一 GameCommand 外壳、双层幂等 | 🔴 无 | Laravel：命令总线 + `game_commands` 表（command_id 唯一约束） |
| Ledger + Outbox 同事务持久化 | 🔴 无 | Laravel：`resource_transactions` + `game_outbox`，事务内写入，提交后分发 |
| 版本化配置（key/value/unit/status/ruleset_version/hash…） | 🔴 无 | 版本化 JSON/YAML 配置集 + 启动校验；任务创建锁定 rulesetVersion |
| 事件驱动到期队列，Worker 崩溃安全 | 🔴 Go tick 是空 StubStore | Laravel 队列 Worker + `events` 到期索引（可参考旧 schema 思路重建） |
| 分段离线生产结算 | 🔴 前端整段 wall-clock 结算 | Economy 模块事件驱动结算 |
| 资产对账恒等式、互斥计价 | 🔴 无 | Settlement 模块 + TEST-01 守恒断言 |

## 5. Core Rules / GDD / Balance / SIM / TEST 差距

此部分结论与 V1.2 对照版完全一致（V1.3 未改规则与数值），要点复述：

- **CR-010 服务器权威**：不满足，架构未建。
- **CR-006 AI 同规则**：`npc.ts` 的 `npcRegen` 自动补齐违反零作弊，海盗须按 GDD-05 在服务端重做（BUILD/SCOUT/RAID/RECOVER 行为 + GROWTH 等策略状态两组枚举分离）。
- **CR-007 总督**：无实现，授权/预算/撤销/审计全缺（GDD-06、GAP-08）。
- **范围**：现有 11+ 舰种、8 任务、防御/月球/商人/军官越界（见 §3 裁剪表）；反向缺口：联盟基础（GDD-08）完全无实现。
- **Balance RC1**：公式形与数值全面不同（产量 1.1^L×4 速 vs F-02；能源赤字 0.2 下限 vs F-03 无下限；仓容 2^L vs F-04 的 1.6 几何级数；军事 10%/级 vs F-07 的 5%；槽位 1+等级上限 5 vs F-06 的 2+等级）。现有数值仅作历史试验数据，不作 RC1 来源。
- **SIM-01~04**：无模拟器、无行为策略机器人，全部 Not Run；V1.3 明确模拟属 Rust 侧职责。
- **TEST-01**：现有 22 个 vitest 全在 L1 公式层；L2~L6 与 33 条 P0/P1 全部为零。

## 6. 可复用资产清单（按 V1.3 重新评估）

| 资产 | V1.3 下的角色 |
|---|---|
| Go `battle.go` + TS `battle.ts` 确定性 Classic 战斗（种子回放、排序展开） | Rust 战斗模块的**等价性测试参照**与设计语料；不进入生产代码 |
| `prng.ts` + oxlint 禁 Math.random 治理 | 种子纪律经验，迁移为 Rust/PHP 两侧的重放规范 |
| `web/src` 页面/组件/响应式/PWA 基建 | PWA 客户端的主要演进基础（剥离结算后） |
| objects.ts/go 常量表 + R9/C3/C4 调参注释 | SIM 对照组历史输入；RC1 不引用 |
| vitest 基建与测试文化 | 前端 L1 层延续；TEST-01 矩阵在 PHP/Rust 侧新建 |
| 旧 Postgres schema 设计教训（轨道唯一、到期索引） | MariaDB 迁移设计参考 |

## 7. 启动顺序（对齐交接文档 §5 与基线 11.8）

按 V1.3 裁决后的 E0/E1 最小纵切：

1. **CR-001（流程动作）**：提交 Change Request 正式关闭 Go freeze IWO，登记技术路线已按 V1.3 第 13 章裁决。
2. **E0**：固定 OGameX 仓库、完整提交 SHA、依赖锁与数据库版本（关闭 GAP-01）；完成 Planet/Resource/Queue/事务入口映射（SOURCE-01）。
3. **E1 配置**：建立版本化配置与完整性校验，补齐首批 TBD（聚变/仓库成本、五舰速度燃料、时间公式等，清单见基线 11.3）。
4. **E1 骨架（Laravel）**：GameCommand 外壳 + 幂等记录 + Ledger + Outbox + 单行星资源生产分段结算；用重复/乱序/崩溃恢复测试证明同一命令只生效一次。
5. **E1 客户端**：TS 前端改造为命令提交 + 状态渲染的最小纵切（总览 + 资源 + 队列），退役 state.ts 结算。
6. 回归通过后按 07.4 进入 E2（建筑/科研/造船）。

**首周期不做**：完整 AI、联盟、市场、回收、在途拦截、移动封装（基线 11.8 / 13.2）。

## 8. 差距总表（V1.3 版，按优先级）

| # | 差距 | 基线引用 | 优先级 |
|---|---|---|---|
| 1 | CR 关闭 Go freeze IWO；登记 PHP/Laravel + Rust 路线生效 | 13.1 / 09.2 | P0 第一步 |
| 2 | GAP-01：固定 OGameX SHA + SOURCE-01 映射 | 08.1 / DOR-03 | P0 阻塞 E1 适配定稿 |
| 3 | Laravel 服务端从零：命令/幂等/Ledger/Outbox/事件队列 | 07.2 / GDD-13 | P0 |
| 4 | 版本化配置体系 + 首批 TBD 补齐 | 11.3 / GAP-02 | P0 |
| 5 | TS 前端剥离结算、改造为 PWA 命令客户端 | 13.1/13.2 / 表28 | P0（随 E1 纵切） |
| 6 | Rust 战斗/模拟模块 + PHP/Rust 等价性测试 | 13.1/13.3 / 06 | P0（GATE-B 前置） |
| 7 | 范围裁剪：越界舰种/任务/防御/商人/军官隔离为 Post-MVP | 04.2 | P0 |
| 8 | 海盗真实经济重做（废除 npcRegen）、总督系统新建 | GDD-05/06 | P0（E5） |
| 9 | 保护体系 N0~N3 + ProtectionService | GDD-09 / GAP-03 | P0（E4） |
| 10 | SIM-01~04 运行与 GATE-B 证据链 | 06 / 11.4 | P0 |
| 11 | TEST-01 L2~L6 与 33 条验收矩阵 | 08.3 | P0 |
| 12 | 联盟基础 | GDD-08 | P1 |
| 13 | 技术验收清单 8 项（表29）逐项落实 | 13.5 | 随各 GATE |

**一句话总结**：V1.3 把技术路线定死后，本仓库的真实处境是——**客户端有半成品可演进，服务端与战斗引擎需按 PHP/Laravel + Rust 新建，Go 骨架转为历史资产**；设计阶段已关闭，下一步唯一合规入口是 Change Request + E0 源码冻结。
