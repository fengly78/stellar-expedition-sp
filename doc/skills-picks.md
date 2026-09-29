# OGame Skills Picks (game-dev)

> 最后更新：2026-09-19
> 装机路径：`E:\Ogame\.opencode\skills\`（opencode flat layout）
> 重启 opencode 后生效（`<available_skills>` 是 per-session 缓存）

## 已装清单（11 个，cherry-pick 自 5 个上游 repo）

| Skill | 上游 | OGame 对位 | 触发 |
|---|---|---|---|
| `game-architect` | Yuki001/game-dev-skills | R5 MDA 系统架构 + 范式选择 | `skill(name="game-architect")` |
| `game-balance-analysis` | Yuki001/game-dev-skills | **R8/R9** 数值曲线 + simulator | `skill(name="game-balance-analysis")` |
| `game-design-review` | Yuki001/game-dev-skills | R5 评审框架 | `skill(name="game-design-review")` |
| `save-systems` | gamedev-skills/awesome-gamedev-agent-skills | **R10** save migration v2→v10 | `skill(name="save-systems")` |
| `procedural-gen` | 同上 | Go 后端 PCG seed（战斗/地图） | `skill(name="procedural-gen")` |
| `performance-optimization` | 同上 | canvas 回放 + 舰队性能 | `skill(name="performance-optimization")` |
| `game-ui-ux` | 同上 | **12 页签 GameScreen** HUD/layout | `skill(name="game-ui-ux")` |
| `paranoia-ai-system-evolver` | DY-2026/GameDesignOS | **R5/R8/R9/R10** 流程治理（WOOP/VOI/UL/OODA/Human Gate/rollback） | `skill(name="paranoia-ai-system-evolver")` |
| `game-experience-density-optimizer` | 同上 | 新手引导节奏（CLP/SF/EB/AR/MD-min 杠杆 + A/B） | `skill(name="game-experience-density-optimizer")` |
| `game-engine` | clawhub_jhauga | Canvas/WebGL 实现层 | `skill(name="game-engine")` |
| `gamestudio` | guangyuspace | 跨职能工作流 + 经济/UI 审计 | `skill(name="gamestudio")` |

## 跳过清单（why）

| Repo / Skill | 跳过理由 |
|---|---|
| Yuki001 11 个 image/anim/slice 工具 | OGame 纯 2D Web 策略，sprite pipeline 走 React SVG/icon，不需要 AI 出图 |
| awesome 全部 engine skills (Godot/Unity/Unreal/PixiJS/Phaser/three.js/Bevy/pygame/LÖVE/Roblox) | OGame = React/TS + Go，engine 路由不命中 |
| awesome 9 个 genre skills | 4X/strategy 不在 genre 列表里 |
| awesome workflows (prototype-fast / game-jam / steam-publish / itch-publish 等) | 单机 OGame 不上架 Steam/itch |
| GDOS `game-experience-analyzer` | 需要竞品录像/截图，OGame 没有（我们是看自己） |
| GDOS `game-concept-architect` | 太高层（概念立项），OGame 已经在做了 |
| GDOS `game-design-source-curator` | 是给「外部资料归档」的，OGame 直接看代码 |
| GDOS `game-design-proposal-writer` | 商业计划书，OGame 不写商业计划 |
| GDOS `game-design-book-translator` | 中英翻译，OGame 不需要 |
| GDOS `evals/` + `examples/` + `assets/` 子目录 | Python runtime 依赖（`pip install -e .`），单机 OGame 用不上；只保留 `SKILL.md + references/ + templates/ + agents/` |
| neversight-skills/feed-game-developer | 跟 game-engine ~90% 重叠（game loop / collision / state / juice），且 lobehub market 不支持 opencode native |

## 验证步骤

```powershell
# 1. 确认 11 个目录都在
Get-ChildItem -LiteralPath "E:\Ogame\.opencode\skills" -Directory | Select Name

# 2. 确认每个 SKILL.md 的 name 字段 = 目录名（opencode 严格匹配）
Get-ChildItem -LiteralPath "E:\Ogame\.opencode\skills" -Directory | ForEach-Object {
  $head = Get-Content "$($_.FullName)\SKILL.md" -TotalCount 5
  $name = ($head | Where-Object { $_ -match "^name:" }) -replace "^name:\s*",""
  if ($name.Trim() -ne $_.Name) { Write-Warning "$($_.Name): name mismatch = $name" } else { Write-Host "OK $($_.Name)" }
}

# 3. 重启 opencode 让 11 个 skill 进 <available_skills>
#    Ctrl+C 当前 session → opencode 重新进 E:\Ogame
```

## R 痛点 → Skill 路由速查

| OGame 痛点 | 主 skill | 备 |
|---|---|---|
| R5 MDA / 架构 | `game-architect` | `gamestudio` production-design |
| R5 评审 | `game-design-review` | `paranoia-ai-system-evolver`（流程） |
| R8 数值曲线（仓库断崖） | `game-balance-analysis` | Victoria 3 Deep Dive 文章 |
| R9 sources/sinks + 中后期防崩 | `game-balance-analysis` | `gamestudio` economy-liveops |
| R10 save migration | `save-systems` | — |
| R10 流程反复试错 | `paranoia-ai-system-evolver`（2 次失败停手） | `gamestudio` handoff-debug |
| 12 页签 GameScreen | `game-ui-ux` | APICO Deep Dive |
| Canvas 回放 + 舰队性能 | `performance-optimization` | `game-engine` |
| 新手引导节奏 | `game-experience-density-optimizer` | — |
| 概念立项 / 跨职能工作流 | `gamestudio` | `game-experience-density-optimizer` |

