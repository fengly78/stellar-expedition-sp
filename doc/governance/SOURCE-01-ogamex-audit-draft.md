# SOURCE-01 源码审计草案：OGameX 0.14.0

> 状态：**Draft（E0 证据稿）** · 2026-09-21 · 只读审计，不构成采纳决定
> 审计对象：`upstream-ogamex/`（本仓库内浅克隆），tag `0.14.0`，SHA `768b0172975615c527698ed2c79ef24fbe09f894`（克隆后 `git rev-parse HEAD` 复验一致）
> 用途：①为 E0 上游冻结决策提供实证；②为 RC1 TBD 字段（speed/fuel/build_time/cargo/rapidfire）提供**有出处的**候选来源；③登记 Keep/Extend/Replace/Isolate。
> 纪律：以下上游数值**不自动进入 RC1**；任何采用均须走 CR（§09.2），且不得因"上游如此"绕过 SIM 验证（§05.10）。

## 1. 核心公式提取（逐行出处）

### 1.1 航时（FleetMissionService.php L55~75）

```
duration_seconds = ( 35000 / speed_percent × sqrt(distance × 10 / slowest_speed) + 10 ) / fleet_speed
```

`speed_percent`：出发选定航速百分比（10=100%）；`slowest_speed`：整队最慢有效舰速（含驱动科技加成与 speed_upgrade 跳档）；`fleet_speed`：宇宙倍率设置。

### 1.2 燃料（同文件 L172~210）

```
shipSpeedValue = 35000 / max(0.5, duration×fleet_speed − 10) × sqrt(distance × 10 / ship_speed)
consumption   += max( fuel_base × amount × distance / 35000 × (shipSpeedValue/10 + 1)² , 1 )
停泊 holdingHours>0 时：+ max( floor(Σfuel_base×amount×hours / 10), 1 )
```

氘消耗乘角色职业系数（General −50%）——**MVP 无职业系统，此项 Isolate**。

### 1.3 距离（同文件 L120~150）

| 场景 | 距离 |
|---|---|
| 同坐标 | 5 |
| 同星系不同行星 | Δplanet × 5 + 1000 |
| 跨星系（system） | (Δsystem − 空星系 − 死星系, ≥1) × 95 + 2700 |
| 跨河系（galaxy） | min(Δgalaxy, 总河系数 − Δgalaxy) × 20000 |

### 1.4 建造/科研/造船时间（PlanetService.php L821~888）

```
hours = (Metal + Crystal) / ( 2500 × (1 + Robotics_L) × 2^Nanite_L × universe_speed )
降级（ downgrade ）：分母额外乘 max(4 − next_level/2, 1)
```

**对照 F-08**：基线 F-08 公式族与上游同构（成本/(系数×(1+R)×2^N)），差异在常数（2500 vs RC1 实验分支的 60×V/100=成本/…）与单位（小时 vs 秒）。F-08 单位 Blocked 的解除候选即上游口径——须 CR + SIM-01 校准。

## 2. 五舰属性对照（RC1 Candidate vs 上游实值）

GameObjectProperties 签名：`(结构, 护盾, 攻击, 速度, 货舱, 燃料)`。

| 舰 | 字段 | RC1 Candidate | 上游 0.14.0 | 差异 |
|---|---|---|---|---|
| 轻战 204 | 成本 | 3000M/1000C ✅ 一致 | 同 | — |
| | A/S/H | 50/10/400 | 50/10/**4000** | H 口径 10 倍差（RC1 缩放） |
| | cargo | **TBD** | 50 | 可填 |
| | speed/fuel | **TBD** | 12500 / 20 | 可填 |
| | 前置 | 未建模 | 船厂1+燃烧1 | 前置树来源 |
| | rapidfire | **未登记** | 探针5/太阳能卫星5/爬虫5 | 对象均非 MVP → MVP 等效空表 |
| 重战 205 | 成本 | 6000M/4000C ✅ | 同 | — |
| | A/S/H | 150/25/**1200** | 150/25/**10000** | H 不一致（非纯缩放） |
| | cargo | **TBD** | 100 | 可填 |
| | speed/fuel | **TBD** | 10000 / 75 | 可填 |
| | 前置 | 未建模 | 船厂3+装甲2+脉冲2 | 前置树来源 |
| | rapidfire | 未登记 | +小运3 | 小运是 MVP → **须 CR 决定是否采用** |
| 小运 202 | 成本/cargo | 2000M/2000C、5000 ✅ | 同 | — |
| | A/S/H | 5/10/500 | 5/10/4000 | H 口径差 |
| | speed/fuel | **TBD** | 5000（脉冲5跳档10000）/ 10 | 可填；跳档机制 MVP 待定 |
| 殖民舰 208 | 成本 | 10000M/17500C/5000D | 10000M/**20000C**/**10000D** | **不一致**，RC1 为自定值 |
| | A/S/H | **TBD** | 50/100/30000 | 可填（基线要求缺失不得虚构→此为有出处候选） |
| | cargo | 7500 ✅ | 7500 | — |
| | speed/fuel | **TBD** | 2500 / 100 | 可填 |
| | 前置 | 骨架假设（船厂4） | 船厂4+脉冲3 | 骨架假设与上游一致 ✅ |
| 侦察探针 210 | 成本 | 1000M/1500C | **0M/1000C** | **不一致**（RC1 自定） |
| | A/S/H/cargo | 1/1/100/100 | 0/0/1000/0 | 口径不同 |
| | speed/fuel | **TBD** | 100000000 / 1 | 可填 |

