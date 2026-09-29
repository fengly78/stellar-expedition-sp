# E:\Ogame 代码库 对照《新 OGame 游戏设计与工程基线 V1.2》差距分析

- 分析日期：2026-09-21
- 基线文档：`新OGame_游戏设计与工程基线_V1.2.docx`（Core Rules 1.0 / Balance Data RC1）
- 代码现状：单机 React/TS 原型（`web/src`，zustand + localStorage）+ 冻结的 Go 骨架（`cmd/`、`internal/`、`migrations/`，IWO-20260919-003 FROZEN，从未接线）
- 结论先行：**当前代码与 V1.2 基线不是同一架构代际**。V1.2 要求"服务器权威 + 统一 GameCommand + 版本化配置 + 幂等结算 + 审计账本"的持久多人宇宙；现有代码是客户端单机状态机。可复用的是公式参数参考、确定性战斗引擎经验和 PRNG 治理成果；不能复用的是整体架构、范围（现有功能大量超出 MVP 边界）和 Go 骨架本身（已冻结且未接线）。

---

## 1. 架构与权威边界（07 IMPLEMENTATION-01 / 11 准入）

| 基线要求 | 代码现状 | 差距 |
|---|---|---|
| 模块化单体：OGameX 内核 + 规则适配层 + AI + 版本化配置 | Go 骨架仅 `main.go`(healthz) + `tick`(StubStore 空实现) + `battle` + `game/objects`；**从未接线到前端**；游戏真实状态在 `web/src/game/state.ts`（浏览器 localStorage） | 🔴 无服务器权威。CR-010"服务器是时间、成本、任务、结果的权威"完全不满足；客户端可改存档即改资产 |
| 固定源码审计 SOURCE-01（完整 SHA、真实路径映射） | 无。Go 代码来源是早期自研 MVP，非 OGameX 固定版本审计产物 | 🔴 GAP-01 未启动；现有 Go 已 FROZEN，与"OGameX 内核"路线存在路线决策冲突 |
| 统一 GameCommand 外壳、幂等、Ledger、Outbox | 无。`migrations/0001_init.sql` 只有 users/planets/fleet_missions/events/3 个 queue/battle_reports；无 game_commands、game_rulesets、game_outbox、resource_transactions | 🔴 E1 全部缺失。命令层、幂等键、账本、Outbox 均不存在 |
| 版本化配置（key/value/unit/ruleset_version/hash…），禁止写死数值 | 数值硬编码在 `web/src/game/objects.ts`（537 行常量表）和 `internal/game/objects.go` | 🔴 11.3 参数配置化契约 0% 满足 |
| 事件驱动结算 + 崩溃恢复 + 离线分段生产 | 前端 tick 基于 wall-clock 差值整段结算；Go `tick.go` 是 1 秒轮询 StubStore（返回空） | 🔴 无持久事件队列；离线分段结算（跨完成事件分段）未实现 |

## 2. Core Rules 1.0（CR-001~012）逐条对照

| 规则 | 现状 | 判定 |
|---|---|---|
| CR-001 三资源 M/C/D | ✅ 前后端均为 metal/crystal/deuterium | 满足（概念层） |
| CR-002 能源是本地能力 | ✅ objects.go 有 SolarOutput/EnergyConsumption | 基本满足 |
| CR-003 库存属行星，不可帝国钱包支付 | ⚠️ 前端 planets[] 各自持库存，但单机无并发校验；无事务保证 | 概念满足，机制缺失 |
| CR-004/005 殖民地不可占领、主星保留 | ⚠️ 单机无 PvP 占领逻辑，NPC 攻击只掠夺 | 未被违反，但无 ProtectionService 统一校验 |
| CR-006 AI 与玩家同规则 | 🔴 **违反**。`npc.ts` 有 `npcRegen`：NPC 按时间自动恢复资源/舰队，即"后台补齐"，V1.2 明令禁止（海盗可衰退，不自动补齐） | 违反，需重做海盗为真实经济实体 |
| CR-007 总督 Actor/Owner 分离 | 🔴 无总督系统。现有"军官"(officers) 是被动加成购买品，非授权代理 | 未实现 |
| CR-008 S0/S1/S2 区域分层 | 🔴 无区域概念，坐标仅 galaxy/system/position | 未实现 |
| CR-009 资产唯一不复制 | ⚠️ 单机 zustand 天然单线程，但无幂等/无事务；重复消息防护不存在 | 机制缺失 |
| CR-010 服务器权威 | 🔴 见 §1 | 不满足 |
| CR-011 永久宇宙不清档 | ⚠️ 单机存档语义不同，无可比性 | N/A（架构未到位） |
| CR-012 Classic Combat | ✅ 有 6 回合 Classic 战斗（Go `battle.go` 与 `web/src/game/battle.ts` 双实现，含 rapidfire、护盾、种子回放） | **少数可复用资产之一**，但需适配 5 舰 + 结算层分离 |

