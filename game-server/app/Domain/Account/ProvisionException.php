<?php

declare(strict_types=1);

namespace App\Domain\Account;

/**
 * 开档失败（业务原因，HTTP 层映射 409/503）。
 */
class ProvisionException extends \RuntimeException
{
    public bool $configProblem = false;

    public static function config(string $message): self
    {
        $e = new self($message);
        $e->configProblem = true;

        return $e;
    }
}