**结论**：RC1 成本与 A/S 大面积吻合上游（轻战/重战/小运成本全等），H 口径不一致（RC1 自有缩放）、殖民舰与探针成本为 RC1 自定。TBD 字段（speed/fuel/cargo/A-S-H of colony）均有上游实值可作 CR 候选，但 H 口径差异须先在 CR 中裁决"结构值缩放映射"。

## 3. Keep / Extend / Replace / Isolate 登记（MVP 范围）

| 模块 | 上游对应 | 处置 | 理由 |
|---|---|---|---|
| 航时/距离/燃料公式 | FleetMissionService | **Keep**（口径参考，Rust/PHP 重写） | §13 已裁决战斗在 Rust；公式语义沿用 |
| 建筑/科研/造船时间 | PlanetService L821+ | **Keep**（F-08 解除候选） | 同构公式族 |
| 五舰属性 | Civil/MilitaryShipObjects | **Extend**（H 口径裁决 + TBD 回填走 CR） | 见 §2 |
| 战斗引擎 | GameMissions/BattleEngine | **Replace**（Rust Classic，语料验收） | CR-20260921-001 + FFI 稿 |
| 任务体系（Attack/Transport/Colonisation/Espionage/Deployment/Recycle…） | GameMissions/* | **Extend**（MVP 只取 4 任务；ACS/远征/导弹/灭月 Isolate） | 04.2 不得扩充范围 |
| 防御设施/月球/太空坞/残骸回收 | DefenseObjects、RecycleMission 等 | **Isolate** | 非 MVP |
| 职业系统（CharacterClass −50% 氘耗等） | CharacterClassService | **Isolate** | MVP 无职业 |
| NPC/海盗（NPCFleetGenerator 等） | NPC*Service | **Replace**（我们的 GDD-05 零作弊 AI，走 SIM-04 口径） | 上游 NPC 为生成器非经济实体 |
| 暗物质/商人/联盟仓库 | DarkMatter*/Merchant/AllianceDepot | **Isolate** | Post-MVP |

## 4. 对 E0 决策的实证结论

1. 克隆复验 SHA 一致，仓库可及、MIT 许可证、Laravel 12 结构清晰（Services/GameMissions/GameObjects 分层与 §07.1 模块化单体设想兼容）。
2. 我们 RC1 的数值血统与该上游高度同源（成本、A/S 吻合），适配成本低；H 缩放与殖民/探针自定价是仅有的系统性偏差，各需一条 CR 裁决。
3. **风险登记**：上游含大量非 MVP 系统（远征、ACS、导弹、灭月、职业、爬虫），Isolate 清单必须在适配层显式关闭入口，防止 04.2 式范围渗透。

## 5. 后续动作（待 E0 拍板后）

1. E0 批准 → 本稿转正式 SOURCE-01 登记（Keep/Extend/Replace/Isolate 进登记表）。
2. 逐条 CR：TBD 回填（speed/fuel/cargo/colony A-S-H）、H 口径缩放裁决、重战 vs 小运 rapidfire 3 是否采用。
3. 适配层关闭 Isolate 入口的工程验收项排入 IMPLEMENTATION-01。

## 6. 侦察与反侦察核验（GDD-12「待固定源码核验」段的答案）

出处：`app/GameMissions/EspionageMission.php`、`app/Services/CounterEspionageService.php`。

### 6.1 反侦察触发概率（CounterEspionageService L13~72）

```
chance% = 守方舰船数 × (守方侦察级 − 攻方侦察级 + 1) / (攻方探针数 × 4) × 100，夹 [0,100]
判定   = random_int(1,100) ≤ chance
```

### 6.2 反侦察战斗（EspionageMission L205~300）

仅守方**舰船**参战（防御设施不参与）；守方舰船真实损失且无修复；探针全灭时攻方收到"舰队失联"消息，但**报告仍然生成**（含 `counter_espionage_chance` 字段——攻方知道自己被发现了多大把握）。

### 6.3 报告字段揭示规则（EspionageMission createEspionageReport / canRevealData）

```
techDiff    = max(0, 守方侦察级 − 攻方侦察级)
额外探针需求 = techDiff²
剩余探针    = max(0, 探针数 − 额外探针需求)
```

