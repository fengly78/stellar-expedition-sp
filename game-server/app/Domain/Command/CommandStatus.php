<?php

declare(strict_types=1);

namespace App\Domain\Command;

/**
 * 命令状态机（API-01 §2）。与业务任务状态分离（GDD-13）。
 * COMMITTED 只表示承诺已持久化，不表示建筑建成/舰队到达。
 */
enum CommandStatus: string
{
    case RECEIVED = 'received';
    case VALIDATED = 'validated';
    case COMMITTED = 'committed';
    case REJECTED = 'rejected';   // 业务拒绝：规则/资源/保护/授权不足（不重试）
    case FAILED = 'failed';       // 技术失败：可重试，记录次数与分类
}
