<?php

declare(strict_types=1);

namespace App\Domain;

use InvalidArgumentException;

/**
 * Canonical JSON：与 tools/config_validate.py 完全同口径——
 * Python `json.dumps(data, ensure_ascii=False, sort_keys=True)`（默认分隔符 ', ' / ': '，嵌套字典递归排序，列表保序）。
 *
 * 用于 ruleset content_hash 与命令 payload_hash。跨语言一致性由
 * tests/golden/canonical_json_vectors.json（Python 生成）金值测试锁定。
 * 注意：PHP 的 json_encode 默认无空格，不能直接用——本类手写递归编码器对齐 Python 输出。
 */
class CanonicalJson
{
    /**
     * @param array<string,mixed>|list<mixed> $data
     */
    public static function encode(array $data): string
    {
        return self::encodeValue($data);
    }

    /** @param array<string,mixed>|list<mixed> $data */
    public static function hash(array $data): string
    {
        return hash('sha256', self::encode($data));
    }

    /**
     * 关联数组按键递归排序；列表保持顺序。
     *
     * @param array<string,mixed>|list<mixed> $data
     * @return array<string,mixed>|list<mixed>
     */
    public static function sort(array $data): array
    {
        if (!array_is_list($data)) {
            ksort($data);
        }
        return array_map(fn ($v) => is_array($v) ? self::sort($v) : $v, $data);
    }

    private static function encodeValue(mixed $v): string
    {
        return match (true) {
            $v === null => 'null',
            is_bool($v) => $v ? 'true' : 'false',
            is_int($v) => (string) $v,
            is_float($v) => self::encodeFloat($v),
            is_string($v) => (string) json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            // 空数组视为空对象：Python {} 应编码为 '{}'（json.dumps 口径），
            // 而 PHP 的 array_is_list([]) === true 会走列表分支产出 '[]'。
            // 域内约束（ruleset content / command payload）：空容器一律按对象语义。
            is_array($v) && $v === [] => '{}',
            is_array($v) && array_is_list($v) =>
                '[' . implode(', ', array_map(self::encodeValue(...), $v)) . ']',
            is_array($v) => self::encodeObject($v),
            default => throw new InvalidArgumentException('不可 canonical 化的类型：' . get_debug_type($v)),
        };
    }

    /** @param array<string,mixed> $obj */
    private static function encodeObject(array $obj): string
    {
        ksort($obj);
        $pairs = [];
        foreach ($obj as $k => $v) {
            $pairs[] = self::encodeValue((string) $k) . ': ' . self::encodeValue($v);
        }
        return '{' . implode(', ', $pairs) . '}';
    }

    /** Python repr 口径：浮点保留 .0（PHP json_encode 需 JSON_PRESERVE_ZERO_FRACTION）。 */
    private static function encodeFloat(float $v): string
    {
        return (string) json_encode($v, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES);
    }
}
