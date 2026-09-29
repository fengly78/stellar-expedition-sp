# 信息战与新手引导改造（2026-09-19）

**动机**：用户指出「星系没有探测是不应该知道敌人的情况的」，并要求以原始实现（OGameX, lanedirt/ogamex, MIT）为准重做。对照 OGameX 源码确认其规则后落地。

## 1. 信息可见性规则（对齐 OGameX）

OGameX `GalaxyController` 的星系页 `fleet` 字段硬编码为空数组、防御从不渲染——**星系页默认零军事信息**。我们的旧实现直接读 `npc.fleet`/`npc.defenses` 渲染，属信息泄露。现已改为：

- **星系页**：NPC 行默认只显示名称、位置、残骸场、难度标签；军事信息一律「未知」，直到该坐标存在侦察报告。
- **侦察报告四级揭示**（`objects.ts espionageReveal()`，复刻 OGameX 双轨判定）：

| 情报档位 | 探测器数阈值 | 或技术领先阈值 |
|---|---|---|
| 舰队总数 | ≥2 枚 | 领先 ≥1 级 |
| 防御总数 | ≥3 枚 | 领先 ≥2 级 |
| 资源库存 | ≥5 枚 | 领先 ≥3 级 |
| 精确编制 | ≥7 枚 | 领先 ≥4 级 |

有效探测器 = 派出数 − (对方间谍技术 − 己方间谍技术)²（仅当对方领先时扣减，OGameX 原公式）。
NPC 间谍技术按难度档配置：0/1/2 档 → 0/2/4 级（`npc.ts npcEspionageTech`）。

- **反侦察**：目标有驻军时逐枚掷骰，风险 = min(0.5, 驻军总数×2%)；驻军为 0 无风险（保护新手首次侦察）。报告始终送达（OGameX 源码注释明示 "Always create espionage report even if all probes destroyed"），只损失探测器。
- **Phalanx 传感器阵列**：从「透视驻军明细」改为「扫描移动中的舰队」（OGameX `PhalanxService` 原义），射程公式改 `等级²−1` 个星系，每次扫描消耗 5000 重氢。

## 2. 新手引导重做（tutorial.ts + Overview.tsx）

旧流程 8 步线性，存在断裂：第 5 步要求研究引擎（需实验室 Lv.1），但教程从未教建实验室。新流程 12 步、四章节：

1. **基建**（1-4）：金属矿 → 太阳能电站 → 晶体矿 → 重氢合成器（先矿后电，与产量公式咬合）
2. **工业**（5-7）：机器人研究中心 → 研究实验室 → 船坞
3. **军事**（8-10）：燃烧引擎研究 → 轻型战斗机 → 间谍探测器
4. **行动**（11-12）：侦察一个 NPC（教学信息不对称：「不侦察就看不见敌人兵力」）→ 赢得一场战斗

UI：总览页显示章节进度条 + 当前步骤 + 奖励预览 + 「跳过引导」按钮（`state.skipTutorial()`，存档字段 `tutorialSkipped`，v10 存档兼容迁移）。

## 3. 改动文件清单

| 文件 | 改动 |
|---|---|
| `web/src/game/objects.ts` | 新增 `EspionageReveal` / `espionageReveal()`；删除旧 `espionageLevel()` |
| `web/src/game/npc.ts` | `NpcPlanet` 加 `espionageTech`；新增 `npcEspionageTech()` |
| `web/src/game/state.ts` | `EspionageReportData` 改四级字段（fleetTotal/defenseTotal/resources/fleet/probesLost）；侦察任务结算重写（含反侦察掷骰）；`phalanxLevel` 射程改 L²−1；新增 `phalanxScan()`（消耗 5000 重氢、扫移动舰队）；教程检测改 12 步；新增 `tutorialSkipped` 字段与 `skipTutorial()`；存档迁移兼容 |
| `web/src/game/tutorial.ts` | 全部重写：12 步四章节 |
| `web/src/pages/Galaxy.tsx` | 全部重写：未侦察显示「未知」；按报告档位渲染；Phalanx 面板改移动舰队扫描 |
| `web/src/pages/Reports.tsx` | 间谍报告按新字段渲染（档位/损失/未知提示） |
| `web/src/pages/Overview.tsx` | 引导卡片改章节进度 + 跳过按钮 |

验证：`tsc -b` EXIT=0；`vite build` EXIT=0（53 modules，582ms）。

## 4. 设计备注

- **旧存档兼容**：旧侦察报告没有 `fleetTotal`/`defenseTotal` 字段，星系页对应档位显示「？」，重新侦察即刷新。不强制迁移。
- **双轨判定的意图**（来自 OGameX）：技术流玩家可以用等级领先替代堆探测器，两条成长路径都有效——这是间谍技术 (106) 的存在意义。
- **遗留**：能源公式量纲不统一（发电 ×SPEED、耗电不乘）仍待用户拍板（见 ref-ogamex-2026-09-19.md §能源）；战斗结算 seed 化未做，建议走 OGameX 路线（结算后落库、刷新只重放）。

