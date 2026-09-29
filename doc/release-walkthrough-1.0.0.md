# 1.0.0 发布验收清单（p16-b / p16-c / p16-d）

> 依据：`doc/release-plan-2026-09-27.md` 的 M1.4，计划见 `plan/process-release-cut-1.0.0.md`。
> 本清单把「已由自动化验证」与「必须人工」分开，避免重复劳动。

## 0. 环境准备

### 0.0 先读这条：Service Worker 会缓存旧包（2026-09-28 实测）

**症状**：改了代码、`npm run build` 也跑了、preview 也重启了、页面也 reload 了，
但界面纹丝不动，network 面板里请求的仍是历史 hash 文件
（实测拿到 `index-vvKbIQhG.js`，而磁盘上早已是 `index-BPLpxMbq.js`）。

**根因**：vite-plugin-pwa 生成的 Service Worker 缓存了 precache 清单里的旧 bundle。
`devOptions.enabled=false` 只让 `vite dev` 不注册新 SW，**不解除已有 SW 对页面的控制**。

**三条正确做法**（已落地，回归测试 `sw-cache.test.ts` 守着）：

| 场景 | 做法 |
|---|---|
| 日常开发 | 用 **5180 dev server**（`vite --port 5180`），不注册 SW，源码改动即时生效 |
| preview 验证新构建 | 网址加 `?nosw=1`，如 `http://127.0.0.1:4173/?nosw=1`，会注销 SW 并清 CacheStorage |
| 确认到底加载了哪版 | 看 network 面板请求的 `index-*.js` hash，与 `dist/assets/` 下实际文件比对 |

**不要**用「重启 preview 服务」当作清缓存手段——它对 SW 缓存无效。

### 0.1 环境准备

```bash
# 1) 构建产物（务必重新构建——dist 容易被后续提交落下）
cd web && npm run build            # 期望：exit 0，生成 dist/sw.js 与 dist/manifest.webmanifest

# 2) 起静态服务（不要用 vite preview 的 SPA fallback 之外的行为；真机烟测要直开 dist）
cd web && npx vite preview --port 4173
# 或用任意静态服务器托管 dist/，并配置 SPA fallback

# 3) 门禁（应全绿，缺一不可）
python tools/check_all.py                                        # 七门禁，退出码 0
cd web && npx vitest run                                         # 31 文件 244 用例
cd game-server && php -d memory_limit=1G vendor/phpunit/phpunit/phpunit          # SQLite  87/502
php -d memory_limit=1G vendor/phpunit/phpunit/phpunit -c phpunit-mariadb.xml     # MariaDB 87/502
# MariaDB 需先手工拉起：
#   mysqld --datadir="<MARIADB_HOME>\data" --port=3307 --bind-address=127.0.0.1
```

## 1. 自动化已验证（无需重做）
| 项 | 证据 |
|---|---|
| 版本号注入 | 构建产物含 `1.0.0`；隐私门与标题页 DOM 文本均显示 `v1.0.0` |
| 隐私门 | 5 段声明全部渲染，按钮为「同意并进入游戏」 |
| 标题页 | 「奥新游戏」/「A HIGHER HUMANITY · 星际战略」/「进入游戏」/ 版本行；按钮渲染出中文而非键名 `title.enter`，证明键正确 |
| 更新清单 | `dist/version-manifest.json` 为 `1.0.0`；`web/.env.example` 与 `doc/deploy.md` 4.2 节已登记 |
| 语言包完整性 | zh 926+ / en 925+，`only_en` 为空；契约测试 5 条不变量全绿（键集对齐、无空值、占位符一致、引用键全可解析、无孤儿键） |
| 未翻译扫描 | 严格口径（剔除 `t()` 后仍含 ≥1 个汉字、不做副标过滤）复查：剩余 33 行全部为下表「已接受残留」 |
| 试玩 UI 修复 | `ui-fix-render.test.ts` 12 条 SSR 断言：12 页标题条全覆盖、EN 标题无中文残留、研究队列空槽与在研槽结构一致、船坞默认舰船标签、舰队页造船出口、建筑/研究分类名走 i18n。**已做变异测试验证鉴别力**（删空槽进度槽 / 改 GameScreen 传参均被精确捕获） |
| 三类队列容量 | `slot-constants.test.ts` 7 条：BUILD/SHIP/RESEARCH_SLOTS 单一来源 + 行为级「科研最多排 2 项」 |
| 建筑存档迁移 | `build-queue-slots.test.ts` 12 条，含「预约扣费口径 == 迁移退款口径」三条不变量（有队列占用 / 多建筑混排 / 队列为空） |
| Service Worker | `sw-cache.test.ts` 8 条：dev 不注册、DEV 下主动注销、CacheStorage 清理、`?nosw=1` 逃生参数 |
| 数值对账 | `verify_rc1_vs_objects.py` 三维度（代码↔经典 / 代码↔RC1 / RC1↔经典）13 项已登记差异，exit 0 |
| F-08 一致性 | `verify_f08_vs_impl.py` exit 0（F-08 已降级 Candidate，差距仅作报告） |
| 新手保护完整性 | `combat-missions.test.ts` 源码守卫：`grep originId: -1` 仅 2 个 `npcOwned` 产出点，断言每个产出点条件均含 `isNewbieShieldActive`。**变异验证：删掉任一守卫即失败并指出行号** |
| 海盗事件保护 | `npc-officer-paths.test.ts` 把 `gameNow` 钉到已探明种子（roll 0.2173 落在海盗区间）+ 保护期外仍触发的反向用例。**变异验证：漏洞版本失败并报出母星 `1:8:3`** |
| 离线补算 | `offline-settle.test.ts` 4 条。断言对象已避开随机事件污染：盯残骸场与 `totalDebris`（非全资源总额），盯目标殖民地（非常驻星球金属）。**变异验证 + 连跑 6 轮全绿** |
| 双语结构走查 | `i18n-gallery-report.test.ts` 生成 `web/test/gallery/i18n-gallery-report.md`（12 页 × zh/en SSR 结构化报告）。**注意：这是 SSR 结构证据，不替代第 2 节的 24 张真机截图** |

