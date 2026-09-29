---
goal: Release Cut 1.0.0 — 关闭 M1 出口条件（i18n 批次 D 收尾、术语层、发布工程、QA 走查）
version: 1.0
date_created: 2026-09-27
last_updated: 2026-09-27
owner: repo owner
status: 'In progress'（Phase 0–5 已完成，仅剩人工验收与打 tag）
tags: [release, i18n, qa, infrastructure, process]
---

## 收尾状态（2026-09-27，权威）

下表是本计划各阶段的**最终状态**；下方任务表是当初的原始计划，部分行未回填，属历史记录。
逐条进展与踩坑见 `CODEX_HANDOFF.md` 顶部交接段。

| 阶段 | 状态 | 证据 |
|---|---|---|
| Phase 0 基线冻结 | ✅ | 三个原子提交 `8f97822` / `2471d6a` / `b87daae` |
| Phase 1 Galaxy | ✅ | `14b5d4c`（41 行 → 0，补 28 键） |
| Phase 2 批次 D 剩余页 | ✅ | `256ea22` / `353eede` / `4669784` / `f1b0f6a`；严格口径复查无未翻译串，剩余 33 行全部为经确认保留的双语副标设计与 1 行注释 |
| Phase 3 术语层 | ✅ | `e34a8ff`（四表 53 条 `nameEn` + `translateTerm`/`findTerm` + term.test.ts 6 条） |
| Phase 4 发布工程 | ✅ | `c9c6268`（1.0.0 + web/.env.example + GM_KEY + version-manifest + deploy.md 两节） |
| Phase 5 存档迁移测试 | ✅ | `e74f1c6`（15 条，含变异验证确认有鉴别力） |
| Phase 6-a 门禁 | ✅ | 七门禁 0；`tsc -b` 0；vitest 23 文件 170 通过 + 1 expected fail；phpunit SQLite + MariaDB 双库各 87/502 |
| EN 侧收官 | ✅ | `page-render.test.ts` 用服务端渲染断言 12 页 EN 输出零 CJK，687 处残留清零（详见 `35a9680`/`5376925`/`e9ca131`/`a94594d`） |
| Phase 6-b 双语走查 24 张截图 | ⏳ 人工 | 清单见 `doc/release-walkthrough-1.0.0.md` 第 2 节；走查前建议先跑 `vitest run src/game/__tests__/page-render.test.ts` |
| Phase 6-c 真机烟测 | 半自动 | 逻辑半已自动化（`release-smoke.test.ts` 7 条，存档往返已验证）；真实浏览器持久化与界面待人工（第 4 节） |
| Phase 6-d tag v1.0.0 | ⏳ 人工 | 须在 P0/P1 清零后创建（第 6 节） |

**额外加固（不在原计划内）**：
- `locale-contract.test.ts` 5 条不变量入 CI（zh/en 键集对齐、无空值、占位符逐键一致、引用键全部可解析、无孤儿键）——拦住「编译通过、单测全绿、界面照常渲染却静默回退成键名」的一整类缺陷。
- `release-smoke.test.ts` 7 条：开局→按真实依赖链建造→研究→造舰派遣→存档→读档→继续推进，验证读档后建筑/舰船/科技/时钟/资源全部恢复。
- `page-render.test.ts` 25 条：12 页 zh/en 渲染，EN 输出零 CJK（三层断言：硬断言 / 双语副标白名单 / 债务哨兵）。
- `term.test.ts` 6 条、`save-migration.test.ts` 15 条。

---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

本计划是 `doc/release-plan-2026-09-27.md` 中 M1 阶段的可执行落地版本。里程碑定义不再重复，此处只登记**当前实测基线**、**逐任务动作**与**可机械验证的完成判据**，供后续会话或人工按批次执行。

## 0. 实测基线（2026-09-27 复核，作为起点冻结）

