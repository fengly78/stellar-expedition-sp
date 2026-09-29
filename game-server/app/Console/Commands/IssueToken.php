<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * game:issue-token {owner_id}：签发/轮换 API 访问令牌（发布 P0-2）。
 *
 * 明文令牌 64 hex（32 随机字节），库中只存 sha256；重签覆盖旧令牌（轮换）。
 * 明文只在 stdout 展示一次——贴到 PWA「服务器模式」的 Token 输入框。
 */
class IssueToken extends Command
{
    protected $signature = 'game:issue-token {owner_id : 玩家 owner_id}';

    protected $description = '签发/轮换 API 访问令牌（明文只显示一次）';

    public function handle(): int
    {
        $ownerId = (int) $this->argument('owner_id');
        if ($ownerId <= 0) {
            $this->error('owner_id 必须为正整数');

            return self::FAILURE;
        }

        $plain = bin2hex(random_bytes(32));
        $hash = hash('sha256', $plain);

        $exists = DB::table('api_tokens')->where('owner_id', $ownerId)->exists();
        if ($exists) {
            DB::table('api_tokens')->where('owner_id', $ownerId)
                ->update(['token_hash' => $hash, 'last_used_at' => null, 'created_at' => now()]);
        } else {
            DB::table('api_tokens')->insert([
                'owner_id' => $ownerId, 'token_hash' => $hash, 'created_at' => now(),
            ]);
        }

        $this->info("owner {$ownerId} 令牌已" . ($exists ? '轮换' : '签发') . '（只显示这一次，请立即保存）：');
        $this->newLine();
        $this->line($plain);
        $this->newLine();
        $this->warn('服务端默认强制鉴权（GAME_AUTH_ENFORCED）；粘贴到 PWA 服务器模式的 Token 输入框。');

        return self::SUCCESS;
    }
}