> ⚠️ 门禁总数 24 项（含 2 个 Python 校验脚本）。上述多条均做过**变异测试**——
> 先确认「回退修复后该门禁确实失败」，再认为它有鉴别力。本轮已由此推翻两条
> 看似有效的门禁：`npc-officer-paths` 原「新开局不会被骚扰」在漏洞版本上 10/10 通过，
> `combat-missions` 原「打赢后无反击」在漏洞版本上 8/8 通过（概率路径不可靠）。

## 2. 双语全页走查（12 页 × zh/en = 24 张截图）

每页切到 zh 与 en 各截一张，存 `doc/outputs/`。**EN 模式下重点看这些位置**——它们是本轮刚接线的，也是最容易漏译的地方：

| 页 | 重点复核（EN 模式下不应出现中文） |
|---|---|
| Overview 基地 | 12 条场景统计（Metal output / Current level / Cost for this level / Research level cap / Research time / Research threads / Manufacturing level / Active ships / Scan coverage / Deuterium output / Power output）、升级成本三行、当前产能提示、放弃殖民地确认语 |
| Buildings 建筑 | 11 条统计标签、矿脉告急、电力缺口与修复提示、升级收益说明、满级提示、建造队列「候」/「枚」单位、空间标签（月面/星球） |
| Shipyard 船坞 | 蓝图依赖关系、建造上限/研究解锁指引、材料行 |
| Research 科研 | **20 条科技效果行**（`research.effect.*`）、科技名显示英文（`translateTerm`）、解锁状态 unlocked/locked |
| Galaxy 星系 | 情报格（舰队/防御计数与未知态、编制、库存、探测器损失）、目标属性（穹顶/轨道/月球/护盾）、三类目标说明、残骸行 |
| Fleet 舰队 | 8 类任务类型 + 8 条任务描述、三步骤、距离/飞行/跳跃门/燃料/货仓、货载汇总 |
| Campaign 战役 | 交战规则两态、战区/关卡/模式标签、敌方编制、奖励、部署弹窗 |
| Codex 档案库 | 4 个分类、4 段描述、建造/研究倍率、最高等级、属性标签、基础消耗、解锁需求 |
| DetailDialog 详情 | **47 条描述**（建筑/科技/舰船/防御），所有字段标签与两个按钮 |
| Reports 战报 | 情报时间线（Live sync / Threat marker）、战斗/侦察/导弹/远征四类面板**全部字段标签**、结果三态、编队/摧毁/收编列表 |
| Achievements 成就 | **19 项进度串**（含单字单位：枚/笔/位/次/座/颗/关） |
| Officers / Highscore | 军官网络面板、排行「你（指挥官）」与「{n} 星球」 |

判据：EN 模式下每处显示英文；发现中文残留记 P2，`translate('ns.key')` 式的**裸键名**直接记 P1。

> 走查前可先跑 `npx vitest run src/game/__tests__/page-render.test.ts`：它把 12 页
> 在 EN 下渲染一遍并列出所有中文残留，命中位置就是下面这张表。已干净的两页
> （Fleet / Reports）是硬断言，出现回退会直接失败。

## 3. 移动端 390px 复查

基地 / 建筑 / 科研 / 舰队 / 星系 五主页面。检查：底栏抽屉可展开、星球场景可拖动缩放、面板不横向溢出、按钮触摸区 ≥ 44px。

## 4. 真机烟测（Edge + Chrome 正式浏览器，直开 dist，非 preview server 的 dev 模式）