| 项 | 实测值 | 取得方式 |
|---|---|---|
| 七门禁 | 全 PASS（退出码 0） | `python tools/check_all.py` |
| web 类型检查 | 零错 | `node node_modules/typescript/bin/tsc -b`（web 目录） |
| web 单测 | 18 文件 / 113 用例全绿 | `node node_modules/vitest/vitest.mjs run`（web 目录） |
| 服务端单测 | 87 用例 / 502 断言 OK（PHP 8.3.35） | `php -d memory_limit=1G vendor/phpunit/phpunit/phpunit --no-coverage`（game-server 目录） |
| 版本号 | `web/package.json` = **0.3.0** | 直接读取 |
| 术语层 | `objects.ts` 中 `nameEn` 出现 **0** 次 | 直接读取 |
| i18n 键空间 | common / title / profile / menu / settings / overview / build / research / ship / galaxy | `web/src/game/locales/en.ts` |
| 已 t() 化页面 | Overview、Buildings、Research、Shipyard（4 页） | 各页存在 `useLocale` 调用 |
| 待 t() 化页面 | Galaxy(41) / Fleet(27) / Reports(27) / Achievements(23) / Campaign(22) / Codex(23) / Officers(13) / Highscore(10) 行非注释中文 | 逐页统计，`useLocale` 全部为 False |

说明：括号内为「非注释中文行数」，已排除 `//`、`/*`、`*` 开头行。Galaxy 的 50 个 `galaxy.*` 键已在 zh/en 两侧就位且键集逐键对齐，页面尚未接入。

## 1. Requirements & Constraints

- **REQ-001**: 单机线 zh/en 双语全程可玩——8 个页面必须全部接入 `t()`，EN 模式下不得出现纯中文无英文对照的用户可见串。
- **REQ-002**: 版本号 1.0.0 单点注入。`web/vite.config.ts:9-16` 从 `web/package.json` 读 `version` 并 define 为 `__APP_VERSION__`；`web/src/game/version.ts:18` 消费；`TitleScreen.tsx:24`、`SettingsScreen.tsx:304`、`PrivacyGate.tsx:11` 三处展示。只改 package.json 即可，禁止在三处展示点硬编码版本。
- **REQ-003**: 离线 PWA 可安装、断网刷新不丢档（`vite-plugin-pwa`，`registerType: 'autoUpdate'`）。
- **REQ-004**: 老存档 v2→v11 无损升级，迁移链位于 `web/src/game/state.ts:729` 起的逐级 `if (d.saveVersion === N)` 段。
- **REQ-005**: 每批七门禁全绿才提交（`tools/check_all.py` 退出码 0）。
- **REQ-006**: 数值一律不动。RC1 已 frozen（hash `d8f1d02d…13ef9`，零 TBD），本计划全部任务为文案/工程/QA 变更，不触碰 `config/rulesets/balance_rc1.json` 与任何公式常量。
- **SEC-001**: `GM_KEY` 为 GM 接口密钥（`game-server/config/services.php:24` → `app/Http/Middleware/GmAuth.php:21`），模板中只允许留空值加注释，禁止在任何入库文件中出现真实值。
- **SEC-002**: 保持 i18n 零依赖，不得为翻译引入第三方库（`web/src/game/i18n.ts` 当前仅依赖 React `useSyncExternalStore`）。
- **CON-001**: 页面迁移模板固定三步——`import { useLocale } from '../game/i18n'`、组件内 `const { t } = useLocale()`、字面量替换为 `t('ns.key')`。
- **CON-002**: zh/en 键集必须逐键对齐。`translate` 对 en 缺键静默回退中文（`i18n.ts:55`），键不对齐不会报错、只会漏译，必须机械比对。
- **CON-003**: 占位符仅支持 `{word}` 形式，正则见 `i18n.ts:57`；缺失参数原样保留 `{name}`。
- **CON-004**: 保留「中文主标 + 英文副标」双语视觉（如 `Research.tsx:141` 的 `category.label` + `category.en`），本轮不改结构。
- **CON-005**: 术语层落地前，`objects.ts` 各表 `name` 字段保持中文原值，只做追加。
- **CON-006**: 编辑既有文件时保留原行尾。已实测：`game-server/.env.example` 为混合行尾（67 LF + 末行 1 CRLF），`.gitignore` 第 34、40 行为 CRLF、其余为 LF。
- **GUD-001**: 每页迁移完成后依次跑类型检查 → vitest → build → 该页非注释中文行数归零，四项全过才进下一页。
- **GUD-002**: 提交信息使用 `feat` / `fix` / `docs` 前缀。
- **GUD-003**: 每批完成后在 `CODEX_HANDOFF.md` 顶部追加一段交接记录，最新段置顶。
- **PAT-001**: `t()` 迁移模板参照 `web/src/pages/Shipyard.tsx:4`（import）与 `Shipyard.tsx:14`（`const { t } = useLocale()`）。
- **PAT-002**: Python 工具脚本路径模板 `ROOT = Path(__file__).resolve().parent.parent`（参照 `tools/check_all.py:21`、`tools/balance_tables.py:16`）。

