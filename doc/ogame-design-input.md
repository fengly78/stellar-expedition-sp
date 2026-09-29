# OGame-like 游戏设计输入文档

> 生成: 2026-09-18 | 用途: @game-designer 出 MVP 数值表、@go-backend 搭服务端的统一输入
> 配套文件: `doc/ogame-reference.md`（完整数值手册 baseline）

---

## 1. 参考仓库结论（已分析完毕）

| 仓库 | 许可证 | 定位 | 关键资产 |
|---|---|---|---|
| **setube/ogame-vue-ts** | CC BY-NC 4.0（不可商用/不可抄码） | 数值参考 | `doc/ogame-reference.md`（已存本仓库）；战斗三件套思路（sim + worker + 回放播放器） |
| **ogamespec/ogame-opensource** | **CC0（公有领域）** | 原版 0.84 复刻，数值权威 | `game/battle/battle.cpp`（C++ 战斗引擎 + test/ 黄金用例）、`game/core/queue.php`（59KB tick 引擎）、`game/core/fleet.php`（64KB 任务状态机）、`game/core/install_tabs.php`（唯一 schema 来源）、俄语 wiki ~35 篇设计文档 |
| **lanedirt/OGameX** | **MIT（可商用/可抄码）** | 现代多人实现 | Rust 战斗引擎源码（FFI，已拿到 lib.rs 全文）、11 种舰队任务、97 个迁移、BattleRound 回合快照格式 |

**许可证策略**：数值机制不受版权保护，但为安全起见 baseline 数值做平衡调整；代码层只参考 OGameX（MIT）与 ogame-opensource（CC0）。

## 2. 战斗算法规格（从 OGameX Rust 引擎 lib.rs 逐行提炼，MIT 许可可直接移植 Go）

### 2.1 输入（JSON）

```jsonc
{
  "attacker_fleets": [{            // 支持多攻方（ACS）
    "fleet_mission_id": 1,
    "owner_id": 100,
    "units": {
      "204": {                      // unit_id
        "amount": 100,
        "attack_power": 50.0,       // 含科技加成后的最终值
        "shield_points": 10.0,
        "hull_plating": 400.0,
        "rapidfire": { "202": 3 }   // 对 unit_id 202 的 rapidfire 倍数
      }
    }
  }],
  "defender_fleets": [/* 同结构，防御设施也当作 units */]
}
```

### 2.2 核心规则（每回合）

1. **最多 6 回合**，一方清空即提前结束
2. 每回合先攻方全体攻击一遍，然后守方全体攻击一遍
3. 每个攻击单位：**随机选目标**（从对方存活单位中均匀抽取）
4. **伤害下限**：伤害 < 目标满护盾的 1% → 本次攻击无效（bounce）
5. **伤害结算**：先扣护盾，溢出部分扣船体
6. **过毁爆炸**：目标当前船体 / 满船体 < 70% 时，掷骰，爆炸概率 = `1 - 当前船体比例`；爆炸 = 船体护盾清零（本回合末移除）
7. **Rapidfire（快速射击）**：击中目标后掷骰，再次攻击概率 = `1 - 1/rapidfire值`（值=4 → 75%，值=10 → 90%）；可连锁
8. **回合结束**：船体 ≤ 0 的单位移除；**存活单位护盾全额回充**

### 2.3 输出（每回合快照 = 回放数据源）

```
BattleRound {
  attacker_ships / defender_ships        // 回合末剩余 {unit_id: count}
  attacker_losses / defender_losses      // 累计损失（含之前回合）
  attacker_losses_in_round / defender_losses_in_round  // 本回合损失
  absorbed_damage_attacker / defender    // 本回合护盾吸收总量
  full_strength_attacker / defender      // 回合初全额战力
  hits_attacker / hits_defender          // 命中次数
  per-fleet 结果: {fleet_mission_id, owner_id, units_start, units_result, units_lost}
}
```

### 2.4 与我们的回放方案对接

