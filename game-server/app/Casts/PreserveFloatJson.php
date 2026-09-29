<?php

declare(strict_types=1);

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use JsonException;

/**
 * PreserveFloatJson：保留整值浮点尾零的 JSON 列 cast（JSON_PRESERVE_ZERO_FRACTION）。
 *
 * 为什么必须自定义：CanonicalJson 口径下 Python json.dumps(2.0)="2.0"，哈希含 ".0"；
 * PHP 原生 json_encode(2.0)="2"（默认丢尾零）→ 入库往返后 2.0 变 int 2，
 * content_hash 校验必然失配（2026-09-23 合成规则集引入整值浮点 g=2.0 时暴露）。
 * 规则集内容、成本快照等参与哈希/对账的 JSON 列一律使用本 cast。
 */
class PreserveFloatJson implements CastsAttributes
{
    /**
     * @return array<string,mixed>|null
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null) {
            return null;
        }
        try {
            $decoded = json_decode($value, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new \RuntimeException("JSON 列解析失败（{$key}）：{$e->getMessage()}", 0, $e);
        }
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param array<string,mixed>|null $value
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }
        try {
            return json_encode($value, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new \RuntimeException("JSON 列编码失败（{$key}）：{$e->getMessage()}", 0, $e);
        }
    }
}