## 2. Implementation Steps

### Implementation Phase 0：基线冻结

- GOAL-001: 把当前工作树落成一个可回滚的干净基线，使后续每批 diff 可独立审阅。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 提交当前工作树。实际拆为三个原子提交：`8f97822` fix(tools) 临时脚本归位与路径修正、`2471d6a` feat(web) galaxy 语言包 50 键、`b87daae` docs 交接档校正 + 本计划 | ✅ | 2026-09-27 |
| TASK-002 | 跑 `python tools/check_all.py` 确认提交后仍退出码 0 | ✅ | 2026-09-27 |

阶段出口判据：`git status --porcelain` 仅剩预期改动；`tools/check_all.py` 退出码 0。

### Implementation Phase 1：Galaxy 页收口

- GOAL-002: 消费已就位的 50 个 `galaxy.*` 键，Galaxy 页非注释中文行数归零。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-003 | `web/src/pages/Galaxy.tsx` 按 PAT-001 接入 `useLocale`，逐处替换 41 行非注释中文为 `t('galaxy.*')`。原 50 键只覆盖面板骨架，实战暴露 28 处缺口（情报格 13、目标属性 8、图例/视图 7），已按 CON-002 同步补进 zh/en 两侧 | ✅ | 2026-09-27 |
| TASK-004 | 保留 `galaxy.detected` 的 `{n}` 插值用法（键已定义，zh=`探测到 {n} 支移动舰队`，en=`{n} moving fleets detected`）。机械校验 73 个 t() 用键在两侧均存在，占位符无错配 | ✅ | 2026-09-27 |
| TASK-005 | 验证：`tsc -b` 零错 → vitest 113 → `build`（PWA 产物生成）→ Galaxy 非注释中文 = 0 → 七门禁退出码 0 | ✅ | 2026-09-27 |

阶段出口判据：Galaxy 页无非注释中文；`tools/check_all.py` 退出码 0；`git commit -m "feat(web): i18n 批次 D-D2——星系页（Galaxy）t() 化"`。

### Implementation Phase 2：批次 D 剩余 6 页

- GOAL-003: 完成批次 D 收尾，8 页全部 t() 化。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-006 | `Fleet.tsx`：27 行非注释中文。该页已有 `TYPE_LABEL` 常量（出现 6 次），任务类型标签直接搬键为 `t('fleet.*')`。实际落地 57 个新键，模块常量改为 `TYPE_KEY` 键映射由 `typeLabel()` 解析 | ✅ | 2026-09-27 |
| TASK-007 | `Reports.tsx`：27 行非注释中文。该页无 `TYPE_LABEL`，需就地定义键映射。实做 24 键后剩 15 行，均为双语副标设计（符合 CON-004） | ✅ | 2026-09-28 |
| TASK-008 | `Achievements.tsx`：23 行 | | |
| TASK-009 | `Campaign.tsx`：22 行 → 0 残留。战役数据（stage.name / stage.desc）属游戏数据，随术语层处理 | ✅ | 2026-09-27 |
| TASK-010 | `Codex.tsx`：23 行 → 0 残留。CATEGORY_META 的 label 改 key、archiveCopy 改键表、reqName/archiveCopy 签名补 `t` 参数 | ✅ | 2026-09-27 |
| TASK-011 | `Officers.tsx`：13 行 | | |
| TASK-012 | `Highscore.tsx`：10 行 | | |
| TASK-013 | 收口复查：`Research.tsx:24` 的 `unlocked()` 返回纯中文 `'已解锁'/'未解锁'`，而 `research.unlocked` 键已存在——改为 `t('research.unlocked')` 形态消除该残留。其余 20+ 条科技效果行模板句（`Research.tsx:31-57`）按原计划留 1.2.0，本轮不动 | | |
| TASK-014 | 全量复查：对 `web/src/pages/*.tsx` 重跑非注释中文行数统计，8 页目标页全部为 0 | | |

