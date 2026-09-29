# Prep Stub — MJ-2 12 页签 State Stack Validation (RETIRED)

> 落盘时间：2026-09-19
> 来源：b23 review finding MJ-2（MAJOR state stack 缺）+ b24 一手 evidence 验证 → **narrative 撤回**

## Decision Object (锁死)

b23 review 提出 MJ-2 [MAJOR]「12 页签缺 state stack（game-ui-ux 5 约束 4 OK 1 缺）」—— claim 来自 game-ui-ux skill 5 强约束之一「screen/menu state stack」。b24 一手 evidence 验证：

- `GameScreen.tsx:46-47`：`useState` 两个独立 boolean modal（showSave / showMerchant）
- `GameScreen.tsx:303/363`：MerchantModal 在 overview 页签打开（不切 tab）
- `GameScreen.tsx:349-360`：12 页签 flat `{tab === 'x' && <X/>}` 渲染分支
- `web/src/components/` 6 个 Modal 文件：Modal.tsx + MerchantModal.tsx + MissileModal.tsx + GameScreen.tsx + DispatchWizard.tsx + DetailDialog.tsx（全部独立 boolean 控制，无嵌套 history）

## Evidence 结论（撤回 vs 真候选）

| 维度 | OGame 现状 | game-ui-ux 推荐 | verdict |
|---|---|---|---|
| anchors/containers/响应式 | ✅ GameScreen.tsx:184-243 + 365-377 | 推荐 | OK |
| resolution/aspect scaling | ✅ 移动端横排 + 桌面竖排 | 推荐 | OK |
| focus navigation | ✅ Modal.tsx focus trap | 推荐 | OK |
| event-driven HUD | ✅ setState 驱动 | 推荐 | OK |
| screen/menu state stack | ❓ **没有 history/push/pop** | 屏幕/菜单栈 | **看定义** |

**关键判断**：game-ui-ux 的「state stack」定义是**菜单层级抽象**（屏幕 push/pop + back navigation + 历史记录），对应复杂的多层级菜单导航（典型：MMO/AVG）。

OGame 12 页签 = flat tabs（无层级、无历史），单机策略游戏。flat tabs 是 game-ui-ux 对单机/策略类游戏的**推荐模式**（不是缺陷）：
- 点击 fleet 切到 fleet，再点 overview 回 overview —— 这是 tab 不是 history
- Modal（MerchantModal / SaveModal）独立 boolean 控制，可与 tab 并存（不是 push）
- 没有「返回上一页」语义（点 tab 就是直跳）

## Verdict：MJ-2 真撤回

- **不是 narrative 偏差** —— game-ui-ux 5 约束 4 OK 仍然成立
- **是定义边界**：OGame 是单机 4X 策略 = flat tabs 是正确设计，不是 state stack 缺陷
- **若要真补**：需先 user 选「要不要加 push/pop 屏幕导航」—— 这是设计变更不是修缺

## 替代建议（可考虑但不阻塞）

如果 user 后续想升级 UX，可考虑：
1. **URL 路由**（用 react-router）：让 12 页签变成可分享/可前进后退 URL —— 跟 state stack 是两个独立维度
2. **Modal queue**：当 MerchantModal + SaveModal 同时打开时排队 —— 现在 boolean 是「后开覆盖前开」
3. **Tab 嵌套 history**：在 Fleet 页内打开「Mission Detail」返回时保留上次 Fleet 滚动位置 —— 是单页内的 history，不是全局 state stack

这 3 个选项都不是 R10 critical/major 范围，列为 future candidate。

## 阻塞

- ❌ 不消耗任何 BLOCKED
- ❌ 不修改 decision.md（(a)/(d)/(e) 入选不变）
- ❌ 不消耗 shortlist / Victoria 3 / APICO / Go / lennysnewsletter 决策
- ✅ 唯一输出：narrative 撤回 + 3 替代选项 future-candidate 备查

## 关联

- 关联 prep：`prep-apico-12-tabs.md`（APICO URL 抵达后做 12 页签 audit 时，本结论是 audit 起点：flat tabs 是推荐模式，audit scope = 响应式 / a11y / 焦点管理，不应包含 state stack）
- 关联 finding：MJ-2 从 b23 MAJOR 降级为 RETIRED