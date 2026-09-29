# API-01 命令契约（Core 02 × §07.2 落地版）

> 状态：Draft v0.1 · 2026-09-21 · 不依赖工具链，PHP/Laravel 实现时照此契约落地
> 权威：本契约是 Core Rules 1.0 §02 与工程基线 §07.2/07.3 的接口化表达，**不引入新游戏规则**；
> 与基线冲突时以基线为准并走 CR 修订本契约。
> 对应实现：§13 裁决的 Web/PWA + PHP/Laravel + MariaDB + Rust 战斗模块。

## 1. 统一命令信封

所有玩家、海盗 AI、总督的资产变更**只能**经同一命令入口进入（§07.2）。旧控制器经 Adapter 接入，不得保留成本不同的直写路径。

```json
{
  "command_id": "uuid-v4（客户端/调用方生成，幂等键）",
  "actor": {"kind": "player|pirate_ai|governor", "actor_id": "…"},
  "owner_id": "资产所有者（Actor 与 Owner 分离，§07.1）",
  "type": "见 §3 命令清单",
  "payload": {"…": "命令参数"},
  "ruleset_version": "提交时解析的 Balance 版本（锁定用，见 §6）",
  "authorization_ref": "总督命令必填：授权 ID + 版本（GDD-06）",
  "submitted_at": "服务器接收时间（事件时序以此为准，§07.2/GDD-13）"
}
```

铁律：
- **同 `command_id` 同 payload** → 返回首次记录的结果（提交去重）。
- **同 `command_id` 不同 payload** → 拒绝（GDD-13：不能当作新指令）。
- Actor≠Owner 时必须有有效授权；联盟身份不改变资产边界（GDD-08）。

## 2. 命令状态机（与业务任务状态分离，GDD-13）

```
RECEIVED → VALIDATED → COMMITTED        （资产与任务承诺已持久化）
                     → REJECTED         （业务拒绝：规则/资源/保护/授权不足）
                     → FAILED           （技术失败：可重试，记录次数与分类）
```

- `COMMITTED` **不表示**建筑建成或舰队到达，只表示承诺已持久化。
- 业务任务有独立状态机（QUEUED/EXECUTING/COMPLETING/DONE/CANCELLED），取消不删除审计历史。
- 业务效果幂等键：`task_id + 阶段`（抵达阶段、造船批次、battle_id），与 command_id 去重互补。

## 3. MVP 命令清单（契约条目）

支付/校验时点遵循 Core 02.2：**排队不等于已支付，启动时必须再校验**。

| 命令 | 锁定范围（§4 顺序） | 支付时点 | 关键校验 | 产物 |
|---|---|---|---|---|
| `BUILD_ENQUEUE` | 行星 | 不支付（入待执行队列，上限 3） | 行星归属、前置、队列空位 | 队列项 |
| `BUILD_START`（系统触发） | 行星 | 启动时扣费 | 再校验库存与前置；失败留队不扣费 | 建筑任务（每行星至多 1 执行中） |
| `RESEARCH_START` | **文明** | 启动时扣当地库存 | 文明同时至多 1 基础研究、实验室前置 | 研究任务 |
| `SHIP_ORDER` | 行星 | **整批**扣费 | 船厂前置、当地资源 | 造船批次（批次号=幂等键） |
| `FLEET_DISPATCH`（transport/colonize/raid/scout） | 行星+任务槽 | 出发事务：移船+移货+**燃料**+占槽+任务创建，任一步失败整体回滚 | 舰船在港（在途不可再派）、货舱物理量（不用 V 折算）、槽位 F-06、ProtectionService 出发校验 | 舰队任务（锁定规则版本/成本/航时快照） |
| `FLEET_RECALL` | 舰队 | 召回燃料口径按已锁定任务契约 | 任务在途 | 返航任务 |
| `COLONIZE_RESOLVE`（抵达事件） | 文明容量+目标轨道 | 消耗殖民舰 | **抵达时**再校验空轨道与 F-06 容量；成功建星+转入携带货物 | 新行星 |
| `COMBAT_RESOLVE`（抵达事件） | 参战资产+目标库存 | 结算损毁 | 战斗时刻快照化防守资产；掠夺三重限制（合法库存×比例×存活剩余货舱）；残骸按损毁 M/C 成本生成一次，氘不成残骸 | battle_id 结算单 |
| `GOVERNOR_GRANT` / `GOVERNOR_REVOKE` | 文明 | — | 授权字段完整（行星/动作/单笔+周期预算/最低储备/禁止资源/有效期/版本） | 授权版本记录 |
| `GOVERNOR_COMMAND` | 按子命令 | 执行时读**当前**授权 | 撤销后未承诺动作禁止执行；在途舰队不删除；已支付任务不无偿撤销 | 总督日志（意图/授权版本/费用/失败原因） |