阶段出口判据：批次 D 的 8 个目标页非注释中文均为 0；每页各自跑过 GUD-001 四项；`tools/check_all.py` 退出码 0。允许残留的只有 CON-004 的双语副标与 TASK-013 显式豁免的效果行。

### Implementation Phase 3：术语层

- GOAL-004: 补 `nameEn` 与 `term()` 通道，消除 EN 下舰名/科技名/建筑名/防御名显示中文。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-015 | `web/src/game/objects.ts` 四表追加 `nameEn`，共 57 处：SHIPS 16、BUILDINGS 18、DEFENSES 10、TECHS 13。`name` 原值按 CON-005 保持中文不变。OFFICERS 5 处与 SPEED 1 处本轮不纳入 | | |
| TASK-016 | `web/src/game/i18n.ts` 新增 `term(id: number, table: 'ships' \| 'buildings' \| 'defenses' \| 'techs')`：zh 返回 `name`，en 返回 `nameEn`，缺 `nameEn` 时回退 `name`（复用 `i18n.ts:55` 的三级回退语义）。`useLocale()` 返回值增加 `term` | | |
| TASK-017 | 接入 5 处调用点：Shipyard 目录、Galaxy 态势图、Reports 编制行、战报回放图例、模拟器舰种表 | | |
| TASK-018 | 验证：EN 模式实机确认四类术语显示英文；`tsc -b` 零错；vitest 113 | | |

阶段出口判据：EN 模式下 57 条术语全部有英文显示或明确回退；`tools/check_all.py` 退出码 0。

### Implementation Phase 4：发布工程

- GOAL-005: 版本号切 1.0.0、更新清单链路可用、生产 env 模板完整。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | `web/package.json` 的 `version` 由 `0.3.0` 改为 `1.0.0`。按 REQ-002 只改这一处，随后 build 并确认三个展示点显示 1.0.0 | | |
| TASK-020 | 新建 `web/.env.example`，写入 `VITE_VERSION_MANIFEST_URL=`（空值 + 注释说明：形如 `{"version":"1.0.0","notes":"...","url":"..."}`，留空 = 离线模式不发请求）。该变量是 Vite 侧变量，消费点 `web/src/game/version.ts:22` | | |
| TASK-021 | `game-server/.env.example` 追加 `GM_KEY=`（空值 + 注释，见 SEC-001），紧邻末行 `GAME_AUTH_ENFORCED`。按 CON-006 保留该文件末行 CRLF | | |
| TASK-022 | 新建 `version-manifest.json` 样例（放 `web/public/`），并在 `doc/deploy.md` 增补一节登记 PWA 构建产物、`version-manifest.json` 托管位置与 `VITE_VERSION_MANIFEST_URL` 配置法 | | |
| TASK-023 | PWA 核对：确认 `dist/manifest.webmanifest` 生成、图标为 `favicon.svg`（`vite.config.ts:36-38`），起静态服务后「检查更新」返回 available；断网刷新验证存档不丢 | | |

