# UI 设计系统规范（深色科幻仪表盘）

> 改造任何 UI 文件前**必读**。目标：24 个界面文件统一到一套语言，且并行改造不跑偏。

## 1. 硬性规则（违反即返工）

1. **不得修改 `src/index.css`。** 令牌与组件类是冻结的公共契约。若确实缺一个类/令牌，**停下来报告**，不要自行添加——否则六个并行任务会各自发明一套。
2. **不得写死 hex。** 唯一例外：`BattleReplay.tsx` 的 canvas 绘图色，但也必须取自下面的令牌常量。
3. **不得新建令牌。** 用已有的。`--color-*` 的完整清单见 §2。
4. **正文最小对比度：`text-ink-2`。** `text-ink-3` 只允许用于**非关键**辅助信息（时间戳、次要计数）。**禁止**用 `ink-3` 或 `opacity` 承载操作指引。原先 `text-slate-600`（2.4:1）必须全部消灭。
5. **所有数字加 `.num`**（等宽数位），防止计数器/倒计时宽度抖动。
6. **每页有且仅有一个 `.page-title`**，全站只允许 `<h1>` 出现在 `GameScreen` 侧栏 logo 处。
7. **不得删除现有功能。** 这是视觉+可用性改造，不是重写。所有 props、回调、业务逻辑保持不变。

## 2. 令牌清单（`src/index.css` 的 `@theme`）

Tailwind v4 里 `--color-x` 自动生成 `bg-x` / `text-x` / `border-x` / `divide-x` / `ring-x`，且支持透明度后缀（如 `bg-surface/80`）。

| 令牌 | 值 | 用途 |
|---|---|---|
| `void` | `#020617` | 应用最底层背景（body，已设） |
| `surface` | `#070d1b` | 基础面板底 |
| `surface-2` | `#0c1425` | 抬升面板 / 输入框 / 模态框 |
| `surface-3` | `#131d33` | 悬浮 / 内嵌 / hover |
| `edge` | `#1a2540` | 面板描边（默认） |
| `edge-2` | `#26344f` | 输入框 / 强描边 |
| `edge-hot` | `#0ea5e9` | 高亮描边 |
| `ink` | `#e6edf7` | 主要文字（≈16:1） |
| `ink-2` | `#a3b3cc` | 次要文字（≈9:1，正文下限） |
| `ink-3` | `#7d8da8` | 弱化文字（≈5.5:1，仅辅助） |
| `accent` | `#0ea5e9` | 主色 |
| `accent-2` | `#38bdf8` | 主色亮部（标题） |
| `accent-3` | `#0284c7` | 主色暗部（按钮底） |
| `ok` | `#22c55e` | 成功 |
| `warn` | `#f59e0b` | 警告 |
| `bad` | `#ef4444` | 危险 / 错误 |
| `metal` | `#fdba74` | 金属 |
| `crystal` | `#67e8f9` | 晶体 |
| `deut` | `#93c5fd` | 重氢 |
| `shadow-panel` | — | 面板阴影（含顶部内高光） |
| `shadow-glow` | — | 主色辉光（按钮/选中） |
| `shadow-glow-hot` | — | 强辉光 |

## 3. 组件类（`@layer components`，可直接当 className 用）

| 类名 | 用途 | 规范用法 |
|---|---|---|
| `.panel` | 玻璃面板 | 卡片/区块容器 |
| `.panel-hd` | 面板头（标题+右侧操作） | 与 `.sec-title` 搭配 |
| `.sec-title` | 区块小标题 | 面板内的分区标题 |
| `.page-title` | 页面主标题 | 每页唯一，置于页面根节点首位 |
| `.btn` | 按钮基类 | **必须**与变体联用 |
| `.btn-primary` | 主操作按钮（带辉光） | 页面的主 CTA |
| `.btn-ghost` | 次要按钮 | 取消、次要操作 |
| `.btn-danger` | 危险操作 | 删除、放弃星球 |
| `.field` | 输入框/下拉框 | 所有 input/select/textarea |
| `.chip` / `.chip-ok` / `.chip-warn` / `.chip-bad` | 状态徽标 | 状态、标签 |
| `.alert-bad` | 错误横幅 | **替代原先重复 7 次的红色横幅串** |
| `.empty` | 空状态容器 | 替代裸 `暂无xx` 一行字 |
| `.num` | 等宽数字 | 所有数值 |