- OGameX 的 `BattleRound` **就是现成的 Snapshot 格式**，直接映射到我们的 `Snapshot`（每回合 = 一个快照点）
- 我们的增量需求：服务端生成时**附上确定性 seed**（OGameX 用 thread_rng 不可复现；我们换成可注入的 RNG，战斗可重放、可审计）
- 性能：几百艘同场、每回合 O(N×连锁次数)，纯 Go 单核毫秒级，**不需要 Rust FFI**（OGameX 用 Rust 是因为 PHP 慢，我们没有这个问题）
- 回放包体积：6 回合 × 每回合几个 HashMap → JSON 几十 KB，远低于 200KB 预算

## 3. 事件队列 / tick 参考

- **ogame-opensource 模式**：cron 入口（cron.php）→ `queue.php`（59KB）统一结算所有建造/研究/造船/舰队/生产事件。事件表驱动，不是每种系统一个 timer
- **我们的 Go 映射**：
  - 单 goroutine ticker（建议 1s tick）+ 事件表 `events(id, type, execute_at, payload)`，到点结算
  - 生产类资源按 elapsed 时间线性结算（读时补算 + 定期落库），不必每 tick 全量写库
  - 舰队任务到点触发：到达→结算（战斗/运输/殖民）→返程事件再入队

## 4. 数据库 schema 参考

- **OGameX（97 迁移）**：核心表 = users / planets / fleet_missions（被 ALTER 12+ 次，最核心）/ building_queue / research_queue / unit_queue / battle_reports / espionage_reports / debris_fields / alliances 系列 / messages
- **ogame-opensource**：`game/core/install_tabs.php`（17KB）是完整建表定义，CC0 可直接参考字段
- 教训：OGameX 的 fleet_missions 反复 ALTER 说明**任务表字段要预留弹性**（mission_type, payload JSONB, 状态机字段分开）

## 5. 功能清单基线（MVP 裁剪依据）

OGameX 全量 11 任务：运输/部署/殖民/间谍/攻击/回收/远征/ACS防御/毁月/导弹/联合舰队
ogame-vue-ts 数值：24 建筑 / 23 科技 / 15 舰船 / 11 防御 / 6 军官

**建议 MVP 范围**（待 @game-designer 确认）：
- 任务 5 种：运输、部署、殖民、间谍、攻击（+回收可选）
- 建筑 ~10：三种矿、太阳能、机器人工厂、研究实验室、船坞、三种仓库
- 舰船 ~8：轻战/重战/巡洋/战列、小运/大运、殖民船、探测器
- 科技 ~10：武器/护盾/装甲、燃烧/脉冲引擎、能源、计算机、间谍、激光、离子
- 战斗：6 回合制，含 rapidfire + 过毁爆炸 + 护盾回充（完整移植 §2）

## 6. 风险与注意

1. ogame-vue-ts 数值来自其魔改版（有矿脉衰减、暗物质、死星等原版没有的系统），**不是原版 0.84 数值**；如需原版数值权威，参考 ogame-opensource 的 `game/core/defs.php`（CC0）
2. 战斗随机性：OGameX 用 thread_rng；我们必须用 seed 注入的确定性 RNG（如 rand.New(rand.NewPCG(seed...))），否则"服务端算好 + 前端重放"不成立
3. 防御设施在战斗中视为一次性单位（被打毁不重建），但 OGameX 有 DefenseRepairService（战后 70% 概率修复）——MVP 可先不做修复
4. 本机无 git，参考代码只能通过 GitHub API/raw 按需抓取；黄金测试用例在 `ogame-opensource: game/battle/test/`（battle_1~3 输入/输出对），可用于验证 Go 战斗引擎正确性

## 7. 下一步

1. `@game-designer` 基于本文件 §5 + `doc/ogame-reference.md` 裁剪 MVP 数值表（建筑/舰船/科技/战斗参数），输出 `doc/mvp-balance.md`
2. `@go-backend` 依 §2/§3/§4 设计：战斗 sim 包（确定性 RNG）+ tick 事件表 + 核心表 DDL
3. 黄金用例验证：用 ogame-opensource 的 battle_1~3 测试数据跑 Go 引擎对拍

