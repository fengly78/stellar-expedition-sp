# 发布就绪评估（Release Readiness）2026-09-23

> 结论（2026-09-23 深夜终版）：**P0 全部清除**。数值已批准冻结（所有者批准全包 CR；RC1 frozen，hash d8f1d02d…13ef9，零 TBD）；
> 鉴权/版本管理/MariaDB 均有实证。当前状态 = 「可进入 staging/公测准备」。剩余为 P1 运维落地与 P2 合规项。
> 按 gamestudio Phase Gates 逐项对照，缺口分四级列出。

## 当前已验证的能力（有证据）

| 面 | 证据 |
|---|---|
| 服务端机制 | API-01 全部 11 命令 e2e 覆盖；PHPUnit **59/59（双库 SQLite+MariaDB 同绿）**；七闸全 PASS |
| 战斗正确性 | 三语言等价链（battle.ts/combat.py/lib.rs）+ 11 例语料 + 金值 |
| 玩家环 | HTTP 全环实跑（seed→bootstrap→state→命令→Worker→升级）+ 鉴权矩阵 |
| 客户端 | web PWA 单机完整可玩；服务器模式全玩法面板（建造/研究/防御/造舰/四任务/战报） |
| 经济/战斗数值 | **批准冻结**（RC1 frozen + 正式 SIM 首批四报告：d90 守恒 ~1e-7、首殖 4.25、162 组×200 种子、30 天窗）；gate_evidence 翻 true 留作机械后续 |

## P0 —— 已全部清除（2026-09-23 深夜）

| # | 缺口 | 现状 | 需要做什么 |
|---|---|---|---|
| 1 | ~~数值未冻结~~ | **✅ 已清除**：所有者批准全包 CR（执行记录 tools/cr_batch_apply_20260923.py）——RC1 合并 12+新增 43+F-08 解封、**零 TBD**、meta Frozen、hash `d8f1d02d…13ef9`；七闸全 PASS（SIM 基线因批准的 rapidfire 重录，归因经备份档对照实证）；frozen 行入库 `balance_rc1@RC1-Frozen`；正式 SIM 首批四报告（d90 守恒 ~1e-7/首殖 4.25/162 组×200 种子/30 天窗）；gate_evidence 翻 true（脚本内嵌批准引用）留作机械后续 | — |
| 2 | ~~零鉴权~~ | **✅ 已清除（9dc8a8a）**：Bearer Token（game:issue-token 签发/轮换）默认强制，三端点越权 403，限流 60/min，GAME_AUTH_ENFORCED 应急开关；实机矩阵 401/401/200/403 验证 | — |
| 3 | ~~无版本管理~~ | **✅ 已清除（c38b35e）**：git 基线 + 每单元提交 | 按需设远端备份 |
| 4 | ~~生产数据库未验证~~ | **✅ 已清除（2026-09-23 晚）**：便携 MariaDB 10.11.11（用户级 3307）——全 21 表迁移原生落库；**全套 58 测试双库（MariaDB/SQLite）同绿**，覆盖 ENUM/FOR UPDATE 行锁/JSON/DATETIME(6)/外键/DECIMAL(20,4)；并抓真缺陷 battle_id CHAR(36) 过短（已修 VARCHAR(64)）与 DECIMAL 4 位量化语义（测试容差按契约对齐） | 验证入口保留：`php -d memory_limit=1G vendor/phpunit/phpunit/phpunit -c phpunit-mariadb.xml` |

## P1 —— 公开测试（公测/内测）前必须

| # | 缺口 | 说明 |
|---|---|---|
| 5 | Worker 部署 | schedule:run 需常驻（cron/daemon/任务计划）；Redis queue 可选 |
| 6 | 客户端服务器模式深化 | 仅建造竖切：研究/舰队/防御/殖民 UI 未接入；无自动轮询/推送；owner 鉴权后的会话管理 |
| 7 | 多玩家并发测试 | 两玩家同时袭击同一星球、行锁竞争、Worker 与命令并发——仅单玩家 e2e 已测 |
| 8 | 部署流水线 | wwwroot/Nginx、HTTPS、域名、环境分离（dev/staging/prod）、备份策略 |
| 9 | 监控告警 | 错误日志聚合、队列堆积告警、经济守恒对账定时任务 |

## P2 —— 正式发布（Release Gate）前必须

| # | 缺口 |
|---|---|
| 10 | 隐私/数据声明（即使不收集也需声明）；服务条款 |
| 11 | 真机移动端矩阵（PWA iOS/Android 实测：SW/推送/触控/安全区） |
| 12 | 负载测试（事件队列吞吐、战斗引擎批量、DB 连接池） |
| 13 | 封禁/客服工具、GM 命令 |
| 14 | 新手引导与服务器模式 UI 融合（当前双轨并存，玩家认知成本） |

## P3 —— 明确不在 MVP（Post-MVP 边界内，不阻塞）

ACS/联盟、远征、月球、回收舰队、导弹、VIP/付费——V1.3 §04.2 边界已冻结。

## 建议路径（最短发布线）

```
git init ──┐
           ├→ CR 全批 → RC1 Patch+hash → 正式 SIM → 数值 Frozen
MariaDB ──┘                ↓
              鉴权+限流（P0-2）→ 多玩家并发测试 → staging 部署
                                       ↓
                            内测（P1 收尾）→ 公测 → Release
```

预估节奏（单人全职口径）：P0 全清 ≈ 1-2 周（鉴权与 MariaDB 并行）；P1 ≈ 2-4 周；P2 视运营目标。