| 字段区 | 揭示条件（满足其一） |
|---|---|
| 资源/能量/玩家信息/残骸场 | 恒可见 |
| 舰队 | 剩余探针 ≥ 2 或 攻级−1 ≥ 守级 |
| 防御 | 剩余探针 ≥ 3 或 攻级−2 ≥ 守级 |
| 建筑 | 剩余探针 ≥ 5 或 攻级−3 ≥ 守级 |
| 科研 | 剩余探针 ≥ 7 或 攻级−4 ≥ 守级 |

### 6.4 对 GDD-12 缺口的映射

| GDD-12 待核验项 | 上游机制 | 处置建议 |
|---|---|---|
| 字段揭示 | 6.3 四档阈值 | **Keep**（经 CR 写入 Core/Balance） |
| 探针损失 | 6.2 反侦察战斗，探针可真损 | **Keep** |
| 成功概率 | 6.1 公式 | **Keep**（已知简化：ACS 舰队未计入，上游 TODO） |
| 过期阈值 | 上游无（报告即快照，天然过期） | 我们的快照制更严格，**Replace** 口径成立：observed_at + 新鲜度评价（已入 DB 草案 intel_snapshots） |
| 未知≠零 | 上游报告缺区即不可见（字段缺席） | 与 GDD-12 一致：SIM-04 快照已实现"缺区不入决策" |

### 6.5 我方 MVP 裁剪注意

上游探针属性（成本 0M/1000C、速度 1 亿、货舱 0）与 RC1 SCOUT（1000M/1500C、A1/S1/H100、cargo 100）不一致——探针/侦察兵的数值定位须随 §2 的 H 口径裁决一起 CR。反侦察涉及防御设施不参与、守方舰船永久损失两条语义，须进 Core Rules 战斗章节（当前基线未明示，属 GAP 候选）。

## 7. 殖民抵达校验与战斗结算核验（GDD-01/04 对照）

出处：`app/GameMissions/ColonisationMission.php`、`app/Services/PlayerService.php`、`app/GameMissions/BattleEngine/*`。

### 7.1 殖民（ColonisationMission L32~130）

- 出发校验：位置 1~15、astro 位置门槛（**1/15 需 astro8，2/14 需 astro6**）、编队含殖民舰；
- **抵达再校验**：目标轨道仍为空 + `planetCount+1 ≤ maxPlanets`（与我们 sim02 抵达校验语义一致 ✅）；
- 容量公式：`maxPlanets = 1 + round(astro/2)`（PHP round 半进），与 RC1 F-06 `1+ceil(A/2)` **数学等价** ✅；
- 成功：建行星、消耗一艘殖民舰、携带货物随队（与我们 START-A 一致 ✅）。

### 7.2 掠夺与残骸（BattleEngine.php L36~235、结算段）

- 掠夺比例：基础 50%（Discoverer 职业对死账号 75%——职业 Isolate，MVP 恒 50%，与 RC1 COMBAT.LOOT_RATE=0.5 一致 ✅）；
- **三重限制齐全**：目标当时库存 × 比例 × 存活舰队剩余货舱（剩余货舱扣除既有货物，L207~209/313~321），与 GDD-04 逐条对应 ✅；
- 掠夺从目标行星实际扣减（deductResources），按攻方舰队比例分摊；战利品在返航后才入账 ✅；
- 残骸：仅**永久损失**（防御设施被毁 − 修复）计入；月球生成概率按残骸规模——**月球 Isolate（非 MVP）**。

### 7.3 重大发现：上游已有 Rust FFI 战斗引擎，且解开了 H 口径差异

`RustBattleEngine.php` L45/118：`FFI::cdef("char* fight_battle_rounds(const char* input_json)")` —— 与 §13 裁决及我方 FFI 稿（JSON over C ABI）**同构**，我方批量接口是对它的合理扩展。

`hull_plating = floor(structural_integrity / 10)`：**上游战斗引擎内部就把结构值除以 10**。因此 §2 的 H 口径差异大部分是口径映射而非数值分歧：

| 舰 | 上游 SI | 战斗口径 SI/10 | RC1 H | 判定 |
|---|---|---|---|---|
| 轻战 | 4000 | 400 | 400 | ✅ 一致 |
| 重战 | 10000 | 1000 | **1200** | RC1 自定义强化（+20%），须 CR 确认 |
| 小运 | 4000 | 400 | **500** | RC1 自定义，须 CR |
| 殖民舰 | 30000 | 3000 | TBD | 回填候选 = 3000 |
| 探针 | 1000 | 100 | 100 | ✅ 一致 |

H 口径裁决从"两种体系之争"简化为"两个自定义值（重战 1200/小运 500）是否保留"——CR 评审负担显著降低。

### 7.4 新增登记

- GAP 候选：殖民位置门槛（astro 6/8）未进基线 Core/Balance——若 MVP 需要位置差异，走 CR；否则显式不启用；
- 我方 FFI 稿 §2 签名与上游 `fight_battle_rounds` 对齐，实现时可参考上游 Rust 库（`rust/` 目录，随 0.14.0 分发）的输入 schema 差异点做适配。


