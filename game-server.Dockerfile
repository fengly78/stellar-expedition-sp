# game-server Dockerfile —— Linux cdylib + php-fpm/nginx 运行时
# 状态：设计稿（本机无 Docker，未构建验证——见 doc/ci-docker-design-2026-09-24.md 验证清单）

# 阶段 1：Rust 战斗库（Linux cdylib：libogame_battle.so）
FROM rust:1-alpine AS combat
WORKDIR /src
COPY combat/Cargo.toml combat/Cargo.lock* ./
COPY combat/src ./src
RUN cargo build --release

# 阶段 2：运行时
FROM php:8.3-fpm-alpine
RUN apk add --no-cache nginx composer curl icu-dev libzip-dev oniguruma-dev \
 && docker-php-ext-install pdo_mysql pdo_sqlite bcmath intl zip
WORKDIR /app
COPY --from=combat /src/target/release/libogame_battle.so /app/combat/libogame_battle.so
COPY game-server/composer.json game-server/composer.lock* ./
RUN composer install --no-dev --no-interaction --optimize-autoloader --no-progress
COPY game-server .
RUN mkdir -p storage/logs storage/framework/cache storage/framework/sessions storage/framework/views bootstrap/cache \
 && chmod -R ug+w storage bootstrap/cache
ENV GAME_AUTH_ENFORCED=true \
    COMBAT_LIBRARY_PATH=/app/combat/libogame_battle.so
EXPOSE 8080
# 入口：php-fpm + nginx（前台）；数据库经 DB_* 环境变量指向外部 MariaDB
CMD ["sh", "-c", "php-fpm -D && nginx -g 'daemon off;'"]
