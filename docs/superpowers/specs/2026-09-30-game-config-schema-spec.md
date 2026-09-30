# Stellar Expedition 游戏配置 Schema 规格 v0.2

> 状态：Candidate  
> 日期：2026-09-30

## 1. 目标

所有游戏内容从代码逻辑中解耦，统一采用版本化配置。

建议运行时结构：

```text
GameRuleset
├─ meta
├─ economy
├─ buildings[]
├─ technologies[]
├─ ships[]
├─ defenses[]
├─ stances[]
├─ protection
├─ market
├─ ai
└─ combat
```

## 2. Meta

```ts
type RulesetMeta = {
  id: string;
  version: string;
  status: "Candidate" | "Frozen" | "Deprecated";
  based_on?: string;
  effective_at?: string;
  content_hash: string;
};
```

## 3. ResourceCost

```ts
type ResourceCost = {
  metal: number;
  crystal: number;
  deuterium: number;
};
```

所有资源必须为非负整数。

## 4. Prerequisite

```ts
type Prerequisite =
  | { type: "building"; id: string; level: number }
  | { type: "technology"; id: string; level: number }
  | { type: "specialization"; id: string }
  | { type: "achievement"; id: string };
```

默认 AND 关系；复杂 OR 关系后续显式建组，不允许字符串表达式。

## 5. BuildingDefinition

```ts
type BuildingDefinition = {
  id: string;
  legacy_key?: string;
  category: string;
  base_cost: ResourceCost;
  cost_growth: number;
  base_time_seconds: number;
  time_growth: number;
  max_level: number;
  slot_class: "surface" | "underground" | "orbit";
  slot_cost: number;
  prerequisites: Prerequisite[];
  effects: EffectDefinition[];
  milestone_effects?: Record<string, EffectDefinition[]>;
  tags: string[];
};
```

## 6. TechnologyDefinition

```ts
type TechnologyDefinition = {
  id: string;
  legacy_key?: string;
  category: string;
  base_cost: ResourceCost;
  cost_growth: number;
  base_time_seconds: number;
  time_growth: number;
  max_level: number;
  prerequisites: Prerequisite[];
  effects: EffectDefinition[];
  tags: string[];
};
```

## 7. UnitDefinition

舰船和防御共享一部分结构。

```ts
type CombatStats = {
  attack: number;
  shield: number;
  hull: number;
  signature?: number;
  evasion?: number;
  sensor?: number;
  stealth?: number;
};

type ShipDefinition = {
  id: string;
  legacy_unit_id?: number;
  base_cost: ResourceCost;
  build_time_seconds: number;
  cargo: number;
  speed: number;
  fuel: number;
  combat: CombatStats;
  engine: string;
  prerequisites: Prerequisite[];
  role_tags: string[];
  weapon_tags: string[];
  target_preferences?: TargetPreference[];
};

type DefenseDefinition = {
  id: string;
  legacy_unit_id?: number;
  base_cost: ResourceCost;
  build_time_seconds: number;
  combat: CombatStats;
  max_count?: number;
  prerequisites: Prerequisite[];
  role_tags: string[];
};
```

## 8. EffectDefinition

禁止把业务逻辑写成任意 JS 字符串。

```ts
type EffectDefinition =
  | { type: "production_multiplier"; resource: string; per_level: number }
  | { type: "production_flat"; resource: string; base: number; growth: number }
  | { type: "energy_production"; base: number; growth: number }
  | { type: "energy_consumption"; base: number; growth: number }
  | { type: "speed_multiplier"; domain: string; per_level: number }
  | { type: "combat_stat_multiplier"; stat: string; per_level: number }
  | { type: "fleet_slots"; base: number; per_level: number }
  | { type: "unlock"; entity_id: string }
  | { type: "intel_bonus"; stat: string; per_level: number }
  | { type: "autopilot_capacity"; per_level: number };
```

## 9. StanceDefinition

```ts
type StanceDefinition = {
  id: string;
  speed_multiplier: number;
  fuel_multiplier: number;
  attack_multiplier: number;
  survivability_multiplier: number;
  signature_multiplier: number;
  retreat_multiplier: number;
};
```

## 10. ProtectionRules