### 规范片段（照抄）

```tsx
// 页面根
<div className="space-y-4">
  <h2 className="page-title">建筑</h2>
  ...
</div>

// 面板 + 头
<section className="panel p-3">
  <div className="panel-hd">
    <h3 className="sec-title">在建队列</h3>
    <span className="chip chip-warn num">2</span>
  </div>
  ...
</section>

// 按钮
<button className="btn btn-primary" disabled={!canBuild}>建造</button>
<button className="btn btn-ghost">取消</button>
<button className="btn btn-danger">拆除</button>

// 输入
<label className="block">
  <span className="mb-1 block text-xs text-ink-2">数量</span>
  <input className="field w-24 num" type="number" value={n} onChange={...} />
</label>

// 空状态
<div className="empty">暂无报告</div>

// 错误
<div className="alert-bad" role="alert">资源不足</div>

// 数值
<span className="num text-ink">{fmt(x)}</span>
<span className="num text-metal">{fmt(metal)}</span>
```

## 4. 视觉语言（「仪表盘」而非「普通暗色网站」）

- **面板**：`surface` 底 + `edge` 细描边 + `shadow-panel`（顶部 1px 内高光）+ 轻微 `backdrop-blur`（`.panel` 已内置）。
- **强调**：只用于可交互/状态关键处——`accent` 辉光按钮、选中项、资源色。**不要**大面积铺主色。
- **层级**：靠 `void → surface → surface-2 → surface-3` 四级高程区分，**不要**用不同描边色制造层级。
- **密度**：桌面端信息密度优先，紧凑但可读；间距用 `gap-2/3`、`space-y-3/4`，全站统一（**消灭**原先 2/3/4/6 四种并存）。
- **圆角**：统一 `rounded-lg`（面板）/ `rounded-md`（按钮输入）/ `rounded`（徽标）。
- **反面清单**：不要霓虹渐变文字、不要发光到刺眼、不要每张卡都加辉光、不要彩虹配色、不要为了「科幻」堆装饰性边框动画。

## 5. 本次必须落地的可用性修复（Tier-1）

| # | 位置 | 修法 |
|---|---|---|
| 1 | `Galaxy.tsx` 固定宽 flex 表 → 手机溢出 | 改响应式：桌面保留表格，`<sm` 改为堆叠卡片 |
| 2 | 全部 5 个 Modal 无 a11y | 加 `role="dialog"` `aria-modal` `aria-labelledby`、焦点陷阱、打开时移焦、关闭后还焦 |
| 3 | `Galaxy` 导弹触发器是 `<span role="button">` 嵌在 `<button>` 内 | 改为合法可聚焦元素（独立 `<button>` 或提到外层） |
| 4 | `toasts.tsx` 无 live region | 容器加 `role="status" aria-live="polite"` |
| 5 | ~~`index.html` `lang="en"`~~ | ✅ 已修 |
| 6 | 无错误边界 | `App.tsx` 加 ErrorBoundary，导入存档损坏不再白屏 |
| 7 | 10 处 `return null` 静默空白 | 改为 `.empty` 空状态（或保留 null 但父级有空态） |
| 8 | 对比度不达标 | 全部 `text-slate-600`/`500` + `opacity-50/60` 承载正文的改为 `ink-2` 以上 |
| 9 | `LoadScreen` `w-[26rem]` 手机溢出且左缘不可达 | 改 `w-full max-w-[26rem]` |
| 10 | 移动端 12 标签横向滚动无指示、切页不回到可见区 | 加滚动指示 + 选中项 `scrollIntoView` |

## 6. Tier-2（顺手做，不阻塞）

- 间距/内边距统一（见 §4）；transition 补齐；`active:` 态；hover 一致性。
- 标题层级修正（见规则 6）。
- `title` 属性承载的核心机制说明 → 改为可见文本或带 `tabIndex` 的可聚焦提示。
- 表单控件补 `<label>` / `aria-label`。
- 空状态补图标与 CTA。
- `BattleReplay` canvas：HiDPI backing store、`aria-label`、颜色取自令牌。
- 切页时滚动回顶部。