## 3. MVP 范围（04 范围表）：现有代码大范围越界

基线 MVP 只允许 5 舰、5 任务、12 建筑、9 科技。现有 `web/src/game/objects.ts` 是一个**全量经典 OGame 克隆**，越界清单：

| 类别 | 越界内容 | 基线立场 |
|---|---|---|
| 舰船 | 现有 11+ 种：大运 203、巡洋 206、战列 207、回收 209、轰炸 211、太阳能卫星 212、死星 214…；MVP 仅 Scout/Small Cargo/Light/Heavy/Colony 五舰 | 回收舰/死星等属 Post-MVP 或永久排除 |
| 任务 | 现有 8 种：transport/deploy/colonize/espionage/attack/**recycle/expedition/missile**；MVP 仅前 5 种 | recycle、expedition、missile 越界 |
| 防御 | 现有完整 DEFENSES 表（401+） | MVP 无防御设施 |
| 月球/密集阵 | `moonAt`、`phalanxLevel`、PHALANX_SCAN_COST | Post-MVP |
| 商人 | `MerchantModal.tsx` | 基线：无明确汇率/额度/来源记录前不进 MVP 闭环 |
| 联盟 | 无 | MVP 需基础联盟（创建/加入/退出/角色/权限）——**反向缺口** |
| 军官 | 5 个被动加成军官（含自定义 tactician/ambassador） | 基线无此系统，属未登记玩法 |
| 战役/成就/教程 | campaign.ts / achievements.ts / tutorial.ts | 基线未定义，不阻塞但需登记范围 |

**含义**：现有前端不能直接演进为 V1.2 MVP；它更接近一个"经典 OGame 全系统单机 demo"。按基线 04.2"不得通过兼容关系扩充范围"，这些功能在 MMO 宇宙中要么删除、要么登记 Post-MVP 隔离。

## 4. Balance Data RC1 对照

| 项 | 基线 RC1 | 代码现值 | 差距 |
|---|---|---|---|
| 矿场产量 F-02 | p=30×L×1.12^(L−1)（M） | Go/TS：`30 × L×1.1^L × SPEED(4)` — 指数底数不同、含全局 4 倍速、L×1.1^L 而非 1.12^(L−1) | 🔴 公式形不同 |
| 能源需求 | M/C: 10L×1.10^(L−1)，D: 15L×1.10^(L−1) | `10×L×1.1^L` / `20×L×1.1^L`（氘 20 非 15） | 🔴 数值与形状均不同 |
| 能源赤字 | e = min(1, 供需比)，E_need=0 时 e=1 | `WithEnergyDeficit` 有 **0.2 下限**（最低保留 20% 产量） | 🔴 语义不同（基线无下限） |
| 仓容 F-04 | 10000+10000×(1.6^L−1)/0.6 | `10000×2^L` | 🔴 曲线不同 |
| 殖民容量 F-06 | 1+ceil(A/2) | 前端无天体物理容量限制（仅 15 轨道唯一约束） | 🔴 未实现 |
| 任务槽 F-06 | 2+计算机等级 | `1+techs[108]` 上限 5 | 🔴 基数与上限不同 |
| 军事科技 F-07 | k=5% 线性（测 4/5/6%） | Go `ShipSpec` 用 **10%**/级 | 🔴 倍率不同 |
| 舰成本 | RC1 五舰表（如 Light 3000M/1000C，Colony 10000/17500/5000 方案B） | Light 3000M/500C；Colony 8000/12000/4000（TS）或 10000/20000/6000（Go） | 🔴 三处数值互不一致 |
| 价值比 F-05 | V = M+2C+3D | 未见统一估值函数 | 未实现 |
| 时间公式 F-08 | 基线自身 TBD | 代码有自有公式 | 两边都未冻结，不可互证 |

