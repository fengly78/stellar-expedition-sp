# Stellar Expedition SP 图形化 VPS 架构设计

> 状态：设计提案，等待评审
> 日期：2026-09-29

## 1. 目标

将 Stellar Expedition SP 演进为一款以浏览器图形界面为唯一玩家入口的太空策略游戏，生产环境运行在单台 VPS 上，技术栈收敛为：

- React + TypeScript 图形客户端
- TypeScript API 与任务 Worker
- Rust 确定性战斗核心
- MariaDB 数据库与任务队列
- Nginx HTTPS 入口

玩家不需要接触命令行、JSON、数据库或脚本。命令行仅用于开发、部署、迁移和运维。

## 2. 非目标

- 首阶段不做 Kubernetes、多 VPS 集群或微服务拆分。
- 不引入 Redis、RabbitMQ 等额外队列基础设施。
- 不让客户端直接决定资源、建造、舰队和战斗结果。
- 不继续扩展 Go 服务端骨架。
- 不一次性重写全部游戏规则；已有可验证的 Rust 战斗规则和测试继续复用。

## 3. 总体架构

```text
浏览器
  │ HTTPS
  ▼
Nginx
  ├── /          React + TypeScript 静态图形界面
  └── /api       TypeScript API
                    ├── MariaDB：游戏数据、账本、任务、审计
                    ├── Worker：到期任务与资源结算
                    └── Rust：战斗与模拟
```

### 3.1 图形客户端

继续使用现有 React、TypeScript、Vite、Tailwind 和 Zustand。客户端只负责：

- 绘制星球、建筑、舰队、星系和战报界面。
- 收集点击、拖动、缩放、筛选和表单输入。
- 显示服务器返回的状态、队列、结果和错误。
- 在离线单机模式下保存本地演示存档。
- 在服务器模式下通过 API 读取和提交命令。

客户端不得把资源增量、建造完成、战斗胜负或舰队到达结果作为权威状态写入服务器。

### 3.2 TypeScript API

推荐使用 Node.js、Fastify、TypeScript 和 Zod。API 层负责：

- 身份认证、令牌和会话。
- 玩家、星球、资源、建筑、研究和舰队命令。
- 请求校验、权限校验和幂等键校验。
- 读取聚合后的游戏状态。
- 将需要延迟执行的命令写入 MariaDB 任务表。
- 将战斗请求发送到 Rust 核心并保存结果。

API 只通过领域服务修改状态，不允许路由处理器直接拼接复杂 SQL 或修改多个资源表。

### 3.3 Worker

Worker 是独立的 TypeScript 进程，与 API 使用相同的领域服务和数据库连接配置。它负责：

- 资源产出结算。
- 建筑、研究和造船完成。
- 舰队出发、到达、返航和回收。
- 战斗排队与结果落库。
- 失败任务重试和死信记录。

Worker 通过数据库行锁领取任务。每项任务必须具备幂等键，重复执行不会重复发放资源或重复扣除资源。

### 3.4 Rust 战斗核心

Rust 保留为独立的确定性计算模块，负责：

- 战斗轮次与伤害。
- 速射、防御和损耗。
- 燃料、航时和战斗模拟。
- 固定种子随机数。
- 战斗回放输入和输出。

第一阶段通过 Node.js 适配器调用 Rust。适配器隐藏具体调用方式，后续可以切换为 WASM、N-API 或独立 Rust 进程，而不改变 API 和领域服务接口。

### 3.5 MariaDB

MariaDB 是生产环境唯一权威数据源，保存：

- 玩家、账号、令牌和权限。
- 星球、建筑、科技、舰船和防御。
- 资源账本与资源交易记录。
- 建造、研究、造船和舰队任务。
- 战斗快照、战报和回放数据。
- 失败任务、审计事件和存档版本。

SQLite 只用于本地开发和自动化测试，不作为线上运行依赖。

## 4. 任务队列设计

使用 MariaDB 任务表，不额外引入 Redis 或 RabbitMQ。

任务表至少包含：

```text
id
type
aggregate_type
aggregate_id
payload_json
status
available_at
locked_at
locked_by
attempts
last_error
idempotency_key
created_at
completed_at
```

