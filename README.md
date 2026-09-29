# 星际远征 SP（Stellar Expedition SP）

一款 OGame 式的太空策略游戏。**单机模式浏览器打开即玩**：不用注册、不用装服务端。
也可以连接内置服务端（`game-server/`）进行多人对战。

> 状态：**v1.0.0**。单机模式开箱可玩；服务端多人模式可跑通完整对局。

## 隐私

**默认零上报。** 代码里没有任何统计、广告、遥测或默认的错误上报——
`web/src/game/` 下唯一的三处网络调用都是**你主动触发或主动配置后**才发生的：

| 调用 | 何时发生 |
|---|---|
| 云备份 / 恢复 | 你自己填写 WebDAV 地址并点击后 |
| 错误日志上报 | 你在设置里主动填写上报地址后（不填就不发） |
| 版本更新检查 | 仅当你配置了更新清单并手动点击时 |

单机模式的数据只存在浏览器 `localStorage`，不上传任何服务器。
不填上述配置时，全程没有任何网络请求。

---

## 特性

**经济** — 13 类行星设施 + 3 类月面设施（月球基地 / 传感器阵列 / 跳跃门）；
金属/晶体/重氢三资源；电力供需与减产；仓容封顶；矿脉储量（会耗尽，需另找矿源）。

**军事** — 15 种舰船、10 种防御设施；速射表；残骸回收；星际导弹；战斗回放（逐轮可复算）。

**探索** — 星系扫描、间谍与反侦察、远征、殖民、月球开发（含随机凝聚）。

**其它** — 15 步新手教程、成就、军官系统、指挥官、战役关卡（含精英线）、排行榜、术语图鉴。

**技术** — 中英双语（零依赖语言包）、PWA 离线可玩、Service Worker 自动更新、
存档 v2→v11 迁移链、内置八道质量闸。

---

## 快速开始（单人模式）

需要 **Node.js 22.12+ 或 24+**（`vitest 5` 的 engines 要求；`vite 8` 要求 ≥20.19）。
低于此版本 `npm test` 无法运行。

```bash
cd web
npm install
npm run dev          # 开发服务器
```

构建与预览：

```bash
npm run build        # tsc -b && vite build，产物在 web/dist
npm run preview      # 本地预览构建产物
```

`web/dist` 是**纯静态目录**，可直接用任意静态服务器托管。
单机模式的数据只存在浏览器 `localStorage`——换浏览器或清缓存即丢失（服务端模式除外，
它存在你自己的服务器上）。

---

## 服务端（可选，用于多人）

需要 **PHP 8.2+**（8.3 已验证）、Composer，以及 **PHP FFI 扩展**（战斗内核通过 FFI 加载，
标准 PHP 发行版通常已带；缺失时战斗相关测试会报「Rust 战斗库不存在」）。
数据库默认 SQLite，开箱即用。

```bash
cd game-server
composer install                # 顺带补齐 storage/framework/* 目录（见下方说明）
cp .env.example .env            # Windows: Copy-Item .env.example .env
php artisan key:generate        # 生成 APP_KEY
# 再自行给 GM_KEY 拟一个长随机串填进 .env（不填则 GM 接口禁用）

php artisan migrate --force     # 建表
php artisan game:seed-dev-ruleset   # ⚠ 必须：装配规则集，否则开不出文明
php artisan serve --port=8099
```

`game:seed-dev-ruleset` **不能省**——`bootstrap-player` 在没有 frozen 规则集时
会直接报「服务器无 frozen 规则集」退出。

`composer install` 之后 `storage/framework/{views,cache/data,sessions}` 会被自动创建。
这些目录被 `.gitignore` 排除（git 不跟踪空目录），**缺了会导致每个请求 500**
（`Please provide a valid cache path`）。若手工跳过 composer，手动补建：

```bash
mkdir -p storage/framework/{views,cache/data,sessions}     # Windows: New-Item -ItemType Directory -Force storage\framework\views,storage\framework\cache\data,storage\framework\sessions
```

### 战斗内核（Rust）