**结论**：现有数值表只能作为"历史试验数据"，不能作为 RC1 配置来源；且 Go 与 TS 两份常量已经漂移（殖民船成本不同），印证基线"单一配置源"要求的必要性。

## 5. SIM-01~04 验证框架

| 要求 | 现状 |
|---|---|
| 事件驱动模拟器、run_id/配置哈希/种子/日志/KPI/Gate 输出 | 🔴 不存在。前端有 vitest 22 个单元测试（公式与 PRNG 确定性），但不是 SIM |
| SIM-01 首周首殖 / SIM-02 多行星 / SIM-03 等预算战斗矩阵 / SIM-04 海盗零作弊 | 🔴 全部 Not Run；代码库无模拟器入口、无行为策略机器人（Normal/Active/Casual/Governor） |
| 可复用基础 | ✅ PRNG 治理（mulberry32 + hash32 + oxlint 禁 Math.random）与战斗回放确定性经验，可直接迁移为 SIM 的种子纪律 |

## 6. API-01 命令契约 / TEST-01 验收矩阵

| 要求 | 现状 |
|---|---|
| 13 个玩家命令 + 5 个内部命令枚举 | 🔴 无任何命令层；前端直接 `set()` 改状态，Go 无 HTTP 业务端点 |
| Preview/Execute 分离、accepted/rejected/already_processed | 🔴 无 |
| 12 个业务错误码 + IDEMPOTENCY_CONFLICT + RULESET_UNAVAILABLE | 🔴 无 |
| 33 条 P0/P1 测试（RES/BUILD/TECH/SHIP/FLEET/TRANS/COL/COMBAT/PROT/INT/AI/GOV/CONC/API/VERSION） | 🔴 现有 22 个 vitest 全部落在 L1 公式层 + PRNG 层；L2~L6（领域/事务/异步/场景/模拟）为 0 |

## 7. GDD 系统逐项状态

| 系统 | 基线要求 | 代码状态 |
|---|---|---|
| GDD-01 殖民 | 容量再校验、竞争原子结算、START-A | ⚠️ 单机有 colonize 任务与轨道唯一约束；无容量（Astro）规则、无竞争结算 |
| GDD-02 经济 | 12 建筑、分段结算、仓满停产、运输超额 | ⚠️ 建筑只有 10 项（无聚变、纳米）；仓满/超额规则未见实现 |
| GDD-03 科技舰船 | 9 科技、文明级单研究队列、批次交付 | ⚠️ 现有 10 科技（含越界激光/离子）；研究队列有；造船批次交付语义未按基线 |
| GDD-04 舰队战斗 | 出发事务原子、燃料出发锁定、Classic 引擎与结算分离 | ⚠️ 战斗引擎可复用；无事务、无结算层分离 |
| GDD-05 AI 海盗 | 真实经济、BUILD/SCOUT/RAID/RECOVER、情报驱动 | 🔴 NPC 是脚本化靶子 + 自动 regen + 模板反击，违反零作弊 |
| GDD-06 总督 | 授权、预算、撤销、审计 | 🔴 无 |
| GDD-07 物流 | 物理货舱、在途库存互斥、低水位补给 | ⚠️ 运输任务有；无在途/库存互斥的事务保证、无自动补给 |
| GDD-08 联盟 | 基础联盟 | 🔴 无 |
| GDD-09 保护 | N0~N3、ProtectionService 统一校验 | 🔴 无保护状态机（单机无意义） |
| GDD-10 版本 | 配置版本/哈希/锁定 | 🔴 无 |
| GDD-11 战争 | 仅资源袭击 | ⚠️ 有 attack；但含 missile/expedition 越界 |
| GDD-12 情报 | 快照带时戳、不自动刷新、合法可见字段 | ⚠️ 有 espionage 报告；无快照元数据纪律、无 AI 访问边界 |
| GDD-13 结算 | Inventory/Reserved/InTransit、幂等双层、对账恒等式 | 🔴 无 |

