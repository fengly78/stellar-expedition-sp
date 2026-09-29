<?php

declare(strict_types=1);

return [
    /*
    | Rust Classic 战斗模块（doc/rust-combat-ffi-spec.md：cdylib，C ABI）
    | 路径指向 cargo build --release 产物；缺失时 CombatEngine fail-closed。
    */
    'combat' => [
        'library_path' => env('COMBAT_LIBRARY_PATH', base_path('combat/target/release/'.match (PHP_OS_FAMILY) {
            'Windows' => 'ogame_battle.dll',
            'Darwin' => 'libogame_battle.dylib',
            default => 'libogame_battle.so',
        })),
    ],

    /*
    | 游戏 API 鉴权（发布 P0-2）：默认强制 Bearer Token（game:issue-token 签发）。
    | GAME_AUTH_ENFORCED=false 为开发应急开关（回退 owner_id 明文口径），生产必须 true。
    */
    'game' => [
        'auth_enforced' => (bool) env('GAME_AUTH_ENFORCED', true),
        /*
        | G10 GM 后台：运营密钥（env GM_KEY）。请求头 X-GM-Key 与其 hash_equals 比对。
        | 未配置 = fail-closed：所有 GM 路由 403。生产必须设置强密钥。
        */
        'gm_key' => env('GM_KEY'),
    ],
];
