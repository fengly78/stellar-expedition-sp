# prep-lennysnewsletter-design-workflow.md

> 落盘：2026-09-19 23:08
> 上游：https://www.lennysnewsletter.com/p/how-to-turn-your-ai-into-a-world
> 作者：Anshu Chimala（前 Apple UI/UX + AI R&D 12 年，guest post 在 Lenny's Newsletter，2026-09-01）
> 状态：**ready-to-fire**，等 user 拍应用维度（候选 d 中期内容 / APICO 12 页签 audit / 不动）

## 与 prep-alt-source-rejected.md 的关系

**不并入 prep-alt-source-rejected.md**，原因：
- prep-alt-source-rejected.md 的 3 条拒绝理由（标题诱导误读 / 零对位 R10 candidate (a) / paywall 截断 OGame 无操作价值）**部分被 user 二次引用推翻**：
  - user 重复给同一 URL + 显式「参考学习设计」 → user 知道这是什么
  - 对位 R10 candidate (d)「中期内容（角色职业/远征扩充/残骸场）」+ APICO 12 页签 audit 有强 evidence（见下表）
  - paywall T7「Remove AI tells」不可见，但 T1-T6 + 框架 100% 抓到，T6「Cut 冗余」已隐含减法原则
- 但 prep-alt-source-rejected.md 的核心拒绝仍成立：**这文章 ≠ Victoria 3 数值 evidence 源**，R10 candidate (a)「终局教程/日报引导」仍需 Victoria 3 URL

→ 关系：**不修改 prep-alt-source-rejected.md**（对位 candidate (a) 仍 REJECTED），**新增本 prep**（对位 candidate (d) + APICO）。

## 文章核心（已 100% 抓到的部分）

### 三阶段框架
1. **Discover** — seed strings 注入灵感 / 大胆 prompt 推动模型走出舒适区
2. **Define** — subagent critic loop 客观评分 / image generation 丰富设计
3. **Deliver** — 减法原则（cut 冗余 / 减 AI tells）

### 7 Techniques（T1-T6 全抓到，T7 paywall）

| # | 名称 | 核心技术 | OGame 对位 |
|---|---|---|---|
| T1 | **Seed strings** | Sakana AI String Seed of Thought：模型生成 random alphanumeric string 作为颜色/字体/布局灵感种子 | 🔥 **d** 中期内容视觉（新功能 icon/HUD/ship sprite） |
| T2 | **大胆 prompt** | 拿 video game / art installation / 不对称布局当灵感，把抽象需求转具体视觉 brief | 🔥 **d** 中期内容系统设计语言（角色职业视觉） |
| T3 | **Subagent critic loop** | 用 Fable 5（贵模型）当 critic，Opus 5（便宜模型）当 implementer，critic 评分 9/10 才停 | 🔥 **APICO 12 页签 audit**（客观评分维度） |
| T4 | **Image generation 丰富设计** | 模型不爱用 image 默认走 gradient/shape → 让它强制用 image gen + shader | 🟡 中等 — 资源消耗高，OGame 是 React SVG icon |
| T5 | **Video generation 做动效** | fal.ai aggregator / Seedance 2.5 物理动效 / keyframe interpolation 做状态过渡 | 🔥 **d** 中期内容动效（远征/残骸场交互） |
| T6 | **Cut 冗余** | AI 喜欢加不喜欢减 → 手动审查「什么必须存在」 | 🔥 **APICO 12 页签 audit**（减法维度） |
| T7 | **Remove AI tells** ⏭️ paywall | 详见原文付费段 — 推测是「过度对称 / 完美圆角 / 单一字体」等 AI 痕迹识别 | 🟡 推断 |

### 4 大可迁移原则（OGame 通杀）
1. **LLM 设计平庸的根因**：next-token 预测让模型倾向「最像平均」的选择，OGame 12 页签 HUD 也是这个味道 → 必须外部种子/具体 brief 撬动
2. **三阶段要分开**：Discover 不要急着 Define，Define 不要急着 Deliver，OGame 中期内容最容易「边设计边实现」踩坑
3. **减法 > 加法**：T6 是 T1-T5 之后的必经步，OGame 12 页签是否每页都必要需要重审
4. **用贵的模型做 critic，便宜的做 implementer**：Fable 5 评分 + Opus 5 实现 → OGame 可以用 game-design-review skill 当 critic、quick task 当 implementer

