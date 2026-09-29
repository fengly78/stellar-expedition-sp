# 决策速批版（2026-09-22）：10 条待批 + 1 条新增

> 配套 `decision-checklist-2026-09-21.md` 使用。每条给出**推荐态度 + 理由 + 不批的代价**，你只需回复「全批」或逐条圈改。
> 本文件只做建议，不代替拍板；批准后我按各 CR 内机械清单逐条执行（写 RC1 Candidate → 回填 hash → config_validate → 改断言 → 重跑 SIM → 登记评审记录）。

## 推荐一览

| # | 推荐 | 核心理由（证据均来自已跑完的试验/审计） | 不批的代价 |
|---|---|---|---|
| E0-a 上游=lanedirt/OGameX | ✅ 批准 | MIT、Laravel 12、数值血统与 RC1 同源、自带 Rust FFI 战斗引擎与 §13 裁决同构；源码已本地审计完毕 | CR-003 全部候选值失去出处，整条线停摆 |
| E0-b 冻结 0.14.0=768b0172 | ✅ 批准 | ls-remote + 本地浅克隆 rev-parse 双重实测一致 | 上游漂浮，审计结论失效 |
| E0-c 工具链 | ✅ 选 **② 原生**（PHP 8.x zip + Composer + rustup，全部用户级安装、免 admin、免 WSL2、可整体卸载回滚；测试期用 SQLite，正式验收再装 MariaDB） | 本机实测（2026-09-22）：无 winget、无 PHP 痕迹；方案②三个下载源全部可达；方案①虽 Hyper-V 已启用、wsl.exe 存在、docker 源可达，但装 Docker Desktop 仍需 admin+重启且上游自述 Windows dev 模式慢 | 66 个 PHP 文件 + Rust 战斗模块永远停在「未运行」状态 |
| CR-002 A 三仓库 g=1.60 | ✅ 批准 | Active 仓损 42.5%→4.9% 进阈值；K-E10 总督无污染（−0.21% 保持） | SIM-01/02 无合法输入，economy 模块 TBD 阻塞不解 |
| CR-002 B 聚变 {150/60/30} g=1.50 | ✅ 批准 | 「有代价的密度选择」定位实证成立：资产 −2.8% 换低能占比 0.381→0.135；敏感性区间已排入正式轮兜底 | 能源只有太阳能单一路线，F-02 能源维度名存实亡 |
| CR-002 C 军事科技 g=2.00 | ✅ 批准 | 族内九项六项已 2.00，差异化由 F-07 k 系数承担；SIM-03 矩阵兜底验证 | 三项科技成本曲线悬空，combat 模块阻塞 |
| CR-003 A H=floor(SI/10)+殖民舰回填 | ✅ 批准 | 轻战/探针与上游天然一致；重战 1200/小运 500 保留是显式自定调参（SIM-03 已在该值下运行），不是疏忽 | 战斗结算 H 口径悬空，殖民舰无战斗属性 |
| CR-003 B 五舰 speed/fuel/cargo | ✅ 批准 | 一次解除 shipyard/fleet/combat 三模块 TBD 阻塞；game-server 里 FlightService/CombatResolveService 的 fail-closed 也靠它解锁 | SIM-02/03/04 继续用「实验假设」跑，服务端舰队/战斗代码不可用 |
| CR-003 C rapidfire 只登记 HF→SC=3 | ✅ 批准 | MVP 内唯一有效条目，范围最小化 | 无（不批只是少一条特性） |
| CR-003 D 反侦察机制+揭示阈值 | ✅ 批准 | 补登记而非变更；GDD-12 待核验段的上游答案，情报模块（ScoutArrivalService）解锁 | 侦察/情报功能永久 fail-closed |
| CR-003 E F-08 上游同构式 + speed=1 | ✅ 批准 | 校准证据最完整的一条：7 档全过预登记判据，speed=1 资产比 0.989 最贴基线 | 所有建造/研究/造船时长公式悬空，三个 TIME 配置族不解 |

## 批准顺序（重要）

