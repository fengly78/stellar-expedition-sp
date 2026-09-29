# server/ — PHP/Laravel 服务端（待脚手架）

状态：**未初始化**。本目录为 V1.3 §13.1 裁决的服务端占位。

## 基线约束

- 技术：PHP 8.x + Laravel（表27）；MariaDB/MySQL；Rust 战斗/模拟模块（独立目录待定）。
- 所有资产变更经统一 GameCommand + Ledger + Outbox（§07.2）；控制器禁止绕过命令和账本（表28）。
- 配置唯一来源：`config/rulesets/`（表28 红线：不在代码常量中隐藏候选参数）。
- 内核路线：固定 OGameX 上游 + 规则适配层（§07.1）；**不得**在本目录另起与 OGameX 无关的自研内核。

## 阻塞

1. **GAP-01 / DOR-03**：OGameX 固定 SHA 与 SOURCE-01 审计未完成——见 `doc/governance/E0-source-freeze-work-order.md`。
2. **环境**：本机尚无 PHP/Composer/Rust 工具链（2026-09-21 检查）。OGameX 官方推荐 Docker Compose 部署，工具链可通过 Docker 容器获得。
3. **GAP-02**：配置 TBD 未补齐——`python tools/config_validate.py` 当前报告 economy/shipyard/fleet/combat/colony 五模块 BLOCKED。

以上关闭前，本目录不得生成 Laravel 脚手架或数据库迁移（§11.1：不得用推测的模型、服务或数据表名称固化迁移）。
