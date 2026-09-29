<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\CanonicalJson;
use PHPUnit\Framework\TestCase;

/**
 * CanonicalJson 跨语言金值测试：向量由 tools/config_validate.py 同口径 Python 代码生成
 * （tests/golden/canonical_json_vectors.json）。任一漂移即失败——hash 对账是双侧契约。
 */
class CanonicalJsonTest extends TestCase
{
    public function testGoldenVectorsEncode(): void
    {
        foreach (self::vectors() as $vec) {
            self::assertSame(
                $vec['canonical'],
                CanonicalJson::encode($vec['data']),
                "canonical 编码不一致：{$vec['name']}",
            );
        }
    }

    public function testGoldenVectorsHash(): void
    {
        foreach (self::vectors() as $vec) {
            self::assertSame(
                $vec['sha256'],
                CanonicalJson::hash($vec['data']),
                "sha256 不一致：{$vec['name']}",
            );
        }
    }

    /** @return list<array{name:string,data:array,canonical:string,sha256:string}> */
    private static function vectors(): array
    {
        $raw = file_get_contents(__DIR__ . '/../golden/canonical_json_vectors.json');
        self::assertNotFalse($raw, '金值向量文件缺失');
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        return $decoded['vectors'];
    }
}