## 8. 可复用资产清单（正面）

1. **确定性战斗引擎**：Go `battle.go`（PCG 种子、排序展开保证可回放）与 TS `battle.ts` 双实现 + 22 个测试——可作为 Classic Combat 参考实现候选，但需按 SOURCE-01 决定 Keep/Replace，并对齐五舰与 F-07 5% 线性增益。
2. **PRNG 治理**：`prng.ts` + oxlint `no-restricted-properties` 源头堵 Math.random——直接满足 SIM"固定种子可重复"纪律。
3. **公式与参数的历史试验记录**：objects.ts/go 常量表 + R9/C3/C4 等调参注释，可作为 SIM 对照组输入（不作为 RC1 来源）。
4. **测试文化**：vitest 基建已通，可扩展为 L1 公式层。
5. **DB 初版 schema 的教训**：planets 轨道唯一约束、events 表方向与基线到期队列一致，可作迁移参考。

## 9. 路线决策冲突（必须先解决）

基线 07.1 要求"固定 OGameX 内核 + 适配层"；而仓库现状是：
- Go 骨架已被 IWO-20260919-003 **FROZEN**，注释写明"Unfreeze only if/when a P2P route is chosen"——当时决策上下文是单机路线；
- 前端是唯一真实游戏，方向是全量经典 OGame 单机 demo。

**V1.2 基线生效意味着原 freeze 决策的前提（单机路线）已被推翻**。需要一次正式路线裁决（建议走基线 09.2 Change Request 流程）：
1. Go 骨架解冻并转向 OGameX 适配，或废弃重建；
2. 前端单机原型的定位：保留为 UI/交互试验场，还是按 MVP 五舰五任务裁剪；
3. GAP-01（OGameX 仓库、完整 SHA）由谁、何时固定——这是 DOR-03 BLOCKED 项，不解锁则 E1 适配层不能定稿。

## 10. 差距总表与建议优先级

| # | 差距 | 基线引用 | 优先级 |
|---|---|---|---|
| 1 | 路线裁决：OGameX 固定源码（GAP-01/DOR-03）与 Go freeze 冲突 | 08.1 / 11.2 | P0 阻塞一切 |
| 2 | 服务器权威架构：GameCommand + 幂等 + Ledger + Outbox + 事件队列（E1 全部） | 07.2 / GDD-13 | P0 |
| 3 | 版本化配置体系（替代 objects.ts/go 硬编码） | 11.3 / GAP-02 | P0 |
| 4 | NPC regen 违反 CR-006，海盗需重做为真实经济实体 | GDD-05 | P0（SIM-04 前置） |
| 5 | 范围裁剪/隔离：回收、远征、导弹、防御、月球、死星、商人、军官等移出 MVP | 04.1/04.2 | P0（防止范围蔓延进内核） |
| 6 | 数值体系差异：产量/能源/仓容/容量/槽位/军事增益公式全面对齐 RC1 | 05.2 | P0（GATE-B 前置） |
| 7 | 保护体系（N0~N3 + ProtectionService） | GDD-09 / GAP-03 | P0 |
| 8 | 总督系统（授权/预算/撤销/审计） | GDD-06 / GAP-08 | P0 |
| 9 | 联盟基础 | GDD-08 | P1 |
| 10 | SIM 框架（模拟器 + 行为策略 + KPI/Gate 报告） | 06 | P0（GATE-B 前置） |
| 11 | TEST-01 六层测试矩阵（现有仅 L1） | 08.3 | P0 |
| 12 | 殖民容量、在途互斥、仓满/超额、退款口径等规则机制 | GDD-01/02/07/13 | P0 |

**一句话总结**：现有代码在"公式原型、确定性战斗、PRNG 纪律"上有可迁移价值，但 V1.2 要求的权威服务器、命令/结算/审计骨架、配置化、SIM 验证、AI 零作弊与 MVP 范围约束在代码库中**基本为零**；且 Go 冻结决议与新基线路线存在正面冲突，需先走 CR 完成路线裁决，再按 E0→E1 最小纵切启动。
