> 状态：**已编写、本机未执行验证**（无 GitHub 远端/Actions 运行器；Docker 未安装）——首次推送/构建时按失败修。
> 设计参照 ogame-vue-ts 的 4-job CI（仅借鉴结构，无代码复制）与本项目 check_all 闸。

# CI（.github/workflows/ci.yml 设计稿）

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:

jobs:
  backend-sqlite:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: game-server } }
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.3', extensions: curl,ffi,mbstring,openssl,pdo_sqlite,sqlite3,intl,zip,bcmath, coverage: none }
      - run: composer install --no-interaction --no-progress
      - run: php -d memory_limit=1G vendor/phpunit/phpunit/phpunit

  backend-mariadb:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: game-server } }
    services:
      mariadb:
        image: mariadb:10.11
        env: { MARIADB_ROOT_PASSWORD: '', MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: 'yes', MARIADB_DATABASE: ogame_test }
        ports: ['3306:3306']
        options: >-
          --health-cmd="healthcheck.sh --connect --innodb_initialized"
          --health-interval=10s --health-timeout=5s --health-retries=5
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.3', extensions: pdo_mysql, coverage: none }
      - run: composer install --no-interaction --no-progress
      - run: php -d memory_limit=1G vendor/phpunit/phpunit/phpunit -c phpunit-mariadb.xml
        env: { DB_PORT: '3306', DB_HOST: '127.0.0.1' }

  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: npm ci
      - run: node node_modules/typescript/bin/tsc -b
      - run: node node_modules/vitest/vitest.mjs run
      - run: node node_modules/vite/bin/vite.js build

  rust-combat:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: game-server/combat } }
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --quiet
      - run: cargo run --quiet --release --bin corpus-check ../../../sim/combat_corpus
```

# game-server Dockerfile（设计稿，含 Linux .so 构建段）

```dockerfile
# 阶段 1：Rust 战斗库（Linux cdylib：libogame_battle.so；COMBAT_LIBRARY_PATH 指向它）
FROM rust:1-alpine AS combat
WORKDIR /src
COPY combat/Cargo.toml combat/Cargo.lock* ./
COPY combat/src ./src
RUN cargo build --release

# 阶段 2：运行时（php-fpm + nginx）
FROM php:8.3-fpm-alpine
RUN apk add --no-cache nginx composer curl icu-dev libzip-dev oniguruma-dev \
 && docker-php-ext-install pdo_mysql pdo_sqlite bcmath intl zip
WORKDIR /app
COPY --from=combat /src/target/release/libogame_battle.so /app/combat/libogame_battle.so
COPY game-server/composer.json game-server/composer.lock* ./
RUN composer install --no-dev --no-interaction --optimize-autoloader --no-progress || composer install --no-dev --no-interaction --no-progress
COPY game-server .
RUN mkdir -p storage/logs storage/framework/{cache,sessions,views} bootstrap/cache \
 && chmod -R ug+w storage bootstrap/cache
ENV GAME_AUTH_ENFORCED=true \
    COMBAT_LIBRARY_PATH=/app/combat/libogame_battle.so
COPY <<'EOF' /etc/nginx/httpd.conf.d/default.conf
server {
  listen 8080;
  root /app/public;
  location / { try_files $uri /index.php?$query_string; }
  location ~ \.php$ { fastcgi_pass 127.0.0.1:9000; include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME /app/public/index.php; }
}
EOF
CMD ["sh", "-c", "php-fpm -D && nginx -g 'daemon off;'"]
```

## 未验证清单（首次接入时逐项确认）

- [ ] GitHub Actions 实跑（推送仓库后；重点关注 setup-php 扩展名、MariaDB service healthcheck）
- [ ] Docker 构建（Alpine musl 下 Rust 构建、php:8.3-fpm-alpine 扩展编译；musl 的 cdylib 与 FFI 兼容性——若失败改用 debian 基底）
- [ ] nginx 配置为 heredoc 示意（实际以 conf 文件挂载更稳）
- [ ] cron/schedule:run 常驻（deploy.md §2 已有方案，容器内用 supervisor 或单独 sidecar）