Worker 使用事务完成以下流程：

1. 选择 `status = pending` 且 `available_at <= now()` 的任务。
2. 使用行锁领取任务并写入租约。
3. 在同一业务事务中锁定相关星球、资源和舰队记录。
4. 执行领域结算并写入账本。
5. 成功则标记 `completed`；失败则增加重试次数并设置下一次时间。
6. 超过重试上限后写入 `failed_jobs`，保留人工审计信息。

所有结算操作必须可以安全重试。任务队列不是简单的定时脚本，而是服务器时间推进和崩溃恢复的基础设施。

## 5. 图形界面信息架构

### 5.1 一级页面

- 主菜单和服务器连接
- 星球总览
- 建筑建设
- 科技研发
- 轨道制造
- 行星防御
- 舰队指挥
- 星系地图
- 战报与战斗回放
- 排行榜、图鉴、成就和设置

### 5.2 统一交互规范

- 顶部资源 Dock：金属、晶体、重氢、电力和仓容。
- 左右信息面板：状态、筛选、详情和操作。
- 中央场景：星球、建筑、舰队或星系地图。
- 底部队列：建造、研究、制造、舰队和任务状态。
- 所有按钮有加载、禁用、错误和完成状态。
- 所有服务器错误转换为可读的中文/英文提示。
- 桌面端支持 1440×900；移动端支持窄屏折叠和 More 抽屉。

## 6. 数据流与权威性

```text
用户点击图形按钮
  → TypeScript API 校验命令和权限
  → MariaDB 记录命令与幂等键
  → Worker 领取到期任务
  → 领域服务锁定资源并写入账本
  → 必要时调用 Rust 战斗核心
  → MariaDB 提交结果和审计记录
  → API 返回新的聚合状态
  → 图形界面更新
```

客户端可以预测动画和显示等待状态，但最终资源、舰队、战斗和奖励必须来自服务器返回值。

## 7. VPS 部署

初始部署使用单台 Ubuntu 24.04 VPS：

- 2 vCPU
- 4 GB RAM
- 40 GB SSD
- MariaDB 本机部署
- Nginx 终止 HTTPS
- Node API 和 Worker 由 systemd 管理
- Rust 核心作为构建产物随服务发布

Docker Compose 作为开源项目的本地开发和演示入口，可启动 MariaDB、API、Worker 和前端；生产 VPS 不强制使用 Docker。生产也可以直接使用 systemd、Nginx 和 MariaDB。

必须配置：

- TLS 证书和自动续期。
- SSH 密钥登录和防火墙。
- MariaDB 仅监听本机或私有网络。
- 每日数据库备份和定期恢复演练。
- API、Worker、Nginx 和 MariaDB 日志轮转。
- 服务异常自动重启。

## 8. 一次性重写与切换

本项目采用一次性重写方案，不运行 PHP 与 TypeScript 双写，也不在生产环境长期保留兼容层。旧 PHP 服务在重写期间只作为规则、接口和测试参考；新系统在独立目录、独立数据库和独立 VPS 环境完成后，执行一次停机迁移和切换。

### 重写阶段

1. **冻结基线**：固定规则集、账本语义、Rust 战斗语料、图形界面信息架构和验收用例。
2. **建立新仓库结构**：`web/`、`server/`、`combat/`、`db/`、`ops/`，不在新运行链路引入 PHP 或 Go。
3. **实现 TypeScript 服务端**：认证、状态查询、命令、领域服务、MariaDB 访问和错误协议。
4. **实现 MariaDB 数据层**：正式表结构、账本、任务、审计、幂等约束和备份恢复脚本。
5. **实现 Worker**：资源、建造、研究、制造、舰队和战斗任务的锁、重试与死信流程。
6. **接入 Rust**：通过适配器调用确定性战斗核心，复用现有 corpus 和回放测试。
7. **完成全图形界面**：所有玩家流程从启动、登录、建设、舰队到战报都通过 React 页面完成。
8. **建立完整验收环境**：在与生产一致的 VPS 镜像上运行全量集成、浏览器、故障恢复和性能测试。

### 一次性切换步骤

