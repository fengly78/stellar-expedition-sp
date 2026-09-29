# Change Request CR-20260921-001：关闭 Go freeze IWO，登记 V1.3 技术路线生效

> 依据《新 OGame 游戏设计与工程基线 V1.3》09.2 变更流程编制。
> 状态：**Effective（已生效）** ｜ 类型：**Major**（核心模型变化：服务端技术路线与现存代码资产处置）

| 字段 | 内容 |
|---|---|
| CR ID | CR-20260921-001 |
| 提出日期 | 2026-09-21 |
| 负责人 | 项目所有者（fengl） |
| 批准人 | 项目所有者（fengl），2026-09-21 会话确认 |
| 生效版本 | 基线文档不变（V1.3 已含第 13 章裁决）；本 CR 生效于代码库治理层 |
| 关联文档 | V1.3 §13.1–13.7、§07.1、§09.2；`CODEX_HANDOFF.md`；`doc/gap-analysis-v1.3-baseline-vs-codebase.md`；IWO-20260919-003（`doc/governance/R10-candidate-selection/prep/prep-go-strategic-iwo-skeleton.md`） |

---

## 1. 问题

V1.3 第 13.1 节已正式裁决首版技术路线为 **Web/PWA 客户端 + PHP 8.x/Laravel 服务端 + Rust 战斗与模拟 + MariaDB/MySQL**。

代码库现存决议与该裁决存在正面冲突：

- `cmd/server/main.go`、`internal/battle/battle.go`、`internal/game/objects.go`、`internal/tick/tick.go` 四个 Go 文件按 IWO-20260919-003 标记 FROZEN，头注释写明"Unfreeze only if/when a P2P route is chosen"。
- 该 freeze 决策的前提是"单机路线 + 未来可能 P2P"，此前提已被 V1.3 推翻：首版服务端为 PHP/Laravel，Go 不在任何一层的技术清单中（表27）。
- 若不作正式处置，FROZEN 注释会持续误导后续开发者将 Go 骨架视为"待解冻的服务端起点"，违反 V1.3 §13.4 的模块边界与表28 的语言所有权。

## 2. 证据

1. V1.3 §13.1：「本项目首版采用 Web/PWA 客户端 + PHP/Laravel 服务端 + Rust 战斗与模拟的组合」；§13.2 明确不采用 Unity/C#，表27 技术清单中无 Go。
2. 差距分析 §1/§2：Go 骨架从未接线到前端（仅 :8080/healthz），840 行，`internal/tick` 为 StubStore 空实现；`migrations/0001_init.sql` 为 Postgres 方言，与裁决的 MariaDB/MySQL 不符。详见 [gap-analysis-v1.3-baseline-vs-codebase](../gap-analysis-v1.3-baseline-vs-codebase.md)。
3. `CODEX_HANDOFF.md` P3.10：freeze 决策记录及"DO NOT delete without an explicit re-architecture decision"——本 CR 即该显式再架构决策。
4. Go 与 TS 两份硬编码常量已漂移（例：殖民船成本 Go 10000/20000/6000 vs TS 8000/12000/4000），证明该骨架不具备作为配置来源的资格（违反 V1.3 表28 配置红线）。

## 3. 当前规则/状态 与 建议规则/状态

| 对象 | 当前 | 建议（本 CR 批准后） |
|---|---|---|
| IWO-20260919-003 | active，冻结条款含"P2P 路线解冻" | **关闭（Closed/Superseded）**。解冻条款作废：解冻理由（P2P）与目标技术（Go）均被 V1.3 取代 |
| Go 四文件 FROZEN 注释 | "Unfreeze only if/when a P2P route is chosen" | 注释保留为历史记录，追加一行指向本 CR 与 V1.3 §13，明确**不再存在解冻路径**；不删除文件、不删除 git 历史 |
| `internal/battle/battle.go` | FROZEN 参考实现 | 角色重定义为 **Rust Classic 战斗模块的等价性测试参照语料**（V1.3 §13.3：同快照、同种子、同规则版本），不进入生产代码 |
| `migrations/0001_init.sql` | 唯一 DB schema | 标记为历史参考（Postgres 方言）；正式 schema 待 SOURCE-01 审计后以 MariaDB/MySQL 迁移重建 |
| Go 模块 `go.mod`（module ogame） | 存在 | 保留不动；不新增依赖、不新增代码；后续如需清理仓库，另开 CR |

**本 CR 不创建任何新代码、不删除任何文件、不修改游戏规则与数值。**

## 4. 影响分析

| 维度 | 影响 |
|---|---|
| Core Rules（CR-001~012） | 无变化。本 CR 是工程治理动作，符合 §02.1"工程细节不改变游戏规则" |
| GDD-01~13 | 无变化 |
| Balance Data RC1 | 无变化；但确认 Go/TS 常量表**不得**作为 RC1 配置来源（仅历史试验数据） |
| API-01 / TEST-01 | 无变化；Go 骨架不含任何命令实现，无测试需要迁移（`internal/battle/battle_test.go` 保留供等价性参照） |
| SIM-01~04 | 间接正面影响：明确批量模拟归属 Rust 侧，PRNG 种子纪律（mulberry32/排序展开经验）迁移为 Rust/PHP 重放规范 |
| E0/E1 启动 | 解除路线歧义，E0（固定 OGameX SHA + SOURCE-01）成为唯一前置 |
| 既有前端 | 无直接影响；TS 结算剥离属后续 E1 切片，不在本 CR 范围 |

## 5. 迁移与旧任务策略

- 无玩家数据、无线上任务、无运行中服务（Go 服务从未接线），故无迁移负担。
- 旧资产处置 = 文档与注释层面重定性，代码零改动。
- 若未来某切片确需引用 Go 战斗实现做对照，只允许以"测试参照"方式只读引用，禁止恢复为服务端组件。

## 6. 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 后续开发者无视本 CR 继续以 Go 起步 | 低 | FROZEN 注释追加本 CR 编号；E0 交接文档将 PHP/Laravel 写为唯一服务端起点 |
| 丢失 Go 战斗实现的参考价值 | 极低 | 文件与测试保留，仅重定性用途 |
| "关闭 freeze"被误读为"删除 Go 代码" | 低 | 本 CR 与注释均明确：不删除、不解冻、仅关闭解冻路径 |

## 7. 回滚方式

本 CR 完全可回滚：恢复 IWO-20260919-003 为 active 并还原注释追加行即可。由于无代码改动，回滚无数据与兼容性风险。

## 8. 生效条件与后续动作

1. ✅ 批准人确认（2026-09-21），本 CR 生效，IWO-20260919-003 状态改为 Closed/Superseded。
2. ✅ 四个 Go 文件头注释已追加 CLOSED 标记：`cmd/server/main.go`、`internal/battle/battle.go`、`internal/game/objects.go`、`internal/tick/tick.go`（2026-09-21 完成，仅注释，零逻辑改动）。
3. ✅ `CODEX_HANDOFF.md` 已追加交接记录，指向本 CR 与 V1.3 基线（2026-09-21）。
4. 完成后即满足进入 E0 的治理前提：固定 OGameX 仓库完整 SHA，启动 SOURCE-01 审计（GAP-01）。**（E0 为开发动作，不在本 CR 范围）**

## 9. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| 2026-09-21 | 项目所有者（fengl） | 批准生效 | 会话确认"完成文档设计"；§8 动作 1–3 已于当日执行 |
