<?php

declare(strict_types=1);

namespace App\Domain\Command;

use RuntimeException;

/** 业务拒绝（REJECTED）：规则/资源/保护/授权不足。不重试。 */
class CommandRejectedException extends RuntimeException
{
}
