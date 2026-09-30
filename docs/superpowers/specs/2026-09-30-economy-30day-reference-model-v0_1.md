# Stellar Expedition 30 天经济成长参考模型 v0.1

> 状态：Candidate Calibration Target  
> 日期：2026-09-30  
> 说明：本文件定义“目标区间”，用于校准模拟器，不宣称这些数值已经由完整服务端真实运行得出。

## 1. 为什么使用目标区间

当前 RC1/RC2 正处于规则迁移期：
- 部分时间公式仍是旧实现；
- 新建筑/科技尚未全部进入运行时；
- 专精、市场和 AI 尚未实现。

因此本阶段先规定：
- 玩家在某个时间点“应该达到什么状态”；
- 资产价值应落在哪个区间；
- 哪些系统应该已经解锁；

随后用自动模拟反推和调参。

## 2. 参考玩家

定义 4 类 Bot：

### Balanced
经济 40% / 科研 25% / 舰队 25% / 储备 10%

### Economy
经济 60% / 科研 20% / 舰队 10% / 储备 10%

### Research
经济 35% / 科研 45% / 舰队 10% / 储备 10%

### Fleet
经济 35% / 科研 20% / 舰队 35% / 储备 10%

所有 Bot：
- 不使用付费加速；
- 不接收外部输送；
- 允许正常 PvE；
- PvP 不计入基准成长；
- 在线行为按每日 3–5 次决策批次模拟。

## 3. 核心估值

继续使用：

```text
V = M + 2C + 3D
```

资产价值包括：
- 已建建筑投入；
- 已完成科技投入；
- 舰船/防御当前成本；
- 可用库存；

不包括未来产量。

## 4. 时间里程碑

### T+0
目标：
- 1 主星
- 基础资源
- 无舰队

### T+15m
应达到：
- Metal Mine L2–3
- Crystal Mine L1–2
- Solar L2–3
- Robotics L1

系统认知目标：
- 玩家理解资源和能源。

### T+45m
应达到：
- Lab L1
- Shipyard L1
- Sensor/Scout 前置接近完成
- 第一艘 Scout 可制造或已完成

### T+4h
应达到：
- Shipyard L2–3
- 第一批运输/轻战
- 第一次 PvE
- 基础研究 3–5 项

### Day 1
目标状态：
- 主资源建筑约 L5–8
- Robotics L3+
- Lab L3+
- Shipyard L3+
- 可稳定侦察/运输/PvE
- 总资产 V 目标带：50k–150k

### Day 3
- 主资源建筑 L8–12
- 第二层推进科技
- Colony Ship 可达
- 第二星球开始或完成
- 总资产 V：250k–800k

### Day 7
- 2–3 星球
- 明确星球专精方向
- Orbital Shipyard 路线开始
- 中型舰队
- 总资产 V：1.5M–5M

### Day 14
- 3–4 星球
- 至少一个专业工业/科研星
- Orbital Shipyard
- 中型 PvP/PvE 编队
- AI Autopilot 可解锁
- 总资产 V：6M–20M

### Day 30
- 4–6 星球
- 多星球产业链
- 高级舰船路线开始
- 联盟/市场成为有效系统
- 至少 1 个战略设施进入建设条件
- 总资产 V：25M–80M

这不是排名目标，而是健康成长区间。

## 5. 资源结构目标

### Day 1
库存占总 V：
- Metal 30–45%
- Crystal 25–35%
- Deuterium 10–20%
- 其余在建筑/科技/舰船

### Day 7
应出现明显分工：
- Economy Bot 库存/建筑比高
- Fleet Bot 舰船资产明显高
- Research Bot 科技资产明显高

但任何路线总 V 不应长期超过 Balanced 的 1.8×。

### Day 30
最优策略差距目标：
- P90 / Median 总资产 < 3×
- 单一路线 vs Balanced < 2×
- 无外部输送情况下，纯 PvP 不应成为稳定最高增长路线

## 6. 产消比

服务器全体目标：

### Early
```text
source / sink ≈ 1.05–1.25
```

允许适度积累。

### Mid
```text
source / sink ≈ 0.95–1.15
```

### Late
```text
source / sink ≈ 0.90–1.10
```

若长期 >1.3：
- 通胀风险

若长期 <0.8：
- 玩家停滞

## 7. 队列利用率

健康区间：
- Build queue：55–85%
- Research queue：45–80%
- Shipyard queue：30–75%

目标不是 100% 队列占用，否则会形成强迫上线压力。

## 8. 殖民节奏

目标：

- 第一殖民：Day 2–4
- 第三星球：Day 5–9
- 第四星球：Day 10–18
- 第五星球：Day 18–30

Astrophysics 仍是重要门槛，但不能成为单一“卡死点”。

## 9. 舰队价值比例

Balanced Bot：
- Day 1：总资产 5–15%
- Day 3：10–20%
- Day 7：15–30%
- Day 14：20–35%
- Day 30：20–40%

Fleet Bot 可高 10–20 个百分点。

若长期 >60%：
- 一次战败退游风险过高。

## 10. PvE 收益

PvE 的目标是：
- 提供主动玩法；
- 比纯挂机略高收益；
- 但不压倒经济建设。

候选：
```text
safe_pve_hourly_value ≈ passive_hourly_value × 1.15–1.35
```

高风险 PvE：
```text
≈ passive × 1.4–1.8
```

需要对应战损风险。

## 11. PvP 收益

长期期望：
- 成功 Raid 的毛收益可以很高；
- 但扣除侦察、燃料、战损、失败概率后，
- 玩家总体 PvP 净收益不应稳定超过高风险 PvE 太多。

目标：
```text
median_pvp_profit_per_active_hour
<= high_risk_pve × 1.25
```

防止“只打人就是唯一最优”。

## 12. AI Autopilot 对成长影响

AI 不应该成为必须开启的数值外挂。

目标：
```text
Autopilot 7d total V advantage
<= 8–12%
```

主要价值：
- 减少空队列；
- 防止仓满；
- 防御响应；
- 提高生活节奏友好度。

## 13. 新手保护与经济

保护仓不应显著增加总资源，只减少被掠夺。

P1 玩家到 Day1：
- 不应因 PvP 导致主线停滞。

P2 玩家被攻击后：
- 24h 内应能恢复到攻击前核心生产能力。

## 14. 模拟器输出

每个 checkpoint 输出：

- planet_count
- building_levels
- research_levels
- ship_counts
- defense_counts
- stockpile
- production_per_hour
- energy_margin
- total_asset_value
- queue_utilization
- pve_profit
- pvp_profit
- losses
- protection_state

## 15. 调参顺序

出现偏差时按顺序调整：

1. 前置条件
2. 时间
3. 生产
4. 成本
5. PvE 奖励
6. PvP 掠夺
7. 高级 Sink

不要先通过“直接送资源”掩盖结构问题。

## 16. Frozen 门槛

30 天模型要进入 Frozen，至少需要：

- 1000 bots × 4 策略；
- 10 个随机起始地形；
- 无前置死锁；
- Day1/3/7/14/30 均落在目标窗口；
- P90/Median 不超过规定差距；
- Autopilot 优势不超标；
- source/sink 无持续失衡。
