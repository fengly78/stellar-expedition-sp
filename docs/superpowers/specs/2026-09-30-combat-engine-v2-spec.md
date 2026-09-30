# Stellar Expedition Rust 战斗引擎 v2 规格

> 状态：Candidate  
> 日期：2026-09-30  
> 目标：在 RC1 确定性基础上，引入可解释的命中、目标选择、电子战、护航、撤退与旗舰能力。

## 1. 设计边界

Rust 负责：
- 战斗纯计算；
- 固定 seed 随机；
- round 推进；
- 伤害；
- EW；
- 撤退判定；
- 结果与回放事件。

Rust 不负责：
- 扣资源；
- 掠夺入账；
- DB；
- 玩家权限；
- AI 决策。

## 2. 输入 Snapshot

```text
BattleSnapshot
- version
- ruleset_version
- seed
- attacker
- defender
- units[]
- technologies
- stance
- environment
- retreat_policy
```

每个 unit stack 必须包含：
- definition_id
- count
- attack
- shield
- hull
- speed
- signature
- evasion
- sensor
- stealth
- role_tags
- weapon_tags

战斗过程中不再查询外部配置。

## 3. Round 数

候选最大 6 rounds。

每轮：
1. EW Phase
2. Targeting Phase
3. Fire Phase
4. Shield/Hull Resolution
5. Special Ability Phase
6. Retreat Phase
7. Victory Check

## 4. 派生属性

科技和姿态在战斗开始时冻结：

```text
attack_final =
  base_attack
  × (1 + 0.05 × weapon_level)
  × stance_attack
  × command_attack
  × ew_attack_factor

shield_final =
  base_shield
  × (1 + 0.05 × shield_level)
  × stance_survivability

hull_final =
  base_hull
  × (1 + 0.05 × armor_level)
  × stance_survivability
```

Command/Wing Buff 采用上限与递减，避免无限叠加。

## 5. 命中

候选公式：

```text
effective_tracking =
  weapon_accuracy
  × sensor_factor
  × ew_factor

target_difficulty =
  1
  + 0.6 × evasion_norm
  + 0.4 × signature_inverse_norm

P_hit =
  clamp(
    0.15,
    0.95,
    effective_tracking / target_difficulty
  )
```

简化实现可将单位定义中的 weapon_accuracy 默认为 1。

Signature 越大越容易被命中；Evasion 越高越难命中。

禁止出现 0% 或 100% 长期确定命中。

## 6. 目标选择

每个攻击 Stack 计算候选目标分：

```text
score =
  role_multiplier
  × threat_weight
  × vulnerability_weight
  × range_weight
  × random_jitter
```

其中：
- role_multiplier 来自 role/tag 克制；
- threat_weight 与目标 DPS/Support 价值相关；
- vulnerability_weight 与剩余 hull/shield 相关；
- random_jitter 建议 0.95–1.05，来自固定 seed。

目标选择必须可在回放中复现。

## 7. 伤害

基础：

```text
raw_damage = attack_final × hit_count
shield_absorb = min(raw_damage, shield_pool)
remaining = raw_damage - shield_absorb
hull_damage = remaining
```

候选 Armor Mitigation：

```text
mitigation = clamp(0, 0.35, armor_rating / (armor_rating + 1000))
hull_damage *= (1 - mitigation)
```

MVP 可先不单独加入 armor_rating，而使用 hull tech；v2.1 再扩展。

## 8. Stack 损失

对 Stack 聚合结算：

```text
destroyed = floor(total_hull_damage / hull_per_unit)
carry_damage = total_hull_damage % hull_per_unit
```

必须保存 carry_damage，避免每轮取整导致小单位异常耐久。

## 9. 电子战

EW Ship 产生 Suppression。

单舰效果不能线性无限叠加：

```text
EW_strength = base × sqrt(count)
```

作用：
- 敌 sensor 下降；
- accuracy 下降；
- signature 识别下降；
- 部分 command buff 降低。

上限候选：
- accuracy 最多下降 25%
- sensor 最多下降 35%

同类 EW 超过阈值后收益递减。

## 10. 护航与 Point Defense

拥有 point_defense / escort 标签的舰船：

- 提高 bomber/cargo/support 被选为目标前的保护权重；
- 对 fighter/swarm 获得有限倍率；
- 不提供绝对免疫。

候选：
```text
protected_target_score *= 0.75
```

直到 escort 存活比例低于 30%。

## 11. 轰炸与防御

Bomber 对 defense 标签：
- 伤害倍率候选 ×1.40
- 目标优先级提高

但若敌方 interceptor / point_defense 占比高：
- bomber target_score 被提高
- bomber 生存下降

形成真实护航需求。

## 12. Capital 与小舰

Capital 不对小舰免疫。

规则：
- 大舰 signature 高；
- 小舰命中容易；
- 但单发伤害较低；
- capital 可依赖 point-defense/escort 处理 swarm。

禁止设置“小型舰对 capital 伤害固定为 0”。

## 13. 航母

Carrier 自身火力不是核心。

Carrier 提供 Fighter Wing：
- 战斗开始时生成虚拟 wing stack；
- wing 数量由 carrier_count × wing_capacity；
- wing 不进入资源数据库；
- carrier 被毁后对应 wing 在后续 round 失去补充。

MVP 候选：
- 每艘 Carrier 6 个 wing points；
- wing 偏 anti-small；
- 战后不形成独立残骸。

## 14. 指挥舰

Command Ship 提供 Fleet Aura：

- accuracy +6%
- retreat coordination +10%
- EW resistance +10%

多艘叠加：
```text
bonus = base × (1 + 0.5 + 0.25 + ...)
```

总上限 15%。

## 15. 撤退

玩家预设 retreat_policy：

- loss_ratio >= X
- cargo_loss_ratio >= X
- capital_loss_ratio >= X
- round >= N

撤退成功率：

```text
P_escape =
 clamp(
   0.20,
   0.95,
   0.55
   + speed_advantage
   + stance_retreat_bonus
   + command_bonus
   - enemy_intercept_bonus
 )
```

失败撤退：
- 继续下一 round
- 或损失落后单位

## 16. 战斗结束

结束条件：
- 一方无有效战斗单位；
- 一方成功撤退；
- 6 rounds 达到上限。

达到轮次上限且双方仍存活：
- 视为 disengage；
- 攻方不自动获得完整掠夺。

## 17. 回放事件

Rust 输出：

- ROUND_STARTED
- EW_APPLIED
- TARGET_SELECTED
- SHOTS_FIRED
- SHOTS_HIT
- SHIELD_DAMAGE
- HULL_DAMAGE
- UNITS_DESTROYED
- ABILITY_TRIGGERED
- RETREAT_ATTEMPTED
- RETREAT_SUCCEEDED
- BATTLE_ENDED

UI 回放只消费这些事件，不重新算战斗。

## 18. 确定性

必须：
- 固定 PRNG 算法；
- seed 显式；
- 不使用系统时间；
- 不使用线程非确定顺序；
- 相同 snapshot + seed + engine_version 输出 byte-stable 结果。

## 19. 性能

目标：
- 典型 10–30 种 stack 战斗 <50ms
- 100 stack 大战 <250ms
- 10,000 seed simulation 可批量运行

必要时按 stack 聚合，不逐舰模拟。

## 20. 验收

- 所有输出可回放。
- EW/Command 有明确上限。
- 没有单一舰种因公式漏洞长期统治。
- 撤退结果可解释。
- Rust 不接触数据库。
