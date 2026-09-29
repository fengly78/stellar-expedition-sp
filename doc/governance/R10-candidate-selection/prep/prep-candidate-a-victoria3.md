# Prep: 候选 (a) 终局教程/日报引导 — Victoria 3 Deep Dive 接入

> AI-PREP stub | 不替 user 做战略决策 | URL 到后立即开火
> 来源依据：decision.md §SHORTLIST #1
> Skill 待调：`game-balance-analysis` + `paranoia-ai-system-evolver`

## 当前阻塞

| 项 | 状态 | 谁解锁 |
|---|---|---|
| Victoria 3 Deep Dive URL | ❌ 未提供 | user |
| 短名单拍板 | ❌ 待 user 拍板（IWO-20260919-001） | user |
| 候选 (a) 设计 | 不可开始（无文章证据） | URL 解锁后 |

## URL 解锁后立即动作（已就绪）

### Step 1: Fetch + 摘要（5 分钟）

```bash
# 协议：单次 fetch，禁止深链 follow
curl.exe -sL "<VICTORIA3_URL>" -o "$env:TEMP\v3.html"
# 提取正文（若是 Gamasutra / GameDeveloper 用 llms 优先）
webfetch url="<VICTORIA3_URL>" format=markdown
```

摘出 5 类证据：

1. **经济建模杠杆**：pop 阶层 × 商品 × 价格弹性 的具体公式或表格
2. **中后期曲线治理**：游戏时长 N 小时后如何避免「所有曲线收束」
3. **玩家信号设计**：玩家何时知道「下一步该干什么」的 UI 提示机制
4. **失败信号分类**：跟 economy-tuning §5（A 电力无感 / B 深挖陷阱 / C 战斗无用 / D 资源溢出）的对位
5. **可迁移 vs 不可迁移**：哪些 OGame 当前架构能直接借鉴（如日报 hook），哪些不能（如 pop 阶层模型）

### Step 2: 用 game-balance-analysis 落证据等级（10 分钟）

调 skill:

```
skill(name="game-balance-analysis")
prompt: |
  把 Victoria 3 Deep Dive 里的 5 类证据分别贴 confirmed / assumed / unknown 标签。
  对 OGame 终局教程/日报设计直接可迁移的杠杆做 impact × feasibility 排序。
  给出 3 个 candidate design（保守 / 标准 / 激进），每个带风险和回滚边界。
```

skill 路径已确认：
- SKILL.md 在 `.opencode/skills/game-balance-analysis/SKILL.md`
- 9 个 references 全读过：`calculation-recipes` / `combat-and-progression-playbook` / `design-balance-model` / `diagnose-and-tune` / `economy-playbook` / `evaluate-balance-proposal` / `evidence-and-validation` / `pvp-and-metagame-playbook` / `random-reward-playbook` / `simulation-and-tooling`

最可能用到的 3 个 references：
- `economy-playbook.md`（中后期曲线治理）
- `evidence-and-validation.md`（证据等级分类）
- `evaluate-balance-proposal.md`（3 candidate design 评分）

### Step 3: 落地 R10 (a) 修值方案（30 分钟）

输出文件：`doc/r10-tuning-candidate-a.md`

骨架：
- §1 现状复盘（numbers-audit §12 + economy-tuning §5 引用）
- §2 Victoria 3 杠杆迁移表（confirmed / assumed / unknown 分栏）
- §3 3 candidate design（保守/标准/激进）+ game-balance-analysis 评分
- §4 推荐方案 + 落地路径（要改哪些 src/ 文件）
- §5 回滚边界 + Human Gate 触发点
- §6 验证链：tsc -b + vite build + 玩家路径 manual walk

## 附录 A: 终局三条成长线代码位置（P1.6 observe 阶段已抓，2026-09-19 21:29）

> R9 调参全部已落地，**终局「三条成长线熄火」是真的用户感知缺陷，不是数值 bug**。

### 已落地的 R9 修复（numbers-audit §1/§2/§3/§5 + economy-tuning §5 已收敛）

| 编号 | 痛点 | 修复位置 | 修法 |
|---|---|---|---|
| C3 | 晶体矿曲线崩塌 | `web/src/game/objects.ts:59` | factor `1.6 → 1.5` 对齐金属矿 |
| C1 | 研究时间维度消失 | `web/src/game/objects.ts:324-332` | `cost^0.3` 软化指数，Lv.10→4.6 分 / Lv.20→6.7 小时 |
| C2 | 高阶防御单调递减 | `web/src/components/Buildings.tsx` (R9 §2) | 火箭 1 / 轻激 1 / 重激 2 / 高斯 3 / 离子 3 / 等离子 4 占建筑空间，约束从资源切到空间 |
| C4 | 掠夺中后期崩 | `web/src/game/npc.ts:131` | NPC 再生 `(800 + difficulty * 1200)` = 400/1000/1600（注释带 `ponytail: 再生翻倍`） |
| C8 | 电力诊断 UI 说谎 | `web/src/game/objects.ts:151` | `solarOutput` 不乘 SPEED（旧 ratio 恒等于 2.00 bug 注释完整），选项 B 落地 |

### 终局三条成长线（numbers-audit §12）— 这是 candidate (a) 的真问题

| 路线 | 当前状态 | R9 后 |
|---|---|---|
| 矿 Lv.40 | 回本 2.25 年 | 仍未触及 |
| 等离子 / 高阶防御 | 负收益 | **已被 C2 反转（OK）** |
| 掠夺 | Lv.20 后 14.9% / Lv.30 后 3.8% | **已被 C4 反转（~8-15%）** |

**问题本质**：玩家终局时三条成长线同时熄火，没有显式「下一站是殖民地」引导。Victoria 3 Deep Dive 的目标 — 用文章证据找玩家「下一步该干什么」的 UI 提示机制。

### economy-tuning §5 失败信号（要 Victoria 3 证据对位）

- A 电力无感 ← C8 已修（选项 B），UI 仍在说谎吗需检查
- B 深挖陷阱 ← numbers-audit §12 终局现象
- C 战斗无用 ← 掠夺被 C4 修后是否仍存在？
- D 资源溢出 ← 仓库满提示已加（GameScreen.tsx:113-115）

→ Victoria 3 证据拿到后，逐项给对位。

## 关键边界（避免重蹈覆辙）

1. **不在没读文章时预判设计细节**——已在 IWO obstacle 标 high severity 失败模式
2. **不替 user 拍板 3 candidate design 的最终选择**——保留给 user 选
3. **不写 src/ 代码**——本 prep 只到 design doc，实现另开 IWO-20260919-002
4. **P2 阻塞 7 天后降级**：URL 7 天未到，候选 (a) 降级为「最小 tutorial stub + TODO」，不等

## 一旦 URL 抵达的最小触发消息

> 「Victoria 3 URL 已收到，立即开 Step 1-3。预计 45 分钟出 r10-tuning-candidate-a.md。」

→ skipped: 当前写 src/ 代码、写数值脚本、读 Victoria 3（URL 阻塞）→ add when: URL 抵达即开 Step 1。