阶段出口判据：三处版本展示均为 1.0.0；`checkForUpdate()` 返回 `mode: 'available'`；`game-server/.env.example` 含 `GM_KEY` 与 `GAME_AUTH_ENFORCED`；仓库内无 `GM_KEY` 明文值。

### Implementation Phase 5：存档兼容回归

- GOAL-006: 给迁移链补自动化测试，替代原计划中的一次性手工 smoke。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-024 | 新建 `web/src/game/__tests__/save-migration.test.ts`：造 v2、v3、v4、v5、v6 五档最小 fixture（结构参照 `web/src/game/state.ts` 的 `SlotFile`），逐档断言加载后 `saveVersion === 11` 且关键字段已补齐 | | |
| TASK-025 | 覆盖 v1 与 v12 边界：断言被 `state.ts:728` 的区间校验拒绝（`'存档版本不兼容'`） | | |
| TASK-026 | 手工 smoke：真实浏览器导入 5 个旧档各一次，确认载入成功且字段无损 | | |

阶段出口判据：新测试文件纳入 vitest 且总数由 113 上升；五档 fixture 全过；边界拒绝用例通过。

### Implementation Phase 6：QA 走查与打 tag

- GOAL-007: 完成发布定义要求的双语走查、移动端复查与真机烟测，P0/P1 清零后打 tag。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-027 | 双语全页走查：12 页 × zh/en 逐页截图共 24 张，存 `doc/outputs/`。中文残留 > 0 的页面按 P2 记录 | | |
| TASK-028 | 移动端 390px 复查：基地 / 建筑 / 科研 / 舰队 / 星系五主页面 | | |
| TASK-029 | 门禁复跑：`python tools/check_all.py` + `game-server` 的 phpunit SQLite 与 MariaDB 双库（`php -d memory_limit=1G vendor/phpunit/phpunit/phpunit -c phpunit-mariadb.xml`） | | |
| TASK-030 | 真机烟测：Edge 与 Chrome 正式浏览器直开 `dist`（非 preview server），注册 → 开局 → 10 分钟操作 → 关浏览器 → 重开续档 | | |
| TASK-031 | P0/P1 清零后打 `tag v1.0.0`，追加 `CODEX_HANDOFF.md` 交接段（按 GUD-003 置顶） | | |

阶段出口判据：24 张截图齐备且无 P0/P1；七门禁与 phpunit 双库全绿；真机烟测通过；`v1.0.0` tag 已创建。

## 3. Alternatives

- **ALT-001**: 先切版本号与发布工程，再做 i18n。放弃——版本号先行会让中途构建产物带上 1.0.0 标记却仍是半中文页面，QA 走查结论会被污染。
- **ALT-002**: 用脚本批量把 8 页中文替换为键。放弃——各页命名空间与键前缀需人工判断（如 `Fleet` 与 `Reports` 的任务类型标签语义不同），机械替换会产生错译；且 CON-002 的键对齐无法靠脚本保证正确性。
- **ALT-003**: 保留 8 页硬编码中文，仅靠「中文主标 + 英文副标」双语设计发布。放弃——不满足 REQ-001，且 `Research.tsx:28` 型纯中文串无英文副标可依附。
- **ALT-004**: 术语层用语言包扁平键（`term.ship.204`）而非 `nameEn` 字段。放弃——需为 57 条术语各占两行语言包条目，与 `objects.ts` 事实源脱钩，改数值/改表时易漂移。
- **ALT-005**: 存档兼容只做手工 smoke 不写测试。放弃——REQ-004 是发布定义条目，迁移链有 9 级分支且当前零测试覆盖，一次性 smoke 无法回归。
- **ALT-006**: 本计划整体延到 M2 服务器线同步之后一起做。放弃——M2 依赖 RC1 重导工具链，与 M1 无共享前置，合并只会推迟 1.0.0 且放大回归面。

## 4. Dependencies

