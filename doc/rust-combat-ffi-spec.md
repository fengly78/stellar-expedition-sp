# Rust Classic 战斗模块 FFI 接口稿 v0.1

> 状态：Draft · 2026-09-21 · 不依赖工具链；工具链（Rust toolchain）到位后直接按此实现
> 权威链：`web/src/game/battle.ts` = canonical 实现（CR-20260921-001）；
> `sim/combat.py` = 已逐位等价验证的参照移植；`internal/battle/battle.go` = 等价测试参照语料（已关闭，禁止新增代码）。
> 本稿只规定**边界与验收**，不规定 Rust 内部实现。

## 1. 定位与边界

- §13 裁决：战斗计算在 Rust Classic 模块；协调器（PHP）生成参与者与科技快照、随机种子和规则版本；结算层（PHP）提交损毁、存活、掠夺与残骸（GDD-04）。
- 模块**纯函数**：同一（输入, 种子, 规则版本）→ 同一输出。无 I/O、无时钟、无外部状态。
-  crate 形态：`cdylib`，C ABI，供 PHP FFI 调用；同时提供 `simulate_json` CLI 包装便于语料回归。

## 2. FFI 签名

```c
// 输入/输出均为 UTF-8 JSON 字符串（schema 见 §3/§4）。
// 调用方负责释放返回指针（rust 侧提供 free）。
const char* ogame_battle_simulate(const char* input_json);
void        ogame_battle_free(const char* ptr);
// 批量接口：SIM-03 正式矩阵每组 1000~10000 种子，逐次 FFI 调用开销不可接受。
const char* ogame_battle_simulate_batch(const char* batch_json);  // {"cases":[...]}
```

## 3. 输入 JSON Schema（与 battle.ts `BattleInput` 对齐 + 两个扩展字段）

```json
{
  "attacker_fleets": [{"fleet_mission_id": 1, "owner_id": 7,
    "units": {"1": {"spec": {"unit_id": 1, "attack": 50, "shield": 10, "hull": 400,
                              "rapidfire": {}}, "amount": 100}}}],
  "defender_fleets": [{"…": "同构"}],
  "seed": 20260921,
  "max_rounds": 6
}
```

- `seed`：**扩展字段**。`null` 或缺省时按 TS 行为从输入派生（`hash32(owner, unit_id, amount…, 0xDEADBEEF, …)`，见语料 G-000）；显式值用于种子矩阵。
- `max_rounds`：扩展字段，缺省 6（与 TS 一致）。
- 科技加成由协调器**预先乘入** attack/shield/hull（口径 `stat×(1+TECH_GAIN×L)`，当前实验分支），模块不做科技计算。
- `rapidfire` 当前 RC1 全空；模块必须支持该字段（TS 语义：命中后 `rng() < 1−1/rf` 续射同一攻击循环）。

## 4. 输出 JSON Schema

```json
{
  "rounds": [{"attacker_ships": {"1": 3}, "defender_ships": {"2": 24},
              "hits_attacker": 12, "hits_defender": 27,
              "full_strength_attacker": 600, "full_strength_defender": 4050,
              "absorbed_damage_attacker": 0, "absorbed_damage_defender": 0}],
  "attacker_losses": {"1": 97}, "defender_losses": {"2": 16},
  "attacker_survivors": {"1": 3}, "defender_survivors": {"2": 24}
}
```

逐回合结构对齐 battle.ts `BattleRound` 的计数字段；fleet 级明细（`units_start/result/lost` per fleet_mission_id）可选输出（`"detail": true` 时附带，对齐 TS `FleetResult`）。

## 5. 语义硬性对齐点（逐条对应 battle.ts）

1. mulberry32/hash32 逐位一致（`sim/combat.py` 已与 node 实测 battle.ts 对齐，可作为中间参照）。
2. 目标选择：`floor(rng() × len(defenders))`，攻击方按展开顺序逐个行动。
3. 弹跳：`damage < 0.01 × 目标基础护盾` → 该单位本回合停手（用**基础**护盾，非当前值）。
4. 吸收：先护盾后结构；回合末幸存单位护盾重置满值。
5. 爆炸：命中后 `hull/基础hull < 0.7` 时 `rng() < 1−ratio` 立即摧毁。
6. 回合内被摧毁单位仍可被击中（回合末才清场）。
7. 回合上限 6；任一方全灭提前结束；空防御方 → 0 回合。
8. 浮点：f64；种子派生整数运算为 u32 环绕语义。

## 6. 等价性验收协议（三方）

| 层级 | 内容 | 通过标准 |
|---|---|---|
| L0 语料回归 | `sim/combat_corpus/` 11 例（G-000~G-010，含弹跳/爆炸/全灭/平局/空防/混编/400 单位压力） | 输出 JSON 数值全等（字段顺序无关） |
| L1 模糊对拍 | 由 `sim/combat.py` 现场生成 1000 组随机编成+随机种子，Rust 并行计算 | 1000/1000 全等 |
| L2 跨语言基准 | G-000 与 node 直跑 battle.ts 结果一致（本机已验证一次：6 回合/攻存 3/守存 24/攻损 97/守损 16/hits 12/27） | 全等 |

回归入口约定：`cargo run --bin corpus-check sim/combat_corpus/` 退出码非零即失败。

## 7. 错误契约

- 输入 JSON 非法 / 缺字段 / amount<0 → 返回 `{"error": "...", "class": "bad_input"}`，不 panic 跨 FFI 边界。
- 单位数上限：单次调用单方 ≤ 100,000 单位（超出返回 `too_large`；SIM 侧自行分批）。

## 8. 显式不进入本模块

掠夺三重限制、残骸生成、燃料、航时、保护校验——全部是协调器/结算层职责（GDD-04）；模块只算战斗。

## 9. 语料清单（sim/combat_corpus/manifest.json，生成器 sim/gen_combat_corpus.py）

| 用例 | 覆盖点 | 结果锚点 |
|---|---|---|
| G-000 | TS 交叉验证基准 | 6 回合，攻存 3/守存 24 |
| G-001 | 弹跳规则 | 侦察 50 艘零伤害全灭于 5 重战 |
| G-002 | 结构比爆炸 | 10 重战 vs 60 侦察 |
| G-003 | 单方全灭提前结束 | 1 回合结束 |
| G-004 | 六回合互残平局 | 双方均存活 |
| G-005 | 空防御舰队 | 0 回合 |
| G-006 | 多舰队混编 | 攻方两 fleet_id |
| G-007 | 400 单位压力 | 5 回合攻方全灭 |
| G-008~010 | 固定种子随机编成 | 见 manifest |