> 第 5、6 两步（游戏循环与存档往返）的**逻辑半已自动化**：`web/src/game/__tests__/release-smoke.test.ts`
> 7 条用例已覆盖开局→按依赖链建造→研究→造舰派遣→存档→读档→继续推进，并验证读档后
> 建筑等级/舰船/科技/游戏时钟/资源全部恢复。下面只需补人工的那一半：真实浏览器持久化与界面。

1. 隐私门 → 同意并进入
2. 标题页点「进入游戏」→ **若此处点不动，按下面第 4.1 节判定，别直接跳到"环境问题"**
3. 注册账号（本地浏览器档案，非真实凭据）
4. 新游戏 → 开局
5. 玩 10 分钟：升一次建筑、起一次研究、造一艘船、打开舰队/星系/战报各一次
6. **关掉浏览器 → 重开 → 载入存档**，确认进度完整（逻辑侧已有自动化覆盖，这里验的是 localStorage 在真实浏览器重启后的存活）
7. 切 EN 复看主路径

## 4.1 若「进入游戏」点不动：10 秒定性

应用内置了本机错误日志（`设置 → 错误日志`，可导出）。**这是区分「产品缺陷」与「自动化环境限制」的决定性一步**：

- **错误日志非空** → handler 真的抛异常了，是**产品缺陷，记 P1**，导出日志附在缺陷单里
- **错误日志为空** → handler 没抛异常也没执行，属事件未送达

为什么日志为空即可判环境：全局错误监听器只做记录、**不调用 `preventDefault()`**，所以真抛了异常浏览器仍会打到 console（自动化实测 console 0 条目），且该错误会同时进本机日志。两者都无输出 ⇒ handler 没有抛错路径。

已排除的产品侧机制（勿重复排查）：

| 机制 | 结论 |
|---|---|
| 装饰层遮挡 | `.nova-entry-screen::before` 是 `z-index: -1`，在内容之下；toast 宿主带 `pointer-events-none` |
| `sfx()` 抛错阻断 `onEnter()` | 标题页尚无账号会话，`currentProfile()` 必返回 `null`，`sfx` 首行即 return |
| 接线错误 | 线上 bundle 静态核对：`onClick={sfx → onEnter}` 与 `App.tsx` 的 `phase==='title' → setPhase('profile')` 均正确；`ProfileScreen` 无回跳逻辑 |
| 构建过期 | 已在最新 dist 上复测，结论不变 |
| 事件未送达 | 指针 click 与键盘 Enter 两条不同路径均无效；唯一生效的是隐私门按钮的 `location.reload()`（原生整页导航，不经 React 委派） |

## 5. 已知接受项与**已知缺口**（不作为本次阻塞，但要登记）

### 5.1 已确认保留（双语主副标设计）

`Buildings.tsx` 分类名 6 处、`Overview.tsx` 建筑箴言与场景链接、`Research.tsx` 科技分类、
`Codex.tsx` 分类 —— 中文主标 + `<small>EN</small>` 副标并存，是经确认保留的设计。

### 5.2 EN 渲染残留：**已清零**（原为 687 处）

`page-render.test.ts` 用 `react-dom/server` 渲染 12 页并断言 EN 输出无中文。
这轮发现的残留已全部处理，分四类：

| 类别 | 处理方式 |
|---|---|
| 术语仍走 `def.name` | 14 处改走 `term()` / `findTerm()` |
| 时长单位写死中文 | 新增 `formatDuration()`（i18n 层），17 处调用点替换 |
| 游戏数据本身中文 | 成就 19 项、关卡 16 个、军官 5 位补 `nameEn`/`descEn`/`hintEn`（接口必填，漏译编译期暴露）；星球名走 `translatePlanetName()` 映射 |
| 零散文案 | 教程 15 步补 `titleEn`/`hintEn`；Overview 的星球名与 aria 改走翻译 |

现在 12 页的断言分三层：

- **硬断言**（8 页：Fleet / Reports / Shipyard / Codex / Galaxy / Achievements / Officers / Highscore）——零容忍中文，出现即失败
- **白名单断言**（3 页：Buildings / Research / Campaign）——只允许分类名、产量标签、文明核心这些**经确认保留的双语副标**；新漏译仍会失败
- `it.fails` 债务标记：保留 1 条作为回归哨兵

### 5.3 其他有意项

- **C 类运维后台 113 行**：`ServerScreen.tsx` 75 行 + `GmScreen.tsx` 38 行保持中文。单机版 1.0.0 玩家走不到；发布服务器线或开放运营前须先补。
- **`menu.initResource` 缺 en 键**：有意为之，`i18n.test.ts` 明确断言 en 缺失时回退 zh。

## 6. 打 tag

P0/P1 清零后：

```bash
git tag -a v1.0.0 -m "Release 1.0.0：单机线 zh/en 双语 + 矿脉与 NPC + 战役与档案库"
```

打 tag 前确认：① 工作树干净 ② `git log --oneline -1` 是本轮最后一个提交 ③ 七门禁与 phpunit 双库在**当前 HEAD** 上复跑过。