- **DEP-001**: `web/src/game/i18n.ts` 的 `useLocale()` / `translate()` 契约——全部页面迁移任务依赖它，含三级回退（en → zh → key 本身）。
- **DEP-002**: `vite-plugin-pwa`（`web/package.json` 依赖）——REQ-003 与 TASK-023 的离线安装能力来源。
- **DEP-003**: `game-server` 的 `config/services.php:24`（`gm_key` 读取）与 `app/Http/Middleware/GmAuth.php:21`（比对）——TASK-021 的变量语义依据。
- **DEP-004**: MariaDB 10.11.11（用户级 3307）——TASK-029 的 phpunit 双库之一；该实例为本机既有环境，MariaDB 侧不可用时需先按 `doc/dev-env-setup.md` 恢复。
- **DEP-005**: `tools/check_all.py` 七门禁链（含 Rust `corpus-check` 需 cargo 在 PATH）——每个阶段的出口判据都依赖它。
- **DEP-006**: 上游参照克隆 `upstream-ogamex/`（tag 0.14.0，已 gitignore）——仅 `tools/ship_research_scan.py` 需要，缺失时该脚本按设计给出提示而非失败，不阻塞本计划任何阶段。

## 5. Files

- **FILE-001**: `web/src/pages/Galaxy.tsx` — 接入 `useLocale`，替换 41 行非注释中文（TASK-003）。
- **FILE-002**: `web/src/pages/{Fleet,Reports,Achievements,Campaign,Codex,Officers,Highscore}.tsx` — 批次 D 剩余 7 个目标页（TASK-006 至 TASK-012）。
- **FILE-003**: `web/src/game/locales/zh.ts` / `web/src/game/locales/en.ts` — 新增键必须两侧同时落，按 CON-002 逐键对齐。
- **FILE-004**: `web/src/game/objects.ts` — 四表追加 57 处 `nameEn`，`name` 原值不动（TASK-015）。
- **FILE-005**: `web/src/game/i18n.ts` — 新增 `term()` 通道并在 `useLocale()` 返回值暴露（TASK-016）。
- **FILE-006**: `web/src/game/version.ts` — 更新检查消费点，本次只作为 VITE 变量登记依据，不改逻辑（TASK-020）。
- **FILE-007**: `web/package.json` — `version` 0.3.0 → 1.0.0，唯一版本来源（TASK-019）。
- **FILE-008**: `web/vite.config.ts` — 版本 define 与 PWA manifest 配置的核对对象，本轮只读不改。
- **FILE-009**: `web/src/game/state.ts` — 存档迁移链（`saveVersion` 逐级迁移与区间校验），本轮只读，测试对象（TASK-024、TASK-025）。
- **FILE-010**: `game-server/.env.example` — 追加 `GM_KEY`，保留末行 CRLF（TASK-021）。
- **FILE-011**: `web/.env.example` — 新建，登记 `VITE_VERSION_MANIFEST_URL`（TASK-020）。
- **FILE-012**: `doc/deploy.md` — 增补 PWA 构建与更新清单托管说明（TASK-022）。
- **FILE-013**: `web/src/game/__tests__/save-migration.test.ts` — 新建迁移链测试（TASK-024）。
- **FILE-014**: `CODEX_HANDOFF.md` — 每批交接记录置顶追加（TASK-031）。
- **FILE-015**: `web/src/screens/{TitleScreen,SettingsScreen,PrivacyGate}.tsx` — 版本展示点，只读不改（REQ-002 约束对象）。
- **FILE-016**: `web/src/pages/Research.tsx` — `unlocked()` 残留修复（TASK-013）。

## 6. Testing

