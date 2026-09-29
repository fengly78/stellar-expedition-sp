<?php

declare(strict_types=1);

namespace App\Domain\Ruleset;

use RuntimeException;

/**
 * 配置闸门拒绝：缺 hash / hash 不符 / 含 TBD / 状态非法。
 * 语义对应 tools/config_validate.py 的 ERROR 级（§05.1/§6：缺失或 TBD 拒绝启用，不静默代替）。
 */
class RulesetRefusedException extends RuntimeException
{
    /** @param list<string> $reasons */
    public function __construct(
        public readonly array $reasons,
        string $message = '规则集被拒绝启用',
    ) {
        parent::__construct($message . '：' . implode('；', $reasons));
    }
}
