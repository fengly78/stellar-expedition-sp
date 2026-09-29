# CR-20260923-004：OGameX 机制补全派生候选值集（unit_id / 反侦察 / 残骸场）

> 状态：**Approved（2026-09-23 所有者批准，执行记录 tools/cr_batch_apply_20260923.py；RC1 frozen hash d8f1d02d…13ef9）** · 2026-09-23 · 前置：E0-c 工具链落地 + 首次运行验证完成（交接 2026-09-23）。
> 定位：CR-003（SOURCE-01 五提案）之外的**机制补全派生项**。机制代码已全部落地并有测试锁定，
> 本 CR 只裁决**数值与标识回填**。批准前全部 fail-closed / 内部回退运行，不影响现有闸门。
> 出处纪律：候选值全部来自上游 OGameX 0.14.0（SHA 768b017…f894）源码审计，保持 Candidate，
> SIM 验证后才 Frozen（§09.2）。

## 提案 A：SHIP.*.unit_id 数值标识回填

- **内容**：RC1 五舰条目补 `unit_id` 字段：SMALL_CARGO=202、LIGHT=204、HEAVY=205、COLONY=208、SCOUT=210。
- **出处**：上游 `app/GameObjects/CivilShipObjects.php`（202/208/210）、`MilitaryShipObjects.php`（204/205）；CODEX_HANDOFF 2026-09-22（凌晨卅一）已登记「批准 CR-003 B 时需补 unit_id」。
- **现状**：无配置时引擎输入以 `crc32(舰名)` 作确定性内部 ID，输出映射还原舰名（测试锁定 `RaidEndToEndTest`）。
- **不批代价**：FFI participants 快照使用内部 ID，与语料/上游对拍需换算；rapidfire 配置键无法对齐上游数值键。
- **推荐**：批准（纯标识符，无数值平衡语义，与 CR-003 B 一起回填一次 hash）。

## 提案 B：INTEL.COUNTER_ESP + INTEL.REVEAL（反侦察机制参数，GDD-12 闭合）

- **内容**：
  - `INTEL.COUNTER_ESP = {divisor: 4, level_offset: 1}`
  - `INTEL.REVEAL = {gap_exponent: 2, fields: {ships: {probes:2, level:1}, defense: {probes:3, level:2}, buildings: {probes:5, level:3}, research: {probes:7, level:4}}}`
- **出处**：上游 `app/Services/CounterEspionageService.php:24-53`（概率式 `(守舰×(守级−攻级+1))/(探针×4)×100` 夹 0-100）与 `app/GameMissions/EspionageMission.php:457-510`（揭示阈值 2/3/5/7 + 级差抵扣 gap²，双轨）。
- **我方差异（有意，登记不静默）**：揭示用剩余探针按**存活数封顶**——上游全灭仍按出发数揭示，我方更保守（GDD-12 快照制 Replace 口径的一部分）。
- **现状**：机制代码 + 端到端测试全绿（`ScoutCounterEspionageTest`：无守舰不触发 / 压倒性必触发 / 残骸成骸 / 揭示裁剪 / 确定性重放）。判定种子 = sha256(task_id) 确定性派生，无运行时随机。
- **不批代价**：scout 命令对真实 RC1 保持 fail-closed（现状即如此），情报线不可用。
- **推荐**：批准（GDD-12 三项缺口全部有上游机制可 Keep，此为数值落地）。

## 提案 C：debris_fields 独立残骸场表

- **内容**：新增表 `debris_fields`（galaxy/system_pos/orbit 唯一 + metal/crystal/deuterium DECIMAL(20,4) + version），战斗残骸按坐标累加；MVP 只写不收（回收属 Post-MVP，氘恒 0）。
- **出处**：上游 `database/migrations/2024_09_01_200906_add_debris_fields_table.php` + `app/Services/DebrisFieldService.php`（load-or-create + append 同构）。
- **现状**：迁移 `2026_09_23_000021` + `DebrisFieldService` 已落地并纳入迁移链；raid 与反侦察战斗残骸均已入表（测试锁定）。DDL 草案末行「行星残骸场 TBD」由此解除（独立表，非行星列）。
- **不批代价**：残骸仅存于 battle_snapshots result_json，无法按坐标累积/查询。
- **推荐**：批准（加法性 schema，已按上游结构实现；db-schema-draft.sql 已同步补表）。

## 勘误（非决策项，登记）

- **燃料公式速度项语义**：SOURCE-01 审计稿 §1.2 的 `(sv/10+1)²` 中 sv 指**每舰速度值** `constant/pct×√(10d/v_i)`（上游 `FleetMissionService.php:187-194`），非基础舰速。此前按基础舰速理解会膨胀 5~6 个数量级。2026-09-23 端到端测试首次真实执行该公式时抓到，已按上游纠正（`FlightService::fuelCost`）并用 `RaidEndToEndTest` 锁定。

## 评审速决卡

| # | 提案 | 推荐 | 批准后动作 |
|---|---|---|---|
| A | SHIP.*.unit_id（202/204/205/208/210） | 批准 | 写入 RC1 → 与 CR-003 B 一起重导 hash → config_validate → 重跑七闸 |
| B | INTEL 反侦察/揭示参数 | 批准 | 写入 RC1 → hash → `tools/sim_regression.py check` → 正式 SIM 排入情报场景 |
| C | debris_fields 表 | 批准 | 已实现；仅需评审记录归档 |
| 勘误 | 燃料 sv 语义 | 归档 | 审计稿 §1.2 修订一行 |

批准顺序建议：A+B 可与 CR-003 合并一次评审（同一次 RC1 Patch ≤3 主参数纪律按族计）；C 独立归档。