非 MVP（拒绝开放，04.2）：月球、防御设施、太空坞、残骸回收任务、在途拦截、独立护航、玩家市场。

## 4. 锁定顺序（稳定顺序防死锁，GDD-13）

```
文明（研究/容量） → 行星（库存/队列） → 舰队（在途资产） → 目标库存（战斗/掠夺）
```

锁冲突可重试但**不改变事件先后**；到期队列按服务器事件时间推进，延迟 Worker 不改写本应更早的结果。

## 5. 事务与 Outbox（§07.2）

同一事务写入：资产变更 + 业务任务 + 命令结果 + Ledger + Outbox。提交后才分发消息；异步失败可重试（消息可重复，资产效果不重复）。战斗等跨计算场景：提交前以版本验证确认快照仍有效，**禁止**用陈旧计算覆盖新舰队状态。

## 6. 版本锁定（GDD-10）

任务开始时锁定 `ruleset_version` 及关键成本/时长/费用/舰队组成快照；规则更新不回溯已支付成本；抵达合法性按即时检查策略（与任务参数快照分开）。配置缺失/TBD 拒绝启用，不以零或默认值静默代替。

## 7. 离线恢复与崩溃（GDD-13）

- 恢复顺序：先重放到期事件并分段生产，再结算当前动作。
- 崩溃于提交前 → 整体回滚；提交后响应丢失 → 返回已记录结果。
- 重试不重复计费；并发命令原子占用周期预算（总督）。

## 8. Ledger 与审计（§07.3）

`resource_transactions` 条目：资源类型、正负数量、操作、来源、目标、命令引用。Ledger 解释来源去向，**不是**另一份可花费钱包；权威余额在行星/舰队实际状态。对账恒等式：期末 = 期初 + 显式来源 − 消耗损毁 + 净转入；宇宙内运输/掠夺转移相互抵消；舰船已有/在途/在建/损毁互斥口径。
优先表：`game_commands`、`game_rulesets`、`game_outbox`、`resource_transactions`、`battle_snapshots`（名称为建议结构）。

## 9. 与 SIM 骨架的已验证对应

| 契约条目 | SIM 验证出处 |
|---|---|
| 排队不扣费、启动再校验、支付失败轮换防死锁 | sim01/sim02（队列纪律使 K-E10 收敛至 −0.21%） |
| 文明单研究队列 | sim02（Civ.research_active） |
| 整批扣费造船 | sim02/sim04 |
| 出发移船移货占槽、抵达再校验殖民容量 | sim02（depart/arrive + in_transit 守恒项） |
| 掠夺三重限制、氘不成残骸、战利品在途不计可花费 | sim03（G6 冒烟组） |
| 资产对账恒等式 | sim01/02 守恒校验全 OK |
| 总督授权与撤销语义 | GDD-06 + SIM-01 总督行为（授权接续=完成时自动续排） |

## 10. 待确认契约项（显式 TBD，不静默默认）

1. 总督退款是否恢复周期预算、预算周期边界（GDD-06 明示待确认）。
2. 抵达保护与途中获得保护的即时检查细则（GDD-09）。
3. 航时/燃料/速度函数（GAP-02，等 SOURCE-01）。
4. 反侦察字段揭示与探针损失概率（GDD-12 待固定源码核验）。
5. 总督命令的并发预算原子占用在 MariaDB 侧的锁实现选型（行锁 vs 乐观版本）。

## 11. DDL 可追溯性核对（2026-09-21，对 `doc/db-schema-draft.sql`）

逐命令核对存储落点（DDL 已经 `tools/validate_ddl.py` 结构验证 PASS，14 表/10 外键）：