- **TEST-001**: 类型检查 `node node_modules/typescript/bin/tsc -b`（web 目录）——每页迁移后必跑，判据为零错。
- **TEST-002**: 前端单测 `node node_modules/vitest/vitest.mjs run`（web 目录）——基线 113 用例，Phase 5 后应上升。
- **TEST-003**: 构建 `vite build`——Phase 1 与 Phase 4 各跑一次，确认 PWA 产物与版本注入。
- **TEST-004**: 七门禁 `python tools/check_all.py`——每个阶段出口判据，判据为退出码 0。
- **TEST-005**: zh/en 键集机械比对——枚举两侧键名集合并断言相等，防 CON-002 的静默漏译；建议固化为 vitest 用例。Phase 1/2 已用临时脚本实跑：Galaxy 73 键、Fleet 54 键全部命中，占位符零错配；唯一偏差是 `menu.initResource`（有意）与 `build.colonySurface`（孤儿键）两个 zh-only 键。
- **TEST-006**: 存档迁移测试（`web/src/game/__tests__/save-migration.test.ts`）——五档 fixture 升到 v11 + v1/v12 边界拒绝（TASK-024、TASK-025）。
- **TEST-007**: 服务端单测 phpunit SQLite + MariaDB 双库——全绿为 Phase 6 出口条件（TASK-029）。
- **TEST-008**: 中文残留统计——对 `web/src/pages/*.tsx` 统计非注释中文行数，Phase 2 出口要求 8 页归零。
- **TEST-009**: 真机烟测脚本化不可行，保留为人工判据：正式浏览器直开 `dist`，覆盖注册、开局、10 分钟操作、关浏览器重开续档（TASK-030）。

## 7. Risks & Assumptions

- **RISK-001**: CON-002 的静默回退会让键不对齐的漏译在测试中不可见。Phase 1 已实证该风险真实——预置的 50 键漏了 28 处用户可见串。TEST-005 必须先于 Phase 2 落地，否则 7 页会重复同样的漏补。
- **RISK-007**: 语言包存在两个 zh-only 键：`menu.initResource`（i18n.test.ts 明确断言 en 缺失时回退 zh，属有意设计）与 `build.colonySurface`（全库无任何 `t()` 引用，属孤儿键）。后者建议在 Phase 2 复查时确认删除或补 en。
- **RISK-002**: `web/src/game/objects.ts` 追加 57 处 `nameEn` 是纯文本量最大的单任务，机械编辑易漏项或与 `name` 错位；建议按表分四次提交并在每表后跑 TEST-001。
- **RISK-003**: 术语层与批次 D 并行时，两边会同时改 Shipyard 与 Reports，存在同文件冲突。建议 Phase 2 完成后再进 Phase 3（串行），牺牲约半晚换取无冲突。
- **RISK-004**: Phase 4 改版本号后，任何中途构建都会产出标记 1.0.0 的半成品。若需回退，须同时回退 `web/package.json` 与已发布产物。
- **RISK-005**: MariaDB 实例为本机用户级服务（3307），若未运行则 TASK-029 的双库验证无法完成，Phase 6 出口条件不成立。
- **RISK-006**: 24 张截图与真机烟测是纯人工环节，缺乏可机械判据的替代；这是发布定义里唯一无法用脚本证明的条目。
- **ASSUMPTION-001**: 术语英译采用 OGame 官方英文命名（如 `research.unlocked` 已有英文对照可参照），不新造译名。
- **ASSUMPTION-002**: 「中文主标 + 英文副标」的双语视觉是既定设计而非待修债务，故 CON-004 保留、不计入残留。
- **ASSUMPTION-003**: 科技效果行 20+ 条模板句留 1.2.0 的决定维持不变，故 TASK-013 只修 `unlocked()` 一处。
- **ASSUMPTION-004**: 本机 PHP 8.3.35 与 cargo 均在 PATH（已实测），故七门禁与 phpunit 环节无环境阻塞。

## 8. Related Specifications / Further Reading

- `doc/release-plan-2026-09-27.md` — M1/M2/M3 里程碑定义与每晚节奏模板（本计划的来源，M1 出口条件以该文档为准）
- `doc/release-readiness-2026-09-23.md` — P0 已清证据与 P1/P2 分级清单
- `CODEX_HANDOFF.md` — 批次登记与决策留痕，最新段置顶
- `doc/governance/SOURCE-01-ogamex-audit-draft.md` — 上游 ogamex 0.14.0 参照出处
- `doc/dev-env-setup.md` — 环境搭建与上游克隆路径
