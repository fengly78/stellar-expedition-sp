# web/scripts —— 历史平衡实验脚本（存档状态）

> 状态标注 2026-09-23：本目录是早期平衡探索的**一次性实验脚本**，不构成质量闸，
> 也不代表当前数值权威。权威验证入口：
> 1. `src/game/__tests__/`（vitest 57+ 案，含 objects-economy 手算真值与战斗金值对拍）
> 2. 仓库根 `python tools/check_all.py`（七闸总闸）
>
> 直接 `node scripts/<name>.ts` 运行大部分脚本会失败：它们以无扩展名 ESM 导入
> `src/game/*`（如 `./prng`），裸 node 无法解析；本目录亦无 tsx/vite-node 运行器。
> `balance-sim.ts` 可独立运行但口径已落后（科技/造船耗时输出 NaN）。

| 脚本 | 主题 | 状态 |
|---|---|---|
| balance-sim.ts | 建造/科技/造船里程碑时间轴 | ⚠️ 可跑但口径过时（NaN 行） |
| balance-fix-test.ts | 早期平衡修正验证 | 存档（无 runner） |
| battle-rules-test.ts | 战斗规则实验 | 存档（无 runner） |
| migration-test.ts | 迁移实验 | 存档（无 runner） |
| mission-wipe-test.ts | 任务全灭实验 | 存档（无 runner） |
| newbie-shield-test.ts | 新手保护实验 | 存档（无 runner） |
| offline-income-test.ts | 离线收益实验 | 存档（无 runner） |
| research-queue-test.ts | 研究队列实验 | 存档（无 runner） |
| start-resources-test.ts | 起始资源实验 | 存档（无 runner） |

如需复活某脚本：迁入 `src/game/__tests__/*.test.ts` 命名并纳入 vitest（断言须按当前
objects.ts/state.ts 重核），或改写为显式带扩展名导入后用 node 直跑。
