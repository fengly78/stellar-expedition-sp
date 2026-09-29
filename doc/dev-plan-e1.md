# DEV-PLAN-E1：E1 实施计划（切片划分与验收钩子）v0.1

> 状态：Draft · 2026-09-22 · 衔接《项目收尾与开发交接 V1.0》§5 启动顺序
> 输入：V1.3 基线、API-01 命令契约（§11 可追溯性已闭合）、db-schema-draft.sql（结构已验证）、
> SOURCE-01 审计草案（Keep/Extend/Replace/Isolate）、SIM 四件套与黄金语料。
> 纪律：数值一律来自 ruleset 配置（游戏服启动时校验 hash、TBD 拒绝启用），代码不硬编码任何 Balance 常数。

## 1. 切片总览

| 切片 | 范围 | 契约条目（API-01 §3） | 涉及表 | 上游映射 |
|---|---|---|---|---|
| E1-S0 骨架与配置 | Laravel 工程、迁移、Ruleset 版本化加载+hash 校验、命令总线骨架、Outbox 骨架 | 统一信封/状态机（§1/§2） | game_rulesets, game_commands, game_outbox | 工程新增（无上游对应） |
| E1-S1 资源生产闭环 | 行星库存、分段生产结算、建筑队列、建造任务 | BUILD_ENQUEUE / BUILD_START | planets, build_tasks, resource_transactions | Keep（PlanetService 口径参考，重写） |
| E1-S2 科研与造船 | 文明科技、单研究锁、整批造船 | RESEARCH_START / SHIP_ORDER | civilizations, research_tasks, ship_orders | Extend（五舰属性经 CR 回填） |
| E1-S3 舰队任务 | 派遣/召回、航时/距离/燃料、在途守恒、到期 Worker | FLEET_DISPATCH / FLEET_RECALL | fleet_tasks | Keep 公式（GAP-02 解除候选已备） |
| E1-S4 殖民与战斗 | 抵达再校验、殖民建星、Rust 战斗 FFI 结算、掠夺/残骸 | COLONIZE_RESOLVE / COMBAT_RESOLVE | battle_snapshots, planets | Replace（Rust Classic + 语料验收） |
| E1-S5 总督/海盗/情报 | 授权版本化、总督命令、零作弊 AI 状态机、侦察快照 | GOVERNOR_* + scout 情报产物 | governor_authorizations, ai_strategy_states, intel_snapshots | Replace（GDD-05）+ Keep（侦察 §6） |

顺序理由：S0→S1 是交接 §5 第 2~4 步的最小闭环；S2/S3 依次加资产类型；S4 引入跨计算（FFI）与并发风险最高的战斗；S5 全部是"代理人"层，依赖前四层命令入口稳定。

## 2. 逐切片验收钩子（不通过不进入下一片）

- **S0**：迁移在干净库一键建 14 表（`tools/validate_ddl.py` 已通过结构关，MariaDB 实测为本切片验收）；ruleset 加载器对缺 hash / TBD 配置**拒绝启动**（对应 config_validate 的 WARN/ERROR 语义）。
- **S1**：PHP 侧分段生产结算与 `sim/engine.py` 对账——同一脚本化场景（SIM-01 Normal 168h 输入）两侧库存序列逐点一致；守恒恒等式（GDD-13）每事务自检。
- **S2**：升级成本/造船扣费与 `rules/formulas.py` 金值一致（F-01~F-07 测试向 PHP 侧移植为 PHPUnit 等价断言）。
- **S3**：航时/燃料/距离公式按审计 §1.1~1.3 口径实现，用审计中提取的实值样例做表驱动测试；在途两端不同时可花（RES-004）由守恒测试保证。
- **S4**：Rust FFI 按 `doc/rust-combat-ffi-spec.md` 落地，**黄金语料 11 例逐位回放**（G-000 等）为硬验收；掠夺三重限制/氘不成残骸走 SIM-03 G6 场景对照。
- **S5**：总督不越授权（GDD-06 负例测试）；海盗注入恒 0（SIM-04 口径：AI 只能花自己产的）；情报快照只读 Owner 合法字段。

## 3. Isolate 入口关闭清单（防 04.2 范围渗透，随所在切片同步验收）

远征 / ACS / 导弹 / 灭月 / 职业系统 / 防御设施 / 月球 / 太空坞 / 残骸回收 / 暗物质 / 商人 / 联盟仓库 / 玩家市场——适配层显式拒绝这些任务类型与对象 ID，并留审计日志（审计 §4 风险登记）。

## 4. 并行轨（不阻塞切片）

- 前端 PWA：按 `doc/ui-screen-spec-v1.md` / `ui-redesign-spec.md` 做静态原型，S1 起接真实 API。
- 数值闸门：SIM 正式档（sim01~04_formal）待 CR 批准后跑，结果回填 Gate 证据；与编码并行不冲突（代码读配置，不吃数值）。
- CR-002/003 批准后：RC1 回填 → meta.hash → 断言更新，按各 CR 机械清单执行。

## 5. 风险登记

| 风险 | 缓解 |
|---|---|
| 本机无 PHP/Composer/Rust/Docker，S0 起代码不可本地运行 | 见 `doc/dev-env-setup.md` 两条路径；环境未就位前只写可静态检查的代码，不做"已运行"宣称 |
| 上游表结构与我方 DDL 差异（Extend 适配量） | S0 含上游表盘点任务，差异走 CR 修订 DDL |
| 战斗 FFI 跨语言调试成本 | 语料回放先行（Python 侧已逐位等价），FFI 只做绑定不做重写 |
