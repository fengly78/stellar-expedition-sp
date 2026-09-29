<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Combat\CombatEngine;
use Tests\TestCase;

/**
 * PHP FFI ↔ Rust cdylib 集成回归（2026-09-23 首次运行验证落地）：
 * 1. cdef 返回值必须声明 char*（const char* 会被 PHP 8.3 自动转字符串拷贝，
 *    free() 收到 PHP 缓冲区 → 跨分配器释放 → 堆损坏 0xC0000374）。
 * 2. 空映射字段（units/rapidfire）必须对象化（PHP 空数组 json_encode 成 []
 *    → Rust as_object 拒绝；空防舰队是合法场景）。
 *
 * 语料回放双层覆盖：combat/src/bin/corpus-check.rs（Rust 侧）+ 本测试全 11 例（PHP FFI 侧），
 * 数值深比较口径与 corpus-check.rs 一致（数字按 f64 精确、对象键序无关、数组保序）。
 * 运行前提：cargo build --release；未构建时跳过——fail-closed 契约由 missing-library 断言锁定。
 */
class CombatEngineFfiTest extends TestCase
{
    public function testLibraryMissingFailsClosed(): void
    {
        $engine = new CombatEngine(__DIR__.'/nonexistent.dll');

        $this->expectException(\RuntimeException::class);
        $engine->simulate(['attacker_fleets' => [], 'defender_fleets' => []]);
    }

    public function testFullCorpusReplaysThroughFfi(): void
    {
        $dll = (string) config('services.combat.library_path');
        if (! is_file($dll)) {
            $this->markTestSkipped("Rust cdylib 未构建：{$dll}（先 cargo build --release）");
        }
        $engine = new CombatEngine($dll);
        $corpus = dirname(__DIR__, 2).'/../sim/combat_corpus';
        $manifest = json_decode(
            (string) file_get_contents("{$corpus}/manifest.json"),
            true, 512, JSON_THROW_ON_ERROR,
        );

        self::assertSame(11, count($manifest['cases']), '语料案例数变化时须同步 corpus-check.rs 口径');
        foreach ($manifest['cases'] as $c) {
            $name = $c['case'];
            $case = json_decode((string) file_get_contents("{$corpus}/{$name}.json"), true, 512, JSON_THROW_ON_ERROR);
            $input = $case['input'];
            $input['seed'] = $case['seed'];
            $input['max_rounds'] = $input['max_rounds'] ?? 6;

            $got = $engine->simulate($input);

            $err = self::numericEq($got, $case['expected'], $name);
            self::assertNull($err, "语料 {$name} 通过 PHP FFI 回放不一致：{$err}");
        }
    }

    /**
     * 数值深比较（对齐 corpus-check.rs numeric_eq）。
     */
    private static function numericEq(mixed $a, mixed $b, string $path): ?string
    {
        if (is_array($a) && is_array($b)) {
            if (! array_is_list($a) || ! array_is_list($b)) {
                if (count($a) !== count($b)) {
                    return "{$path}: 键数不等";
                }
                foreach ($a as $k => $v) {
                    if (! array_key_exists($k, $b)) {
                        return "{$path}: 缺键 {$k}";
                    }
                    if ($e = self::numericEq($v, $b[$k], "{$path}.{$k}")) {
                        return $e;
                    }
                }

                return null;
            }
            if (count($a) !== count($b)) {
                return "{$path}: 数组长度不等";
            }
            foreach ($a as $i => $v) {
                if ($e = self::numericEq($v, $b[$i], "{$path}[{$i}]")) {
                    return $e;
                }
            }

            return null;
        }
        if (is_int($a) || is_float($a)) {
            if (is_int($b) || is_float($b)) {
                return (float) $a === (float) $b ? null : "{$path}: 数值不等";
            }
        }

        return $a === $b ? null : "{$path}: 类型或值不等";
    }
}
