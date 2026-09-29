# 部署指南（Deploy）v0.1 · 2026-09-23

> 适用：game-server（Laravel 12 + PHP 8.2+）+ web PWA（静态构建）+ Rust 战斗库（cdylib）。
> 环境分层：dev（本机 SQLite + artisan serve + vite dev）/ staging / production（MariaDB + Nginx/FPM）。

## 0. 前置清单

| 件 | 要求 | 备注 |
|---|---|---|
| PHP | ≥8.2，扩展 curl/ffi/mbstring/openssl/pdo_sqlite/sqlite3/pdo_mysql/intl/zip | FFI 供战斗库 |
| Composer | 2.x | |
| Rust | stable（构建 cdylib；服务器可本地构建后只分发 dll/so） | `cargo build --release` |
| MariaDB | 10.6+（生产） | dev/staging 可 SQLite |
| Web 服务器 | Nginx + PHP-FPM（生产） | dev 用 artisan serve |

## 1. game-server 部署步骤

```bash
# 1) 依赖
composer install --no-dev --optimize-autoloader

# 2) 战斗库（release 构建；或从构建机拷贝 combat/target/release/ogame_battle.dll|so）
cd combat && cargo build --release && cd ..

# 3) 环境配置（生产关键项）
cp .env.example .env
#   APP_ENV=production  APP_DEBUG=false
#   DB_CONNECTION=mysql  DB_HOST/DATABASE/USERNAME/PASSWORD=...
#   GAME_AUTH_ENFORCED=true          # 鉴权强制（勿关）
#   COMBAT_LIBRARY_PATH=<绝对路径>/ogame_battle.dll  # Linux 用 libogame_battle.so，macOS 用 libogame_battle.dylib
php artisan key:generate

# 4) 数据库
php artisan migrate --force

# 5) 规则集（生产唯一合法路径）
#   所有者批准 CR → 回填 config/rulesets/balance_rc1.json → 重导 hash 入库为 frozen。
#   （game:seed-dev-ruleset 仅限 dev/staging，勿在生产使用。）

# 6) 权限
php artisan storage:link（如用得上）；storage/ 与 bootstrap/cache 可写。
```

## 2. 常驻进程（Worker 调度）

事件推进依赖调度器（routes/console.php 已注册三 Worker + AI tick）：

- **Linux/cron**：`* * * * * cd <path> && php artisan schedule:run >> /dev/null 2>&1`
- **Windows/任务计划**：每分钟执行 `php artisan schedule:run`
- 或 supervisor 守护 `php artisan schedule:work`

## 3. 监控（P1-9）

- **完整性审计（已内建）**：`php artisan game:audit`——库存非负/任务槽守恒/研究锁一致/建造单执行/卡死命令/残骸非负；建议 cron 每 5-10 分钟跑一次，退出码 1 即告警。
- Laravel 日志：`storage/logs/laravel.log`（错误聚合接入按需）。
- 告警通道：接入现有运维（邮件/webhook）时包装 game:audit 退出码即可。

## 4. web PWA 部署

```bash
cd web && npm install && npm run build   # 产物 dist/
# Nginx 托管 dist/（SPA fallback：try_files $uri /index.html）
# 服务器模式连接地址指向 game-server 域名（HTTPS 下须同源或 CORS 放行）
```

### 4.1 版本号（单点注入，勿在代码里硬编码）

`web/package.json` 的 `version` 是唯一来源：`vite.config.ts` 读取后 define 为
`__APP_VERSION__` → `web/src/game/version.ts` 消费 → 由标题页、设置页、隐私门
三处展示。发布新版本只改 `web/package.json` 一处并重新 build。

### 4.2 更新清单（G3）

`web/src/game/version.ts` 的 `checkForUpdate()` 读取可选环境变量
`VITE_VERSION_MANIFEST_URL`（模板见 `web/.env.example`）：

- 变量留空 = **离线分发模式**，只展示当前版本，不发任何网络请求（与隐私声明一致）。
- 变量有值 = `fetch` 该地址，接受单个 JSON 对象：
  `{ "version": "1.0.1", "notes": "修复舰队编队显示", "url": "https://.../v1.0.1/" }`
  返回 `mode: 'available'` 时设置页展示「发现新版本」。

样例清单见 `doc/version-manifest.sample.json`。**刻意不放在 `web/public/`**——
那会被复制进 `dist/` 随产物发布，其中占位的 example.com 链接会成为死链。
需要本地验证更新流程时，把它复制到 `dist/version-manifest.json` 再托管即可。发新版流程：改 `package.json` 版本 → build → 用新版本号与
`notes` 覆盖托管的清单 → 客户端下次「检查更新」即命中。

> **清单必须绕过 Service Worker 缓存**：`version-manifest.json` 刻意不在
> `vite-plugin-pwa` 的 precache 清单内（build 日志 precache 7 条不含它）。
> 这是对的——一旦被预缓存，SW 会把旧清单直接喂给客户端，更新检查永远命中
> `up-to-date`。托管时务必对该路径单独设 `Cache-Control: no-cache`，
> 否则改了清单也不生效。

## 5. 玩家开通流程

```bash
php artisan game:bootstrap-player <owner_id>        # 开档（经典自动选址）
php artisan game:issue-token <owner_id>             # 签发访问令牌（明文只显示一次，交予玩家）
```

令牌轮换：重跑 `game:issue-token`（旧令牌立即作废）。当前令牌无 TTL（长期凭证）——泄露即轮换。

## 6. 备份与回滚

- **备份**：MariaDB 例行 dump（含 15+ 张状态表）；`config/rulesets/` 与 CR 文档入 git。
- **回滚**：代码回滚 = git checkout 上一 tag + `composer install` +（迁移回滚谨慎——状态表含玩家资产，优先前滚修复）；配置回滚 = 重新入库上一 frozen 规则集版本（game_rulesets 保留历史行）。

## 7. 安全要点

- `GAME_AUTH_ENFORCED=true`（默认）；API 限流 60/min/IP（routes/api.php）。
- `.env`、`*.sqlite`、令牌不入 git（.gitignore 已覆盖）。
- HTTPS 终止在 Nginx；PHP-FPM 仅监听内网/Unix socket。

## 8. 已知边界（登记）

- 令牌无 TTL/无刷新机制（泄露靠轮换处置）——Post-MVP 可加过期+刷新。
- 生产规则集必须走 CR 正式回填（当前 RC1 仍 TBD，dev_seed 不得用于生产）。
- MariaDB 语义级验证已完成（2026-09-23，便携 10.11.11@3307）：21 表原生迁移 + 全套 58 测试双库同绿；回归入口 `phpunit -c phpunit-mariadb.xml`（本机拉起 mysqld 后跑）。
