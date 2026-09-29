# game-server（E1-S0 骨架）

新OGame MVP 游戏服。技术路线：V1.3 §13（PHP 8.2+ / Laravel 12 / MariaDB 10.6+ / Rust 战斗 FFI）。

## 状态

**E1 编码完成且已首次运行验证（2026-09-23，E0-c 方案②原生工具链落地）：PHPUnit 19/19（137 断言）全绿；migrate 干净库建 14 表通过；Rust `cargo test` 2/2（PRNG 锚点对拍）+ corpus-check 语料 11/11；PHP FFI ↔ Rust cdylib 全语料 11/11（已固化 `tests/Unit/CombatEngineFfiTest.php`）；`../tools/check_all.py` 七闸全部 PASS。**
官方 Laravel 12 骨架已于 2026-09-22 凌晨合并入库（bootstrap/config/public/artisan/storage/.env.example，缺失才补、已有不覆盖）；`bootstrap/app.php` 已注册 `routes/api.php`，`bootstrap/providers.php` 已注册 `DomainServiceProvider`，`config/database.php` 已加 `testing` 内存 SQLite 连接。
本机工具链（用户级，免 admin）：PHP 8.3 NTS `%LOCALAPPDATA%\Programs\php`（扩展 curl/ffi/fileinfo/mbstring/openssl/pdo_sqlite/sqlite3/pdo_mysql/intl/zip 已启用）、Composer 2.10（phar + composer.bat）、Rust 1.98 `stable-x86_64-pc-windows-gnu`（本机无 MSVC 链接器，GNU 自带 mingw 可构建 cdylib）。均已在用户 PATH。
仍开放：MariaDB 语义级迁移验收（MSI 需 admin / Docker 需重启，待定）；三个 TIME 配置族等 CR 回填前对应命令 fail-closed。切片计划与验收钩子见 `../doc/dev-plan-e1.md`。

## S0 范围

- `database/migrations/`：14 表迁移**已齐**（来源 `../doc/db-schema-draft.sql`，结构已经 `tools/validate_ddl.py` 验证；迁移表名与 DDL 逐一对账无缺失无多出）
- `app/Domain/Ruleset/`：版本化配置加载器——缺 hash / 含 TBD / 非 frozen 一律拒绝启用（GDD-10、§6）
- `app/Domain/Command/`：统一命令信封 + 状态机 + 幂等总线（API-01 §1/§2/§5）
- 数值纪律：代码不含任何 Balance 常数，一律经 RulesetLoader 读取配置

## 环境就位后的验收（S0 出门条件）

1. `cp .env.example .env && php artisan key:generate`
2. `composer install && php artisan migrate` —— 干净库一键建 14 表
3. `php artisan test` —— RulesetLoader 拒绝用例（缺 hash/TBD/candidate 状态）+ 命令去重用例全绿
4. `vendor/bin/pint --test` —— 代码风格
