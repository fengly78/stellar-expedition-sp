# 游戏完整性检查报告（game-balance-analysis 口径）2026-09-23

## 结论（一句话）

**完整性通过**：RC1↔代码双向审计零死键零缺键、分支与冻结值零漂移、七闸/双库/live 运行时审计全绿；检查过程中抓到并修复一处真缺陷（防御残骸率键未接线），前瞻参数 17 项如实分类登记。

## 数据表（一手数据，注明键名与出处）

**A. 配置↔代码双向审计**（新工具 `tools/config_completeness.py`，RC1 99 参数 / PHP 静态+getFloat 读取 29 键 / 常量映射 7 键 / 分支 8 文件）：

| 检查 | 结果 | 说明 |
|---|---|---|
| 死键（RC1 有、代码无消费、不属动态族） | **0** | 初跑 29 → 甄别后全部归位（MINES 常量表/getFloat/子键/前瞻分类），唯一真死键 COMBAT.DEFENSE_DEBRIS_RATE 已接线修复 |
| 缺键（代码读、RC1 无） | **0** | FLEET.FORMULA.distance 等为对象子字段（父键在 RC1）；拼接字面量归动态族 |
| 分支漂移（branches vs RC1） | **0** | 子字段比对口径；counteresp_classic_084 为有意保留的未采纳备选（不入种子叠加） |

**B. 前瞻参数登记（已批准、机制未建——非缺陷，防误删清单）**：REFUND.*×5（取消/退款命令不在 MVP 11 命令）、PROTECTION.INITIAL（服务端新手保护未实现；web 单机另有硬编码 7 天）、AI.*×8（AI tick 零作弊骨架未读参）、GOV.LOGISTICS.EXAMPLE、VALUE.RESOURCE（F-05 由 python 公式承载）、WORLD.YIELD/ORBITS（世界生成/殖民轨道校验未建）。

**C. 全量验证（新鲜复跑）**：七闸全 PASS；PHPUnit SQLite **59/59** + MariaDB **59/59**（366 断言）；live `game:audit` 六项守恒全过。

## 回归影响

- 修复（DEFENSE_DEBRIS_RATE 接线 + debrisOf 族参数）：防御残骸率键缺失时恒 0——与修复前数值完全一致，**零基线漂移**；语料/金值/SIM 基线不受影响（防御路径语料 G-005 走引擎侧，不经此结算层）。
- 新工具 `tools/config_completeness.py` 纳入日常审计入口（建议 CR 后必跑）。

## 建议

1. **已执行**：COMBAT.DEFENSE_DEBRIS_RATE 接线（CR-005 批准键，此前隐式 0——现为显式配置驱动，键缺失仍回退 0 保持旧合成规则集兼容）。
2. **CR 草案级登记（不动冻结值）**：PROTECTION.INITIAL / REFUND.* / AI.* 三族为「机制缺口」而非数值缺口——若公测需要新手保护/取消退款/AI 实装，走新 CR 立项机制开发（数值已批无需改 RC1）。

## 复现命令

```
python tools/config_completeness.py          # 双向完整性（期望：合计发现 0）
python tools/check_all.py                    # 七闸
cd game-server && php -d memory_limit=512M vendor/phpunit/phpunit/phpunit
php -d memory_limit=1G vendor/phpunit/phpunit/phpunit -c phpunit-mariadb.xml
php artisan game:audit                       # live 运行时守恒
```