| 命令 | DDL 落点 | 核对 |
|---|---|---|
| 统一信封/状态机 | `game_commands`（command_id 唯一、payload_hash、actor/owner/authorization、status 五态、attempt_count、result_json、submitted/committed_at） | ✅ 字段逐一对上 §1/§2 |
| BUILD_ENQUEUE / START | `planets.queue_building`（待执行）+ `build_tasks`（执行中，成本快照+ruleset 锁定） | ✅ |
| RESEARCH_START | `research_tasks` + `civilizations.research_active`（文明单研究锁） | ✅ |
| SHIP_ORDER | `ship_orders`（batch_no 唯一=幂等键、整批成本快照） | ✅ |
| FLEET_DISPATCH / RECALL | `fleet_tasks`（task_id 唯一、(task_id,settle_phase) 阶段幂等、ships/cargo/ruleset 快照、arrive_at 到期索引） | ✅ |
| COLONIZE_RESOLVE | `planets`（uq_coords 空轨道冲突即拒绝）+ `civilizations.techs_json`（F-06 容量推导源） | ✅ |
| COMBAT_RESOLVE | `battle_snapshots`（battle_id 唯一、seed、rounds/result 两段、snapshot_version 乐观锁） | ✅ |
| GOVERNOR_GRANT/REVOKE | `governor_authorizations`（(owner,version) 唯一、revoked_at） | ✅ |
| GOVERNOR_COMMAND | `game_commands.actor_kind='governor'` + authorization_id/version 快照列 | ✅ |
| 情报快照（侦察产物） | `intel_snapshots`（observed_at 新鲜度基准、可见字段 JSON） | ✅ |
| Ledger / Outbox / 规则版本 | `resource_transactions` / `game_outbox` / `game_rulesets`（content_hash 唯一、状态枚举含 frozen/deprecated） | ✅ |

观察项（非阻塞，显式登记）：
1. **总督周期预算的已消耗计数**无独立字段——现由 `game_commands`（总督命令行）+ `scope_json` 预算定义推导，正式记账字段与 §10 第 5 项 TBD 绑定（锁实现选型时一并定）。
2. `resource_transactions.fleet_id` / `intel_snapshots.source_command` 未建外键（参照任务/命令的业务键而非主键），属有意松绑，实现期如改 FK 需走 CR。
3. `game_outbox.command_id`、`battle_snapshots.command_id` 等外键参照 `game_commands.command_id`（唯一键而非主键），InnoDB 合法，已在意图内。

结论：11 命令 × 14 表可追溯性闭合，无缺失表；契约与 DDL 可一并冻结评审。

## 12. 状态读面与系统命令（Draft 扩展，2026-09-23 登记；实现已含 15 表 debris_fields）

只读投影与系统命令，不属于 §3 客户端命令清单，不触发新的资产变更语义：

| 项 | 说明 |
|---|---|
| `GET /api/v1/state?owner_id=N` | 状态读面：`owner_id/generated_at/civilization(techs,mission_slots_used)/planets[](coords,inventory,reserved,levels,ships,queue_building,version)` **原始字段直出**——展示口径由客户端计算，服务端零 Balance 常数；owner 不存在 → 404，参数非法 → 422；owner 鉴权属生产化前置（MVP 开发态直读） |
| `game:bootstrap-player` | 开发引导命令（文明+母星+初始库存台账）。**落为系统命令行**：game_commands.type=`BOOTSTRAP`（UUID）、status=committed、锁定当前 frozen 规则集（无 frozen → 拒绝，闸门纪律）；台账 FK 归因 + operation=`init`（§3 operation 枚举注释预留值）。不经总线、客户端不可提交；起始资源默认值=sim01 实验口径的开发工具默认（非 RC1 键），生产玩家创建流程数值来源属未来 CR |
| Worker 调度 | `routes/console.php`：`game:process-builds/process-due/process-fleets` 每分钟、`game:ai-tick` 五分钟——全部幂等（settle_phase/battle_id/状态机双层），重复触发安全 |

## 13. §10 待确认项进度（2026-09-23）

- 第 4 项（反侦察）机制已落地：上游 OGameX 同构公式 + 确定性判定 + 揭示阈值，参数候选在 CR-20260923-004 B（批准前对真实 RC1 fail-closed）。
- 第 3 项（航时/燃料/速度）：公式已按上游实现并经端到端测试纠错（sv=每舰速度值）；数值仍待 CR-003 B。
- 第 5 项（总督预算锁选型）：维持「单笔限额硬校验 + 周期累计推导」，等选型裁决。
