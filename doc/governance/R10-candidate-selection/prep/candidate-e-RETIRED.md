# Prep Stub — Candidate (e) CR-1 RETIRED

> 落盘时间：2026-09-19 22:53
> 替代文件：`prep-candidate-e-save-migration.md`（已废，保留作 narrative-trap 教学）
> 状态：**RETIRED — 原始 finding 无 evidence 支撑**

## 原始 finding（CR-1）

> C8 能源选项 B 存档迁移未拍板（v2-v10 存档加载后电力翻倍，破坏 R9 修复）

## Evidence Check（一手 grep）

读 `E:\Ogame\web\src\game\state.ts` line 637-696：

```
637: if (d.saveVersion < 2 || d.saveVersion > 11) return '存档版本不兼容'
638: if (d.saveVersion === 2) { ... d.saveVersion = 3 }
653: if (d.saveVersion === 3) { ... d.saveVersion = 4 }
658: if (d.saveVersion === 4) { ... d.saveVersion = 5 }
664: if (d.saveVersion === 5) { ... d.saveVersion = 6 }
670: if (d.saveVersion === 6) { ... d.saveVersion = 7 }
674: if (d.saveVersion === 7) { ... d.saveVersion = 8 }
679: if (d.saveVersion === 8) { ... d.saveVersion = 9 }
683: if (d.saveVersion === 9) { ... d.saveVersion = 10 }
690: if (d.saveVersion === 10) { ... d.saveVersion = 11 }
```

→ **migration chain v2→v11 已完整存在**，无 break。

读 `web/src/game/state.ts:135-162` SaveData interface：

```
147: tutorialSkipped?: boolean  ← 新字段，v11 内追加，?? false 兜底
152: campaignEliteDone: number[]  ← v11 末尾追加，?? [] 兜底
```

→ 没有任何「spawnProfile」字段。我原始 prep 里写「npcs[].spawnProfile: 4 字段 × 3 难度 = 12 NPC 资源重算」是**凭空捏造**。

## 为什么 CR-1 是 narrative-based finding

错误假设链：
1. 看到 R9 改了 4 个公式（objects.ts:59 / 151 / 324-332 / npc.ts:131）
2. 假设「公式改了 = 老存档数据语义变 = 必须迁移」
3. 没读 state.ts loadFromSlot 实际怎么 migrate
4. 没读 SaveData interface 确认有没有 spawnProfile 字段

真相：
- R9 4 个公式（C1/C3/C4/C8）全是 **runtime formulas**（玩家操作时计算）
- SaveData 只存「状态快照」（建筑等级、研究进度、资源、NPC ID）
- 公式改了不影响已存数据，影响的是「加载后玩家继续玩时的数字」
- 老玩家 v10 存档加载后，照 v10 公式运算之前的状态 + v11 公式运算之后的状态 = 数学上**一致**（公式替换不是数据迁移）

## Ponytail 教训

b11 §evolve learning_001 二次实测：「narrative-based 排除是陷阱」。这次是 narrative-based **finding** 的陷阱——同样机制：

- narrative = 「R9 改公式 → 老存档必然崩」 (narrative)
- evidence = state.ts migrate chain 已存在 + SaveData interface 无 spawnProfile (evidence)
- verdict = **finding 不成立，撤稿**

**升级路径**：
- 写 finding 前必 grep 一手代码
- 引用 prep 编号时不引用 prep 里没 evidence 支撑的细节
- prep-candidate-e-save-migration.md 这种 prep 不应该存在——它是无 evidence 的设计，浪费 user 决策权重

## 真正的「save migration 候选」（如果 user 仍想做）

R9 后下一次公式改动（未来 R10+）会真的需要新 migration step。届时可以：
1. 写 v11 → v12 migration step（等真有新字段再写）
2. 加 unit test 覆盖每条 chain（预防 regression）

但**当下没有这个需求**。

## STATUS

| 字段 | 值 |
|---|---|
| 原始 finding | CR-1 (CRITICAL) |
| 一手 grep 验证 | 撤稿 |
| 撤稿时间 | 2026-09-19 22:53 |
| 撤稿证据 | state.ts:637-696 migrate chain 完整 + SaveData interface 无 spawnProfile |
| 关联 prep | prep-candidate-e-save-migration.md（保留作 narrative-trap 教学） |
| 关联 decision.md | 需标记 CR-1 RETIRED |
| 关联 STATUS.md | prep dir (e) 从 READY 改为 RETIRED |

## 关联

- 关联 prep：`prep-mj2-state-stack-validation.md`（同样 narrative-trap 撤稿模式）
- 关联 decision.md：CR-1 撤稿，CR-2 仍待 user 战略
- 关联 STATUS.md：prep dir 状态表更新