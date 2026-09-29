# 设计基线文档索引（文档设计阶段收尾）

- 整理日期：2026-09-21
- 状态：**文档设计阶段已关闭**。V1.3 为唯一有效基线；后续任何规则、参数或技术路线改动只能通过 Change Request、源码审计（SOURCE-01）或模拟报告（SIM）进入 V1.4 及后续版本，不再直接修改 V1.3。

## 1. 唯一有效基线

| 文档 | 位置 | 说明 |
|---|---|---|
| 新 OGame 游戏设计与工程基线 V1.3 | `新OGame_游戏设计与工程基线_V1.3.docx`（仓库根目录副本） | Core Rules 1.0 + GDD-01~13 + MVP 范围 + Balance Data RC1 + SIM-01~04 + SOURCE/API/TEST 规范 + §13 技术路线裁决（Web/PWA + PHP/Laravel + Rust + MariaDB） |
| 项目收尾与开发交接 V1.0 | `新OGame_项目收尾与开发交接_V1.0.md`（仓库根目录副本） | 设计阶段关闭声明、已关闭/未关闭清单、开发启动顺序 |

上游原件保存在维护者本地，未纳入此仓库（含 V1.0/V1.1/V1.2 历史快照与 PDF 预览）。

## 2. 本地分析与治理文档（本轮新增）

| 文档 | 位置 | 状态 |
|---|---|---|
| 代码库对照 V1.3 差距分析 | `doc/gap-analysis-v1.3-baseline-vs-codebase.md` | 有效（替代 v1.2 版 `doc/gap-analysis-v1.2-baseline-vs-codebase.md`） |
| CR-20260921-001 关闭 Go freeze、登记 V1.3 技术路线 | `doc/governance/CR-20260921-001-close-go-freeze-tech-route-v13.md` | **Effective**（2026-09-21 批准，§8 动作 1–3 已执行） |
| 开发交接记录 | `CODEX_HANDOFF.md` | 已追加 2026-09-21 交接条目 |

## 3. 当前裁决摘要

- 项目状态：**MVP DEVELOPMENT CONDITIONAL GO**（V1.3 §11.2）。
- 技术路线：TypeScript Web/PWA 客户端（仅命令提交与状态渲染）；PHP 8.x/Laravel 服务端（唯一结算权威）；Rust 战斗与批量模拟；MariaDB/MySQL 持久化。
- Go 骨架（`cmd/`、`internal/`）：IWO-20260919-003 已关闭，无解冻路径；保留为历史与 Rust 战斗等价性测试参照。
- 前端 `web/src`：可演进为 PWA 客户端；结算逻辑须剥离，越界功能（回收/远征/导弹/防御/月球/死星/商人/军官等）隔离为 Post-MVP。

## 4. 未关闭项（进入开发阶段后逐项产生证据）

1. GAP-01：固定 OGameX 完整提交 SHA + SOURCE-01 审计（DOR-03 BLOCKED）。
2. GAP-02：补齐配置 TBD（聚变/仓库成本、五舰速度燃料、时间公式等，清单见 V1.3 §11.3）。
3. SIM-01~04 实际运行（当前全部 Not Run）。
4. E0/E1 开发与 TEST-01 L2~L6 验收矩阵。
5. GATE-F / GATE-B / GATE-R 三道质量门。

## 5. 下一合规入口

E0 源码冻结：固定 OGameX 仓库、完整 SHA、依赖锁与数据库版本 → SOURCE-01 模块映射（Planet/Resource/Queue/事务入口优先）→ 按 V1.3 §11.8 进入 E1 最小纵切。