1. 冻结旧系统写入，公告维护窗口。
2. 从旧数据库导出并转换账号、星球、资源、队列、舰队和战报数据。
3. 导入新 MariaDB，运行守恒、唯一性、外键和幂等检查。
4. 启动 TypeScript API、Worker、Rust 核心和 Nginx。
5. 执行冒烟流程：登录、读取星球、提交建造、Worker 结算、舰队任务和战报查看。
6. 切换 DNS 或反向代理流量到新系统。
7. 保留旧数据库和旧 VPS 的只读快照，确认观察窗口通过后再下线。

### 回滚条件

出现资源守恒错误、任务重复结算、战斗结果不一致、数据导入丢失或核心图形流程不可用时，立即切回旧系统快照。切换前必须验证旧系统快照仍可启动。

## 9. 测试策略

- TypeScript 单元测试：领域规则、权限、幂等和任务状态机。
- MariaDB 集成测试：事务、锁、索引、迁移和恢复。
- Rust 测试：公式、确定性随机数、战斗语料和回放。
- 浏览器测试：登录、星球、建设、研究、舰队、战报和移动布局。
- 端到端测试：提交命令 → Worker 结算 → API 返回 → 图形界面更新。
- 故障测试：Worker 重启、重复任务、数据库断开、Rust 调用失败和过期租约。

## 10. 发布验收标准

1. 玩家从启动到完成一局游戏都可以使用图形界面。
2. 玩家不需要输入命令、JSON 或打开终端。
3. 资源、建造、研究、舰队和战斗结果全部由服务器权威计算。
4. Worker 重启后任务不会丢失或重复结算。
5. MariaDB 迁移可以在空库和备份库上成功执行。
6. Rust 战斗结果通过固定语料和回放测试。
7. 单台 VPS 可以完成部署、更新、备份和回滚。
8. API、Worker、数据库和前端都有健康检查或可诊断日志。

## 11. 主要风险与控制

| 风险 | 控制措施 |
|---|---|
| 一次性重写过大 | 采用阶段化迁移，先做查询和图形界面，再做写入链路 |
| 任务重复结算 | 幂等键、行锁、账本唯一约束和重试测试 |
| Rust 调用方式变化 | 用 TypeScript 适配器隔离 WASM/N-API/进程调用 |
| 单 VPS 故障 | 自动备份、恢复演练和可回滚发布包 |
| 前后端状态分叉 | 所有奖励和资源以服务器状态为准 |
| 旧 PHP/Go 代码混淆贡献者 | README 明确主链路、冻结资产和迁移阶段 |

## 12. 结论

项目可以稳定地收敛到 **React/TypeScript 图形界面 + TypeScript API/Worker + Rust 战斗核心 + MariaDB + 单 VPS**。Docker Compose 只作为开发和演示便利，不作为生产前提。该方案满足全图形界面目标，同时保留现有 Rust 战斗资产和 MariaDB 事务能力。

## 13. 2026-09-30 收尾裁决：新旧服务端边界

本设计现进入 implementation baseline。

仓库中的 `game-server/` PHP/Laravel 仅作为旧实现、迁移与规则交叉验证来源；**不得**成为新生产链路的依赖。

新生产主链路固定为：

```text
web/
→ TypeScript API
→ TypeScript Domain Services
→ MariaDB Tasks / Ledger
→ TypeScript Worker
→ Rust CombatPort
```

`server/` 当前仍是待初始化的新 TypeScript 服务目录。实施时第一批模块不是业务页面，而是：

1. Ruleset Compiler
2. Ruleset Semantic Validator
3. Legacy Mapping Validator
4. Ledger / Idempotency primitives
5. Task Worker state machine

RC2 的配置入口固定为：

`config/rulesets/ruleset_manifest_rc2_candidate.json`

任何新服务代码不得绕过 manifest 自行拼接规则源。

### 架构状态

- 技术路线：冻结进入实现
- 单 VPS：Beta1 继续成立
- MariaDB Task Queue：继续成立
- Rust CombatPort：继续成立
- PHP 双写：禁止
- Go 主链路：禁止
- Redis/RabbitMQ：Beta1 不引入，除非有实测瓶颈和变更记录

