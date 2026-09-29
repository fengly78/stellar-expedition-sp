<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Account\PlayerProvisioner;
use App\Domain\Account\ProvisionException;
use Illuminate\Console\Command;

/**
 * game:bootstrap-player：开发/测试用玩家引导（开档内核 = PlayerProvisioner，
 * 与自助注册 /api/v1/register 共用）。正式注册入口见 RegisterController。
 */
class BootstrapPlayer extends Command
{
    protected $signature = 'game:bootstrap-player
        {owner_id : 玩家/文明 owner_id}
        {--m=500 : 初始金属}
        {--c=500 : 初始晶体}
        {--d=0 : 初始重氢}
        {--galaxy= : 显式星系（与 --system/--orbit 三者同时给出则跳过自动选址）}
        {--system= : 显式太阳系}
        {--orbit= : 显式行星位}';

    protected $description = '创建文明与母星（开发/测试引导；注册端点的 CLI 等价物）';

    public function handle(PlayerProvisioner $provisioner): int
    {
        $ownerId = (int) $this->argument('owner_id');
        $g = $this->option('galaxy');
        $s = $this->option('system');
        $o = $this->option('orbit');
        $explicit = $g !== null || $s !== null || $o !== null;
        if ($explicit && ($g === null || $s === null || $o === null)) {
            $this->error('显式选址需 --galaxy/--system/--orbit 三者同时给出（或不给以走经典自动选址）');

            return self::FAILURE;
        }
        if ($ownerId <= 0) {
            $this->error('owner_id 必须为正整数');

            return self::FAILURE;
        }
        $coords = $explicit
            ? ['galaxy' => (int) $g, 'system_pos' => (int) $s, 'orbit' => (int) $o]
            : null;

        try {
            $r = $provisioner->provision($ownerId,
                (float) $this->option('m'), (float) $this->option('c'), (float) $this->option('d'), $coords);
        } catch (ProvisionException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("文明 {$r['owner_id']} 已建立；母星 #{$r['planet_id']} @ {$r['coords']}"
            . " 温度 {$r['temp']}℃ 规则集 {$r['ruleset']}"
            . '（令牌：php artisan game:issue-token ' . $r['owner_id'] . '）');

        return self::SUCCESS;
    }
}
