# DEV-ENV-SETUP：开发环境搭建（E0-c 两路径）v0.1

> 状态：Draft · 2026-09-22 · 本机实测基线：**无 PHP / Composer / Rust / Docker**；node 与 Python（受管运行时）可用。
> E0-c 未拍板前两条路径都备好；拍板后按对应章节机械执行。所有安装命令需在所有者确认后执行（本清单只登记，不代装）。

## 路径 ① Docker Desktop（推荐：与上游一体化）

上游 `lanedirt/OGameX` 0.14.0 自带 docker-compose（PHP/Laravel + MariaDB + 队列），审计/开发/测试同环境。

1. 安装 Docker Desktop for Windows（启用 WSL2 后端）。
2. `git clone` 上游至 `E:\Ogame\upstream-ogamex`（已存在浅克隆 0.14.0，SHA `768b0172…f894`；如需完整历史则 `git fetch --unshallow`）。
3. 按上游 README 起 compose；首次构建拉镜像约 2~4 GB。
4. 验收：`docker compose exec app php artisan --version` 输出版本；`php artisan test` 跑上游测试基线。
5. 注意：Windows 挂载卷下 dev 模式较慢，可用 prod 模式构建（E0-c 卡片已登记）。

## 路径 ② 原生三件套（Windows 直装）

1. **PHP 8.x**（≥8.2，Laravel 12 要求）：官网 zip 解压至 `C:\php`，加 PATH；启用扩展 `pdo_mysql mbstring openssl curl intl bcmath`。
2. **Composer** 2.x：安装器直装，验收 `composer --version`。
3. **Rust** stable（rustup）：验收 `cargo --version`；战斗模块 `cargo build --release`。
4. **MariaDB 10.6+**：官方 MSI；建库 `ogame`（utf8mb4），验收 `mysql -e "SELECT VERSION()"`。
5. Laravel 工程：`composer create-project laravel/laravel` 或在上游 OGameX 基础上适配（E0-a/b 拍板后定）。

## 共同验收（无论哪条路径）

| 检查 | 命令 | 通过标准 |
|---|---|---|
| PHP | `php -v` | ≥8.2 |
| 迁移 | 跑 E1-S0 迁移 | 14 表建立，与 `doc/db-schema-draft.sql` 一致 |
| 配置闸门 | 启动时加载 ruleset | 缺 hash / 含 TBD → 拒绝启动 |
| 战斗 FFI | `cargo test` + 语料回放 | G-000 等 11 例逐位一致 |
| 测试 | PHPUnit | S1 起每切片验收钩子全绿 |

## 未就位前的编码纪律

环境未装好之前：只写可静态检查的代码（迁移、模型、契约实现），回复中如实标注「未运行验证」；
严禁把未运行的代码描述为"已跑通"。node 可用的部分（PWA 静态原型、工具脚本）照常运行验证。
