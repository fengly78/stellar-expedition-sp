<?php

use App\Providers\AppServiceProvider;
use App\Providers\DomainServiceProvider;

return [
    AppServiceProvider::class,
    DomainServiceProvider::class,   // 命令总线单例 + 10 handler 注册 + CombatEngine 路径注入
];
