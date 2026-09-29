# E0 工作单：OGameX 源码冻结与 SOURCE-01 审计启动

> 依据 V1.3 §08.1 / §11.1 / DOR-03 编制。状态：**待批准**。
> 关联：CR-20260921-001（已生效）、`doc/gap-analysis-v1.3-baseline-vs-codebase.md` §7。

## 1. 目标

关闭 GAP-01：固定上游源码版本，完成 SOURCE-01 模块映射审计，使 E1 适配层与数据库迁移可以定稿。

## 2. 候选基线（2026-09-21 远程核实）

| 字段 | 候选值 |
|---|---|
| OGAMEX_BASE_REPOSITORY | https://github.com/lanedirt/OGameX （MIT，Laravel 12.x，自带 Rust 战斗引擎 PHP FFI，与 V1.3 §13 技术裁决完全同构） |
| 候选 TAG | `0.14.0`（当前最新发布标签） |
| 候选 OGAMEX_BASE_COMMIT | `768b0172975615c527698ed2c79ef24fbe09f894`（refs/tags/0.14.0，git ls-remote 实测） |
| 备选 | `main` HEAD `7c420bad3478d7099791e1f33c920e9ff92822e8`（禁止直接使用 main 浮动引用，仅作对比） |
| BASELINE_DATE | 批准日填写 |

**需要所有者拍板**：确认 `lanedirt/OGameX` 为本项目上游，并选定 `0.14.0` 标签固定（或指定其他标签/提交）。批准后克隆入库（建议 `vendor/ogamex-base` 或独立目录只读保存），记录依赖锁文件（composer.lock / Cargo.lock）与配置哈希。

## 3. SOURCE-01 审计范围（模块优先级按 E1 纵切排序）

| 优先级 | 模块 | 必须交付（§08.1） |
|---|---|---|
| P0 | Planet / Resource / Queue / 事务入口 | 真实路径与符号、数据位置、创建更新完成取消入口、事务边界、Worker、幂等方式、已有测试、Keep/Extend/Replace/Isolate |
| P0 | GameCommand 接入点（现有控制器 → 适配层） | 直写路径清单与成本差异 |
| P1 | Building / Research / Shipyard | 扣费时点（提交 vs 执行）、文明级研究队列、批次交付 |
| P1 | Fleet / Mission / Colony | 燃料、货舱、任务槽、抵达竞争、返航 |
| P1 | Combat（PHP 与 Rust FFI 双实现） | 种子、规则版本、等价性证据（§08.1：同快照同种子同结果，或预定义分布等价容差） |
| P2 | Protection / Intel / Alliance（含 ACS 隔离登记） | 联盟与 ACS 在 MVP 的隔离方案 |
| P2 | Recovery / Settings / 服务器倍率 | 残骸、太空坞、倍率与基础参数分离 |

每个模块登记 Keep/Extend/Replace/Isolate；上游能力不等于开放范围（§04.2）：月球、防御、太空坞、回收、远征、导弹、ACS 须显式登记隔离。

## 4. 环境准备

- 本机无 PHP/Composer/Rust（2026-09-21 实测）。OGameX 自带 Docker Compose（dev/prod），建议以容器作为审计与开发环境；Windows 下开发模式较慢，官方建议生产模式或接受性能开销。
- 需要所有者确认：本机安装 Docker Desktop，或改为原生安装 PHP 8.x + Composer + Rust 工具链。

## 5. 完成标准（E0 离开条件，表26）

- [ ] 完整 SHA、标签、依赖锁、配置哈希落盘于本文件 §2
- [ ] 源码只读副本入库，SOURCE-01 各模块映射表交付
- [ ] GAP-01 标记关闭，DOR-03 由 BLOCKED 转 PASS
- [ ] 测试入口可定位（上游 PHPUnit/Pest 套件能跑通基线版本）

## 6. 停止条件

权威入口或迁移边界无法确认时停止，记录阻塞并升级评审（§11.6），不得用推测路径固化迁移。

## 7. 评审速决卡（2026-09-21 补；附 SOURCE-01 审计实证）

E0 决策拆解为三个可独立勾选的子项：

| # | 决策项 | 候选 | 实证依据（已完成的只读审计） | 结论 |
|---|---|---|---|---|
| E0-a | 上游仓库确认 | `lanedirt/OGameX`（MIT，Laravel 12） | 数值血统与 RC1 同源（五舰成本/A/S 大面积吻合）；自带 Rust FFI 战斗引擎（`fight_battle_rounds`，与 §13 裁决同构）；模块化结构兼容 §07.1 | ☐ |
| E0-b | 冻结标签 | `0.14.0` = `768b0172975615c527698ed2c79ef24fbe09f894` | ls-remote 实测 + 本地浅克隆 `git rev-parse HEAD` 复验一致；源码已可审计（`upstream-ogamex/`，公式/属性/机制提取完毕） | ☐ |
| E0-c | 工具链路线 | **方案 ① Docker Desktop**（上游自带 compose，审计/开发/测试一体化；Windows 下 dev 模式较慢，可用 prod 模式）／**方案 ② 原生** PHP 8.x + Composer + Rust（本机均无，需安装三件套） | 本机实测：无 PHP/Composer/Rust/Docker 运行确认；node 与 Python 可用 | ☐ 选 ① / ☐ 选 ② |

**批准后机械执行清单**：

1. §2 的 BASELINE_DATE 填入批准日，状态转「已生效」；
2. `upstream-ogamex/` 浅克隆转只读副本入库登记（或按 §2 建议移至 `vendor/ogamex-base`）；
3. SOURCE-01 审计草案（`SOURCE-01-ogamex-audit-draft.md`，已覆盖公式/五舰属性/侦察/殖民/战斗结算/FFI + Keep/Extend/Replace/Isolate 初表）转正式登记，按 §3 优先级补齐 P0 模块的「事务边界/Worker/幂等方式/已有测试」细目（需工具链跑 PHPUnit，依赖 E0-c）；
4. GAP-01 标记关闭、DOR-03 转 PASS；
5. CR-20260921-003 进入正式评审（其候选值出处即本上游）。

**不批准/修改路径**：若另选上游或标签，SOURCE-01 审计按 §3 表对新基线重跑（本草案公式提取方法可直接复用）；若两条路线均不接受，记录阻塞升级评审（§6）。
