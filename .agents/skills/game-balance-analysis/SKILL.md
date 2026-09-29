---
name: game-balance-analysis
description: OGame 项目的数值平衡分析工作流。凡涉及数值平衡、经济曲线、产量/造价/回本周期、建造与研究时长、舰队航时燃料、战斗损耗与掠夺、RC1 规则集调参评估、削弱/增强（buff/nerf）影响测算、金值与回归基线影响判断的话题都应使用本技能——即使用户没有明说"平衡分析"二字。分析结论一律产出一手数据表与 CR 决策建议，不直接改动冻结的规则集。
---

# Game Balance Analysis（OGame 数值平衡分析）

对 E:\Ogame 项目做数值分析时使用本技能。核心纪律：**常数只从规则集读，结论只用引擎算，改动只走决策流**。

## 真值来源（读取顺序）

1. `config/rulesets/balance_rc1.json` — 唯一的数值常数来源。RC1 是冻结（frozen）规则集：待批数值为 TBD，缺失时业务层 fail-closed 拒绝执行，**不要**凭记忆或上游 OGame 资料填数。
2. `rules/formulas.py` — 公式真值（F-01 升级造价、F-02 产量、F-03 能源因子、F-04 仓容、F-06 槽位、F-08 时长、距离/航时/燃料族）。写分析脚本时 import 它，不要重新实现公式。
3. `sim/engine.py`、`sim/combat.py` — 模拟内核。跨回合/跨系统的问题（攒资源、能源瓶颈、战斗损失）一律跑模拟，不做手算推演。
4. `doc/mvp-balance.md`、`doc/economy-tuning-2026-09-18.md`、`doc/round9-tuning-2026-09-19.md`、`doc/numbers-audit-2026-09-19.md` — 历史平衡决策与审计。新分析先核对是否已有人做过、当时的结论是什么。

代码里出现任何平衡常数都是违例（项目纪律：代码零 Balance 常数）。分析中引用数值时注明出处（规则集键名或 F-xx 编号）。

## 分析工作流

1. **框定问题**：一句话写清玩家可感知的结果（例：'金属矿 Lv10 时太阳能电站需要几级才不拖累产能'），并定位涉及的公式族（F-xx）与规则集键族。
2. **写一次性脚本**计算曲线表，import `rules/formulas.py` 与读取 `balance_rc1.json`。等级扫描通常覆盖 Lv0→Lv15 或触及仓容/时长瓶颈的等级。Windows 下注意：subprocess 显式 `encoding='utf-8'`，管道会掩盖真实退出码，跑完独立复核 exit code。
3. **产出四类标准视图**（按问题取用，不必全做）：
   - 成本-产量-回本表：每级造价、增量产量、回本周期（小时）
   - 瓶颈定位：能源赤字拐点、仓容溢出点、建造时长超过玩家的等待耐心阈值的等级
   - 交换比：跨资源换算（金属/晶体/重氢）、舰船性价比（造价 vs 火力×装甲×速度）
   - 时间轴体验：到关键里程碑（首殖民、首舰队、首月）的真实耗时
4. **回归影响评估**：任何"如果改 X"的提案，必须列出会漂移的既有基线——`sim/reports/baseline/` 五基线、`tests/golden/` 金值向量、combat_corpus 语料，并说明需重新 record/生成的清单。
5. **输出建议**：结论写成 CR 决策项草案（对齐 `doc/governance/decision-quick-review-*.md` 的格式：推荐态度+理由+不批代价），候选数值放 `config/rulesets/branches/`，**绝不直接改 balance_rc1.json**——它冻结且带 hash 校验，改动需所有者批准后重导。

## 输出格式

分析报告固定包含：

```text
## 结论（一句话）
## 数据表（脚本产出的一手数据，标注公式族与规则集键名）
## 回归影响（哪些基线/金值会漂移，验证命令）
## 建议（CR 草案：改哪个键、从什么值到什么值、理由、风险）
## 复现命令（让所有者能一条命令重跑你的分析）
```

## 已知教训（沿自项目交接记录）

- JS 对象整数键按升序数值迭代，Python/Rust 用插入序——跨语言对拍数据先统一键序（unit_id 升序）。
- Canonical JSON：Python `json.dumps(sort_keys=True)` 分隔符带空格、PHP 不带——对拍用 CanonicalJson 口径，不直接比对原始串。
- 改动公式或引擎后，出门前必跑 `python tools/check_all.py`（六闸）与 `python tools/sim_regression.py check`。
