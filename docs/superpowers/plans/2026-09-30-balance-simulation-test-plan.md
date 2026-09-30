# Stellar Expedition RC2 自动平衡测试矩阵

> 状态：实施规格
> 日期：2026-09-30

## 1. 目的

任何 RC2 数值调整都必须通过自动模拟，而不是只凭主观体验。

## 2. 经济模拟

### SIM-E01 新账号 24h
输出：
- 每 15 分钟资源；
- 可建内容；
- 队列利用率；
- 首侦察时间；
- 首 PvE 时间。

通过条件：
- 15 分钟内完成基础工业；
- 45 分钟内可完成第一次侦察；
- 4 小时内可形成基础战斗单位。

### SIM-E02 Day 1–7
1000 个策略 Bot：
- economy-first
- research-first
- fleet-first
- balanced

检查：
- 是否存在严格最优路线；
- 库存是否持续溢出；
- 哪项资源长期无用；
- 各路线 7 日资产差。

### SIM-E03 Day 30
检查：
- 资源产消比；
- 服务器通胀；
- 星球专精差异；
- 后期 Sink 是否足够。

## 3. 前置图

### SIM-P01 DAG
所有建筑/科技/舰船/防御无循环。

### SIM-P02 Reachability
从新账号初态必须可达所有非赛季内容。

### SIM-P03 Milestone
自动求最短合法路径：
- Scout
- First Combat Fleet
- Colony Ship
- Second Planet
- Orbital Shipyard
- AI Autopilot

若任何核心里程碑超出目标时间窗口，标红。

## 4. 战斗模拟

每组至少 10,000 seeds：

- light vs heavy fighter
- cruiser vs fighter swarm
- destroyer vs cruiser
- battlecruiser vs battleship
- bomber vs defense
- interceptor vs bomber
- EW mixed vs pure DPS
- capital vs swarm
- equal-value attacker vs defense

输出：
- win rate
- median loss V
- p10/p90 loss
- rounds
- debris
- fuel
- net profit

## 5. 姿态测试

同一舰队分别使用 6 种 stance，检查：
- Economy 的节油是否合理；
- Aggressive 是否存在无脑优势；
- Stealth 是否通过代价换取可见度；
- Raid 是否只提升撤离/掠夺效率而非正面最强。

## 6. PvP 经济

模拟不同实力比：
- 1:1
- 2:1
- 3:1
- 5:1
- 10:1

检查：
- 新手保护边界；
- 重复攻击衰减；
- 安全库存；
- 攻击方净收益；
- 防守方恢复时间。

## 7. AI Autopilot

场景：
- 资源充足；
- 能源不足；
- 玩家离线 8h；
- 有来袭舰队；
- 队列空闲；
- 资源接近仓容；
- 高风险 PvP 机会。

必须验证：
- 默认不主动 PvP；
- 单次支出 <= policy；
- 保留 reserve floor；
- 舰队投入 <= policy；
- 所有动作有 reason_code。

## 8. NPC AI

检查：
- AI 不读取未侦察玩家状态；
- Raid 必须 Profit > threshold；
- 连续战败后降低 aggression；
- 资源不足时不能凭空造舰；
- 战损写入同一账本。

## 9. 回归门槛

CI 中分三档：

- Fast：schema + DAG + 100 seed smoke
- Standard：经济 7d + 1000 seed combat
- Release：30d economy + 1000 bots + 10k seeds/matchup

任何 Frozen ruleset 发布必须通过 Release 档。

## 10. 失败阈值

自动阻断：
- prerequisite cycle；
- 不可达核心内容；
- 单舰种多数等价值 matchup >65% win；
- 资源产消比长期 >1.5 且无 Sink；
- 新手 24h 可被 5× 以上玩家正常全额掠夺；
- Autopilot 越权 PvP；
- battle replay 不确定。
