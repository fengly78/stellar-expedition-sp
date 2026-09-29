# prep-candidate-d-mid-game-content

> candidate (d) prep stub — 由 `lennysnewsletter` 二次引用 + R9 §7遗留触发
> Authority: P2_draft（探索性设计，无承诺）
> Created: 2026-09-19

## Context（来源）

- R9 §7遗留：中期内容（角色职业 / 远征扩充 / 残骸场）仍未做，**是下一轮最大设计空间**
- 11 file audit（m0284）：prep dir 现状 4 ready + 1 rejected + 1 lennysnewsletter
- 本地观察（m0251）：web/src/components/ 里只有 BattleReplay.tsx 跟 battle 关键词相关，officer/expedition/debris **3 个全是 0 文件** = greenfield
- OGame 已知约束（economy-tuning §0 + §5）：Fun Hypothesis = 资源→产能→舰队→兑现；4 大失败信号 = 电力无感 / 深挖陷阱 / 战斗无用 / 资源溢出

## sub-candidate D-1：角色职业（Officer classes）

**现状**：`officers👔` 页签在 GameScreen.tsx 里有但 0 专属组件 = 静态/占位
**为什么做**：突破 Pill 1「时间不可再生」单调感（player 矿 + 战斗都耗尽后需要新维度）
**MVP 设计**（最小可玩）：
- 4 职业：矿工（产能 +15%）/ 工匠（建造速度 +20%）/ 战术家（舰队 +10%）/ 外交官（NPC 关系 +25%）
- 每职业 1 个主动技能 + 2 个被动
- 招募 = 资源 + 时间双 cost（绑定 Pill 1）
**Action 步骤**（user 拍板后启动）：
1. 定义 OfficerClass schema（web/src/game/officer.ts 新文件）
2. 主动技能 API（与 battle/build/mine hooks 集成）
3. GameScreen officers 页签接 schema
4. R10 candidate (d) 落地测试（保留 R9 现有可玩性）
**阻塞**：user 拍板 candidate (d)

## sub-candidate D-2：远征扩充（Expedition expansion）

**现状**：0 远征专属文件（可能藏在 state.ts 里但无 UI）
**为什么做**：economy-tuning §5「战斗无用」失败信号 → 给玩家理由派小舰队做非战斗任务（采矿、外交、寻宝）
**MVP 设计**：
- 3 远征类型：矿脉探测 / 外星遗迹 / 派系贸易 / 海盗清剿（4 类）
- 3 风险等级 × 4 类型 = 12 远征模板
- 风险 ↔ 奖励曲线（参考 procedural-gen skill 的 weighted loot tables）
- 需要 escort 决策（小舰队 → 可能被劫；大舰队 → 资源被吃）
**Action 步骤**：
1. ExpeditionTemplate schema（procedural-gen 辅助生成 12 模板）
2. Mission lifecycle hook（dispatch → travel → outcome → return）
3. Battle integration（escort 触发战斗）
4. UI：fleet 页签加远征子页
**阻塞**：user 拍板 candidate (d)

## sub-candidate D-3：残骸场（Debris field salvage）

**现状**：0 残骸专属文件
**为什么做**：economy-tuning §5「资源溢出」失败信号 → 给后期溢出资源一个 sink（tradeable / salvage）
**MVP 设计**：
- 战斗结束自动生成 debris field（位置在 battle 坐标）
- 时间窗口（24h / 12h / 6h 跟战斗规模成反比）
- Salvage mission = 派回收船 + 时间限制 + 风险（NPC 抢）
- 资源类型 weighting：金属 50% / 晶体 30% / 重氢 15% / 稀有 5%
**Action 步骤**：
1. Battle.ts hook（debris 生成规则）
2. Debris schema（位置 / 资源量 / 时间窗口 / 风险等级）
3. Salvage mission UI（galaxy 页签加 debris 高亮）
4. NPC AI 抢残骸（注入 npc.ts 决策树）
**阻塞**：user 拍板 candidate (d)

## sub-candidate D-4：BattleReplay.tsx（排除）

BattleReplay.tsx 已存在但属于回放不是「新内容」，不属于本 prep scope。如要 polish 走 game-ui-ux audit（prep-apico-12-tabs.md 准备中）。

## User 3 选项

| 选项 | 含义 |
|---|---|
| 进 shortlist | 替换原 candidate (d)「中期内容」入选位，4 candidate 全 ready |
| 独立 track | 独立 IWO（IWO-20260919-004），不混 shortlist |
| 不动 | R10 保持 (a)/(e)/candidate-(c) 三 candidate（(d) 推到 R11） |

## Ponytail 真限制

- 3 sub-candidate 全是 greenfield → 单 R 周期最多做 1 个，不要合并做 3
- 角色职业 vs 远征 vs 残骸场 = 设计空间互斥（资源池 + 注意力有限），user 选 1 个最痛
- OGame 是单机 4X，**多玩家交互的「debris 抢夺」要降级为 NPC AI 抢**，复杂度可控

## 与其他 prep 的关系

- candidate-(c) PRNG seed 化（prep/candidate-(c)-PRNG-seed-mini-iwo.md）：3 选项等 user 选
- lennysnewsletter prep（prep-lennysnewsletter-design-workflow.md）：**场景 1 直接对位本 candidate**（T1+T2+T5 三角对位角色职业的视觉/设计/动效）

## 阻塞

❌ 不修改 decision.md（4 candidate 评估矩阵不变）
❌ 不消耗 shortlist 拍板 BLOCKED
❌ 不消耗 Victoria 3 URL BLOCKED