## R10 candidate 对位矩阵

| 候选 | evidence 对位 | 强 / 弱 | 备注 |
|---|---|---|---|
| (a) 终局教程/日报引导 | ❌ 零 | — | 这文章不是数值 evidence 源，prep-alt-source-rejected.md 仍 REJECTED |
| (b) Go 后端删/留 | ❌ 零 | — | 战略决策，不是设计维度 |
| (c) PRNG seed 化 | 🟡 弱 | 弱 | T1 seed strings 是设计灵感种子，不是 PRNG seed — 字面相似但本质不同 |
| **(d) 中期内容**（角色职业/远征扩充/残骸场） | 🔥🔥🔥 **强** | 强 | T1+T2+T5 三角直接对位「新功能视觉 + 设计语言 + 动效」 |
| **(e) C8 能源选项 B 存档迁移** | 🟡 弱 | 弱 | T6 减法原则可应用到「老存档哪些字段必须保留」 |
| **APICO 12 页签 audit**（独立 P3） | 🔥🔥 **中强** | 中强 | T3 subagent critic loop 补 game-ui-ux skill 缺的「客观评分」维度；T6 cut 补减法维度 |

## 三个应用场景的具体 prep（等 user 选）

### 场景 1：d 中期内容（最强对位）
- T1 seed strings 应用于：角色职业 icon / 远征飞船 sprite / 残骸场粒子
- T2 大胆 prompt 应用于：角色职业视觉语言（不同时代/阵营/职业不同 brief）
- T5 video generation 应用于：远征航行动效 / 残骸场战斗回放动效
- T6 cut 原则应用于：角色职业每条天赋树是否都必要 / 远征任务是否每关都有意义

**触发命令**（user 拍板后）：
```bash
skill(name="game-design-review")  # 充当 critic
# + 后续 task(category="quick", ...)  # 充当 implementer
```

### 场景 2：APICO 12 页签 audit（独立 P3 增强）
- T3 subagent critic loop：用 gamestudio production-design 当 critic，game-ui-ux skill 当 implementer 模板
- T6 cut 原则：12 页签是否每页都必要？哪些可以合并？
- T1 seed strings：HUD 颜色/字体种子

**触发命令**：
```bash
skill(name="game-ui-ux")  # 12 页签 audit 主 skill
# + skill(name="gamestudio")  # 提供 production-design critic 视角
```

### 场景 3：不动（user 拒绝应用）
- prep 落盘但无后续，等 user 改主意

## 不消耗的 BLOCKED

- ❌ 不修改 decision.md（4 candidate 评估矩阵不变）
- ❌ 不修改 prep-candidate-a-victoria3.md（R10 candidate (a) 仍需 Victoria 3 URL）
- ❌ 不修改 prep-alt-source-rejected.md（对 candidate (a) 的拒绝仍成立）
- ❌ 不消耗 Victoria 3 URL BLOCKED
- ❌ 不消耗 shortlist 拍板 BLOCKED
- ❌ 不消耗 APICO URL BLOCKED（场景 2 的 APICO Deep Dive URL 仍独立需要）

## ponytail: 真限制

- T1/T2/T5 都需要 image/video generation API key（fal.ai / OpenAI / Gemini），OGame 当前 React SVG icon 路线 **零 image gen 依赖**，引入 image gen 是架构变更不是简单套用
- T3 subagent critic loop 需要多模型路由（Fable 5 + Opus 5），opencode 单模型没这能力 → 退化为「同模型不同 prompt 角色」
- T6 cut 是无 API 成本的纯设计原则，**OGame 立即可做**

## 下一步（等 user）

任一即可解锁 prep：
1. 「用场景 1（d 中期内容）」→ 把 prep Step 1 启动
2. 「用场景 2（APICO audit 增强）」→ 把 prep Step 1 启动（仍需 APICO URL）
3. 「不动」→ prep 落盘但无后续
4. 「先 T6 cut 原则用起来」→ 最小应用：12 页签 + 中期内容减法审查（无 API 依赖）