```ts
type ProtectionRules = {
  initial_hours: number;
  score_ratio_limit: number;
  repeat_attack_window_hours: number;
  repeat_attack_decay: number[];
  protected_resource_floor_ratio: number;
  aggression_breaks_protection: boolean;
  aggression_window_hours: number;
};
```

## 11. AI Policy Schema

```ts
type AutopilotPolicy = {
  version: number;
  allowed_actions: string[];
  forbidden_actions: string[];
  max_spend_ratio_per_action: number;
  reserve_floor: ResourceCost;
  max_fleet_commit_ratio: number;
  max_risk_score: number;
  allow_pvp: boolean;
};
```

结构化 Policy 是执行依据；自然语言只用于辅助生成/解释。

## 12. 配置装载流程

```text
JSON/YAML
 → schema validation
 → semantic validation
 → hash
 → ruleset registry
 → server boot
 → DB active_ruleset
 → battle/economy snapshot embeds ruleset_version
```

运行中的任务必须保留创建时的 ruleset_version，避免更新平衡后旧任务被新规则重新解释。

## 13. 语义验证

除了 JSON Schema，还必须做：

- prerequisite DAG 检查；
- 所有引用 ID 存在；
- unlock 不自循环；
- max_count/max_level 正数；
- speed/fuel > 0；
- hull > 0；
- stance 倍率合理；
- Frozen key override 审计；
- legacy ID 唯一；
- 新账号可达性；
- 所有舰船至少一个角色标签。

## 14. 数据库保存

推荐：

- rulesets
- ruleset_entities
- active_rulesets
- ruleset_change_records

玩家实体不重复存完整配置，只存：
- definition_id
- level/count
- created_ruleset_version（必要时）
- current authoritative state

战斗 snapshot 必须拷贝当时实际 combat stats。

## 15. 验收

- 配置错误时服务拒绝启动。
- 更换 Candidate ruleset 不需要改前端代码。
- 战报可说明使用哪个 balance_version。
- 历史战斗可按 snapshot 重放。

## 16. RC2 收尾裁决：Authoring Fragment 与 Compiled Ruleset

本节覆盖前文可能造成“每个实体文件必须单独完整”的理解。

RC2 采用两层模型：

### Authoring Fragment

仓库中的 `config/rulesets/*rc2_candidate.json` 是可审阅的源片段。片段允许只负责一个领域，例如：

- entity 文件：ID、成本、基础属性；
- prerequisite 文件：完整前置图；
- planet layout：槽位和专精；
- tactical stats：combat-v2 的 accuracy/signature/evasion/sensor/stealth/engine；
- combat：战斗公式；
- balance：保护、姿态、Autopilot 默认策略；
- legacy mapping：旧数据迁移。

唯一合并顺序与权威关系由：

`config/rulesets/ruleset_manifest_rc2_candidate.json`

定义。

### Compiled Ruleset

服务端运行时不得直接零散读取 fragment。启动时必须先编译成单一 Compiled Ruleset，并完成：

1. 前置图覆盖与一致性检查；
2. tactical stats 解析；
3. layout 合并；
4. legacy mapping 校验；
5. RC1 Frozen 冲突检查；
6. semantic validation；
7. content hash。

Compiled Ruleset 中的 ShipDefinition 必须已经具有 combat-v2 所需的完整 tactical attributes；不能在战斗时临时猜默认值。

任何 fragment 与 manifest 声明的权威源不一致时，服务拒绝启动。

## 17. RC2 收尾裁决：Effect 与 Timing Overlay

Authoring entity fragment 中允许不重复写完整 `effects` 和最终 `build_time_seconds`。

权威源：

- Entity Effects：`config/rulesets/entities/effects_rc2_candidate.json`
- Timing：`config/rulesets/timing_rc2_candidate.json`

Compiled Ruleset 必须把这些 overlay 合并到最终定义。

因此：

- BuildingDefinition 编译后必须有 resolved effects 和 time policy；
- TechnologyDefinition 编译后必须有 resolved effects 和 time policy；
- ShipDefinition 编译后必须有 resolved build time、engine 与 tactical stats；
- DefenseDefinition 编译后必须有 resolved build time 和 tactical defaults。

服务代码不能因为 fragment 缺字段而自行发明默认值。

RC1 已经存在的 5 种 legacy 舰船制造时间继续作为迁移锚点；新舰种使用 Timing 配置中的候选推导公式，直到模拟后 Frozen。

