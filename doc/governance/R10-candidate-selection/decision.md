# R10 候选决策 memo

> Companion to IWO-20260919-001  |  Author: paranoia-ai-system-evolver (shadow)
> 来源证据：`doc/numbers-audit.md` `doc/round9-tuning.md` `doc/economy-tuning.md` `doc/code-review.md`

## 5 个候选（从 doc 中已识别）

| ID | 候选 | impact 估 | feasibility 估 | 风险 | 证据出处 |
|---|---|---|---|---|---|
| **(a)** | 终局教程/日报引导（明确「下一步是殖民地」而非深挖） | 高（直接治 economy-tuning §5 失败信号 A+D） | 中（需要 tutorial 重写 + 日报 hook，但无新机制） | 低（教程层，不动数值） | numbers-audit §12, economy-tuning §5 |
| **(b)** | Go 后端删/留架构决策 | 中（治 code-review P1-1 死代码） | 高（删 Go = 一刀切；留 = 启动对齐返工） | **高**（战略决策，可能影响未来 P2P 路线） | code-review §4 |
| **(c)** | 战斗 PRNG seed 化（前端侧） | **🟢 SHORTLIST #3 (2026-09-19 23:40, user 拍 option 1) · ⚠️ 反弹修正（2026-09-19 22:30，b11 P2.1）**: grep Math.random web/src 21 hits / 6 files（battle.ts:80/100/117 + BattleReplay.tsx:175/176 + state.ts:11 + npc.ts:166/180 **半 seed 化混用** + accounts.ts/toasts.tsx cosmetic）→ impact 升 mid-high（不只存档重 roll，回放帧选择、NPC 资源/目标、防御修复掷骰、事件触发全是非确定性；R9 §2.2 落库只堵存档重 roll，不堵这些）。原 narrative「R9 §2.2 已堵」**经 evidence 反弹为部分成立**（存档部分成立，运行期 18/21 仍非 seed）。详细 re-rank 见 `prep/candidate-(c)-PRNG-seed-mini-iwo.md`，3 选项等 user 拍：(1) 进 shortlist (2) 独立 track (3) 继续排除承认 evidence | 高（commit-time lint rule 禁 Math.random 即可机械化） | 极低（lint 兜底，可分批 revert） | round9-tuning §7 + grep `web/src/*.ts` Math.random |
| **(d)** | 中期内容（角色职业 / 远征扩充 / 残骸场） | **很高**（最大设计空间，玩家中后期唯一深度来源） | 低（设计 + 实现 + 平衡三件，工程量级 ≥ R5） | 中（新系统需要新平衡审计） | round9-tuning §7, economy-tuning §0 Fun Hypothesis |
| **(e)** | C8 能源「选项 B」存档迁移策略 | ~~中（治 economy-tuning §3 bug 标签）~~ **🔴 RETIRED (2026-09-19 22:55, b25 一手 evidence 反弹)**：原始 claim「v2-v10 存档加载后电力翻倍」无 evidence。state.ts:637-696 migrate chain v2 → v11 **已完整存在**；SaveData interface 无 `spawnProfile` 字段（prep 凭空捏造）；R9 4 公式（C1/C3/C4/C8）全是 runtime formulas 不存 save，老存档加载后不影响已存数据。详见 `prep/candidate-e-RETIRED.md` | n/a | n/a | round9-tuning §1, economy-tuning §3 (但 R9 修复已 in-place, 无需 migration) |

## 二维排序（impact × feasibility，ponytail 偏好 high-feasibility）

```
                high feasibility
                       │
           │  (a) 终局教程 ← 入选
                       │  (c) PRNG ← 入选
        ───────────────┼─────────────── high impact
           (b) Go     │  (d) 中期内容 ← 入选
                       │
                low feasibility
```

## SHORTLIST（≤3，按执行顺序）

### 入选 #1: (a) 终局教程/日报引导

- **authority_level**: P3_reversible_execute（教程层，可一键关掉回退）
- **Human Gate 触发**: 写新 tutorial 数据文件 = candidate_learning，不触发；改 default tutorial 触发（user 拍板）
- **依赖**: P2 Victoria 3 Deep Dive URL（决定日报具体怎么写）
- **rollback**: 删除 doc/tutorial/ 下新增章节 + revert GameScreen TutorialPanel 即可
- **为什么第一**: 治根失败信号（A+D），不动数值，回滚简单，对玩家即时可见

### 入选 #2: (d) 中期内容（角色职业 / 远征扩充 / 残骸场）

- **authority_level**: P2_draft（设计稿必须 user 拍板才能进 P3）
- **Human Gate 触发**: 新加技能/兵种/系统 = 必须走 Human Gate（影响玩家永久能力）
- **依赖**: 无（独立设计空间，但需要新开 R 轮平衡审计）
- **rollback**: 新内容放在独立 module，可以 feature flag 关掉
- **为什么第二**: 最大设计空间，撑住中后期；但工程量大，所以放 P2_draft 不直接 P3

### 入选 #3: (c) PRNG seed 化（前端侧）

- **authority_level**: P2_draft（写代码 + 单元测试，可分批 revert）
- **Human Gate 触发**: 不触发（不修改存档 schema、不改 game balance、不改 player ID 生成）
- **依赖**: 无（独立 track，跟 (a)/(d) 无 shared work）
- **rollback**: revert 1 commit（无 schema migration 牵连）
- **为什么第三**: evidence-based 反弹后 impact = mid-high，feasibility = high，~60 行 TS + 30 行 test 即可解锁 replay determinism + save-load 一致性 + NPC 行动可复现性。R9 §2.2 修复 root cause 同源但调用栈不同，mini-IWO 是其延伸。
- **Mini-IWO**: 见 `prep/candidate-(c)-PRNG-seed-mini-iwo.md` §建议
- **P3.6 MVP 已落地（2026-09-19 23:40）**:
  - `web/src/game/npc.ts:166` drop Math.random from counterattackFleet seed
  - `web/src/game/npc.ts:179-180` pirateFleet 加 seed? param（Knuth multiplicative hash）
  - `web/src/game/state.ts:1203` pirateFleet caller 传 fleetPower as seed
  - `web/src/game/__tests__/npc.test.ts` +5 tests for replay determinism
  - **结果**: 12/12 vitest pass, tsc -b OK, vite build OK
- **剩余 scope (next-turn candidates)**: 17 game-logic Math.random callsites (battle.ts:3 + BattleReplay.tsx:2 + state.ts:11) + oxlint no-restricted-syntax 禁 Math.random in game/

## 显式排除（why）

- **(b) Go 删/留**: 不进 shortlist，因为这是**战略决策**不是 issue，user 必须单独开 IWO 处理

- **(e) C8 存档迁移**: ~~(2026-09-19 22:30) 进 shortlist~~ → **🔴 RETIRED (2026-09-19 22:55, b25 evidence 反弹)**。state.ts migrate chain 已完整 + SaveData 无 spawnProfile + R9 4 公式全是 runtime 不存 save。详见 `prep/candidate-e-RETIRED.md`
- **Victoria 3 阻塞 (a)**: 如果 P2 7 天内不解锁，把 (a) 降级为「写最小 tutorial stub + 留 TODO」，不等

## 给 user 的 3 个 ask（按优先级）

1. **拍板 shortlist 顺序**（#1 a / #2 d / #3 c），(e) 已 RETIRED · P3.6 (c) MVP 已落地，如有异议现在改
2. **P2 Victoria 3 URL**（提供即可解锁候选 a 的真实设计）
3. **Go 删/留战略决策**（单独 IWO，不混进 shortlist）