1. **先 E0（a→b→c）**：E0 不批，CR-003 等于事实采纳上游却无名分（风险已在 CR-003 登记）。
2. **再 CR-003**（A~E 可整批）。
3. **CR-002 独立**，随时可批。
4. 想省事：回复「**全批**」我按 1→2→3 顺序机械执行全部 10 条。

## 附：新决策项 W1（本轮验证中发现，不在原 CR 包）

**web/ 前端与 game-server 的关系**。现状：两条独立线——

- `web/`：纯前端单机版（React+Vite+PWA，localStorage 存档，内置规则引擎，22 测试全过，桌面/移动端已验收收口）；
- `game-server/`：PHP 服务端权威（命令总线/幂等/Ledger/FFI 战斗，66 文件编码完成待运行验证）。

| 选项 | 含义 | 代价 |
|---|---|---|
| W1-① 双轨并存 | 单机版直接可玩先行，服务端做多人版 | 两套规则引擎长期同步成本 |
| W1-② 前端接服务端 | web/ 改为 API 驱动，规则唯一权威在服务端 | web/ game/ 逻辑层大改，单机可玩性丧失 |
| W1-③ 暂缓 | 先各自推进，E1 运行验证后再定 | 短期零成本，决策债延后 |

推荐 **W1-③**：E0-c 落地前服务端还没跑起来，现在定对接为时过早。

## 附：其它待你拍板的历史事项（跨工作流汇总，详表在各自目录）

- **R10 调参候选**（`doc/governance/R10-candidate-selection/STATUS.md`，9-19 挂起）：shortlist 三选一（终局教程 / 中期内容 / C8 存档迁移）、Victoria 3 与 APICO 的 Deep Dive URL、Go 删/留三问——共 4 项等你输入。

## 附录：E0-c 选②后的原生工具链安装预案（已实测可行，批准即执行）

1. **PHP 8.x**：`windows.php.net` 下载 VS16 x64 Thread Safe zip → 解压至 `E:\Ogame\tools\php\`（项目内，不污染系统）→ 启用 extension_dir、mbstring/openssl/pdo_sqlite/sqlite3（php.ini 四行）。测试与开发期用 SQLite 即可跑全部 PHPUnit；正式验收前再装 MariaDB。
2. **Composer**：`getcomposer.org` 下载 composer.phar 入 `tools/php/`，`node` 不需要，`php composer.phar` 直用。
3. **Rust**：`static.rust-lang.org` 下载 rustup-init.exe（用户级安装，默认 stable-msvc；若 MSVC Build Tools 缺失则改 gnu 工具链，二选一实测后定）→ `cargo test` 即与 Python 侧对拍 PRNG 锚点。
4. **验收动作**：`php -l` 全量 66 文件 → `phpunit`（SQLite 内存）→ `cargo test` + corpus-check → `php artisan migrate`（合并官方骨架后）。
5. 全程不需要 admin；卸载=删目录 + 删 cargo 用户目录，零残留。

---
生成：Kimi 会话 2026-09-22 凌晨；依据：CR-20260921-002 / CR-20260921-003 / E0-source-freeze-work-order / SIM 试验报告（sim/reports/）；E0-c 实测：winget 无、PHP 无、三下载源可达、Hyper-V 已启用、wsl.exe 存在（方案① 亦可行但需 admin+重启）。


## 执行记录（2026-09-23）

所有者口头「批准」全包（CR-002/003/004/005 + 经典机制组 + E0/W1 既有结论）。机械链执行完毕：RC1 批量写入（tools/cr_batch_apply_20260923.py：合并 12 + 新增 43 + F-08 解封，零 TBD）→ hash 回填 d8f1d02d8f8815021cff0d8d1c5dc47e28093dcabc2dc43850bab52373513ef9 → 七闸全 PASS（SIM 基线因 CR-003 C rapidfire 重录，归因经备份档对照实证）→ 双库 59/59 → frozen 行入库 balance_rc1@RC1-Frozen → 正式 SIM 首批四报告（sim01 矩阵 / sim02 d90 守恒 1e-7·首殖 4.25 / sim03 162 组×200 种子 / sim04 30 天窗）。gate_evidence 翻 true 需在脚本内嵌批准引用——留作后续机械项。
