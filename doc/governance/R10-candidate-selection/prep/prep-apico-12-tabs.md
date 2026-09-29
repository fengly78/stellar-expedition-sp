# Prep: 12 页签 GameScreen — APICO Deep Dive 接入

> AI-PREP stub | 不替 user 做战略决策 | URL 到后立即开火
> 来源依据：decision.md (P3-after) | OGame 当前 12 页签 GameScreen 治理
> Skill 待调：`game-ui-ux` + `paranoia-ai-system-evolver`

## 当前阻塞

| 项 | 状态 | 谁解锁 |
|---|---|---|
| APICO Deep Dive URL | ❌ 未提供 | user |
| 短名单拍板 | ❌ 待 user 拍板（IWO-20260919-001） | user |
| 12 页签 audit | 不可开始（无文章证据） | URL 解锁后 |

## URL 解锁后立即动作

### Step 1: Fetch + 摘要（5 分钟）

摘出 4 类证据：

1. **多菜单架构**：APICO 怎么同时打开 4-6 个菜单而不断主交互流
2. **拖拽 + 多窗口**：「拖拽到目标菜单」的具体 UI 范式（不是绝对像素，是锚定）
3. **目标菜单的状态机**：当前激活菜单如何 stack、如何 back、如何挂起
4. **可用性启发式**：APICO 哪些设计选择被作者自己点名「降低学习成本」

### Step 2: 用 game-ui-ux 落证据等级 + 12 页签映射（15 分钟）

调 skill:

```
skill(name="game-ui-ux")
prompt: |
  把 APICO Deep Dive 的 4 类证据分别贴 confirmed / assumed / unknown 标签。
  对 OGame 12 页签 GameScreen 做映射表：每页签标「anchor 类型 / focus 模型 / 与其他页签的 stack 关系」。
  给出 3 个 candidate redesign（保守 / 标准 / 激进），每个带风险和回滚边界。
```

skill 路径已确认：
- SKILL.md 在 `.opencode/skills/game-ui-ux/SKILL.md`
- 1 个 reference：`layout-and-flow.md`（锚定布局 + screen flow + focus navigation）

skill 强约束（已读 SKILL.md）：
- 「Pick a layout model: anchors + containers, never absolute pixels」
- 「Choose a scaling strategy: reference resolution that scales to fit」
- 「Gamepad/keyboard focus navigation」
- 「Screen/menu state stack, not flag soup」
- 「Event-driven HUD updates, not polled」

### Step 3: 落地 12 页签 audit 报告（30 分钟）

输出文件：`doc/r10-ui-audit-12-tabs.md`

骨架：
- §1 12 页签当前架构（**P1.6 observe 已就绪，2026-09-19 21:29** — 见附录）

## 附录 A: 12 页签现状 (P1.6 observe 阶段已抓)

> 文件：`E:\Ogame\web\src\components\GameScreen.tsx` (17294B, 381 行)

### 12 页签 + icon (line 20-33)

```
overview 🏠 | buildings 🏗️ | shipyard 🚀 | research 🔬 |
galaxy 🌌    | campaign ⚔️  | fleet ✈️     | reports 📜 |
achievements 🏆 | officers 👔 | highscore 🏅 | codex 📖
```

### 渲染机制 (line 349-360)

```tsx
<main>
  {tab === 'overview' && <Overview planetId={planet.id} onJumpTo={setTab} />}
  {tab === 'buildings' && <Buildings planetId={planet.id} />}
  ... 12 个分支
</main>
```

模式：纯 `useState<TabKey>('overview')` (line 45) + 12 个 `{tab === 'x' && <X/>}` 分支。
**非路由、非 URL hash、非状态机**。

### 响应式布局

| 视口 | 布局 | 位置 |
|---|---|---|
| ≥sm (≥640px) | 竖排左侧 nav | `aside.sticky.top-0.w-44` (line 184-243) |
| <sm (<640px) | 横排底部 nav，可横向滚动 | `nav.fixed.inset-x-0.bottom-0` (line 365-377) |

### 关键 UI 模式

- **active state**：`data-active` (line 168) + `aria-current="page"` (line 169) — 跟 game-ui-ux 的 focus navigation 范式对齐
- **滚动同步**：选中 tab 自动 `scrollIntoView({ inline: 'center' })` (line 151-155)
- **移动端边缘渐隐提示**：scrollLeft > 4 → left fade-in；scrollLeft + clientWidth < scrollWidth - 4 → right fade-in (line 146-147)
- **跨页签跳转**：Overview 页通过 `onJumpTo={setTab}` 接受 setTab 函数暴露给子组件
- **badge 计数**：fleet 页签右侧自动加 alerts 计数（line 176-178，未读 NPC 任务数）
- **aria 完整**：aria-label / aria-pressed / aria-expanded / aria-current 齐全

### game-ui-ux 5 强约束对位

| 约束 | 当前实现 | 评级 |
|---|---|---|
| Anchors + containers, never absolute pixels | ✅ 用 Tailwind flex/aside/header/main/nav | OK |
| Reference resolution scaling | ✅ sm: 断点切换布局 + max-w-4xl 容器 | OK |
| Gamepad/keyboard focus navigation | ⚠️ 鼠标 + 键盘 Tab 可达，无 gamepad | 部分缺 |
| Screen/menu state stack | ⚠️ 当前是单一 useState，无 stack | **缺（APICO 主杠杆）** |
| Event-driven HUD updates | ✅ 资源栏 + 电力栏通过 React state 触发，非轮询 | OK |

→ 12 页签缺「状态栈」是核心改进点；其他 4 项都 OK。
- §2 APICO 4 类杠杆迁移表
- §3 12 页签 × 4 杠杆 矩阵（每格标 OK / 需要改 / 缺能力）
- §4 3 candidate redesign
- §5 推荐 + 落地文件列表
- §6 回滚边界 + 验证（vite build + 截图对比）

## 关键边界

1. **不动 React 组件代码**——本 prep 只到 audit report，重构另开 IWO
2. **APICO 是 HTML5 canvas 小游戏**，12 页签可能借鉴 layout pattern 但不借鉴 input 范式（OGame 是 mouse + keyboard，不上 gamepad）
3. **12 页签现状需要先 codebase-analyzer 抓**——别在 audit 报告里瞎猜当前架构

## 一旦 URL 抵达的最小触发消息

> 「APICO URL 已收到，开 Step 1-3。预计 50 分钟出 r10-ui-audit-12-tabs.md。」

→ skipped: 当前写 React 重构、抓 GameScreen.tsx 全部内容（prep 阶段不抓）→ add when: URL 抵达即开 Step 1 + codegraph_explore 一并抓现状。
