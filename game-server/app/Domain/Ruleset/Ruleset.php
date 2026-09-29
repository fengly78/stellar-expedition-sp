<?php

declare(strict_types=1);

namespace App\Domain\Ruleset;

/**
 * 已校验规则集的只读视图。数值唯一来源——代码中禁止硬编码 Balance 常数（dev-plan-e1 纪律）。
 */
class Ruleset
{
    /** @param array<string,mixed> $content */
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $version,
        private readonly array $content,
    ) {
    }

    /** 点分路径取值，如 'BUILD.METAL_MINE.M'。缺键即抛（不静默默认，§6）。 */
    public function get(string $path): mixed
    {
        $node = $this->content;
        foreach (explode('.', $path) as $seg) {
            if (!is_array($node) || !array_key_exists($seg, $node)) {
                throw new RulesetRefusedException(["配置键缺失：{$path}"]);
            }
            $node = $node[$seg];
        }
        return $node;
    }

    public function getFloat(string $path): float
    {
        $v = $this->get($path);
        if (!is_int($v) && !is_float($v)) {
            throw new RulesetRefusedException(["配置键非数值：{$path}"]);
        }
        return (float) $v;
    }
}