战斗结算由 `game-server/combat/` 下的 Rust cdylib 通过 FFI 提供，属于**构建产物**
（不入库）。要跑通战斗相关测试与实战，需先构建：

```bash
cargo build --release --manifest-path game-server/combat/Cargo.toml
```

未构建时，战斗类测试会报「Rust 战斗库不存在」；其余功能不受影响。

### 首次开档

```bash
php artisan game:bootstrap-player 1     # 创建文明 1 与母星（注意：必须带 owner_id 参数）
php artisan game:issue-token 1          # 签发令牌，同样必须带 owner_id
```

拿到令牌后，在前端「主菜单 → 服务器模式」填入服务地址（默认 `http://127.0.0.1:8099`）与令牌。
查询状态用 `GET /api/v1/state?owner_id=1`（该接口**必须**带 `owner_id` 查询参数，缺参返回 422）。

启动 worker（**资源产出与任务结算依赖它，不跑则世界静止**）：

```bash
php artisan schedule:work
```

前端在「主菜单 → 服务器模式」里填入服务地址与令牌即可连入。

常用 artisan 命令：

| 命令 | 作用 |
|---|---|
| `game:bootstrap-player` | 开一个文明与母星（开发/测试用） |
| `game:issue-token` | 签发 API 访问令牌 |
| `game:gm resources|level` | GM 后台（需 `X-GM-Key`） |
| `game:audit` | 运行时完整性与守恒审计 |
| `game:process-production` | 推进全部星球资源产出 |
| `game:process-builds / due / fleets` | 结算到期建造/研究造船/舰队 |
| `game:seed-dev-ruleset` | 装配开发库规则集 |

---

## 质量闸

```bash
python tools/check_all.py     # 八道闸一次跑完
```

| 闸 | 内容 |
|---|---|
| 公式真值 | F-01~F-07 公式断言 |
| RC1 配置校验 | 规则集结构完整性 |
| RC1 冻结 hash 纪律 | 篡改冻结配置必须被拦下 |
| 战斗语料 | 11 例战斗黄金语料 |
| SIM 骨架回归 | 模拟器基线逐位一致 |
| PHP 括号配平 | 全部手写 PHP 文件 |
| 前端测试 | vitest 全量（含战斗对拍） |
| Rust 语料对拍 | 战斗引擎与语料一致 |

单独跑：

```bash
cd web && npm test                          # vitest
cd game-server && vendor\bin\phpunit.bat    # 服务端测试
```

> 这些门禁历史上出现过 7 次「假绿」（断言写了但抓不住缺陷，或反过来只会永远变绿）。
> 新增关键断言应通过变异验证：恢复旧缺陷时应能转红。

---

## 架构

```
web/            前端（React 19 + TypeScript + Vite + Tailwind + zustand）
game-server/    服务端（PHP / Laravel 风格分层 + SQLite|MariaDB）
config/         规则集（balance_rc1.json 为冻结的平衡数据源）
sim/            模拟与仿真（Python）
tools/          质量闸与对账脚本
doc/            设计与治理文档
internal/       战斗内核（Go）
```

**两套实现**：单人模式全部在前端（`web/src/game/`），服务端是独立的第二套。
两端的前置/造价口径目前以 RC1 规则集为准，前端 `objects.ts` 保留了一份静态近似。

---

## 贡献

欢迎提 issue 与 PR。改动前请先跑一遍 `tools/check_all.py`——
本项目对「门禁假绿」零容忍：新增断言必须做**变异验证**
（把修复点改回缺陷形态，确认门禁转红，再还原），否则不算完成。

开发约定与历史决策见 `doc/governance/`。

---

## 许可

本项目源码与原创素材以 [MIT License](LICENSE) 发布。第三方依赖保留各自许可；
OGame 名称及其相关商标属于原权利人，本项目与其无官方关联。

---

## 第三方

玩法与数值参考了经典 OGame（Browserling / Gameforge）的公开机制设计，
本项目为**独立实现**，未包含任何第三方源码或素材。
仓库内的设计稿与美术资源为原创。
