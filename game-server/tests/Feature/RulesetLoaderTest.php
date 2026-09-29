<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CanonicalJson;
use App\Domain\Ruleset\RulesetLoader;
use App\Domain\Ruleset\RulesetRefusedException;
use App\Models\GameRuleset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * RulesetLoader 闸门测试（API-01 §6 / GDD-10）：
 * candidate/deprecated 拒绝、缺 hash 拒绝、hash 不符拒绝、TBD 拒绝、frozen 合法放行。
 */
class RulesetLoaderTest extends TestCase
{
    use RefreshDatabase;

    private const CONTENT = ['BUILD' => ['METAL_MINE' => ['M' => 60, 'C' => 15]]];

    public function testFrozenWithValidHashLoads(): void
    {
        $id = $this->seedRuleset(GameRuleset::STATUS_FROZEN, self::CONTENT, CanonicalJson::hash(self::CONTENT));
        $rs = (new RulesetLoader())->load($id);
        self::assertSame('balance_rc1', $rs->name);
        self::assertSame(60.0, $rs->getFloat('BUILD.METAL_MINE.M'));
    }

    public function testCandidateRefused(): void
    {
        $id = $this->seedRuleset(GameRuleset::STATUS_CANDIDATE, self::CONTENT, CanonicalJson::hash(self::CONTENT));
        $this->expectException(RulesetRefusedException::class);
        (new RulesetLoader())->load($id);
    }

    public function testMissingHashRefused(): void
    {
        $id = $this->seedRuleset(GameRuleset::STATUS_FROZEN, self::CONTENT, '');
        $this->expectException(RulesetRefusedException::class);
        (new RulesetLoader())->load($id);
    }

    public function testTamperedContentRefused(): void
    {
        $id = $this->seedRuleset(GameRuleset::STATUS_FROZEN, self::CONTENT, str_repeat('0', 64));
        $this->expectException(RulesetRefusedException::class);
        (new RulesetLoader())->load($id);
    }

    public function testTbdRefused(): void
    {
        $content = self::CONTENT + ['SHIP' => ['SCOUT' => ['speed' => 'TBD']]];
        $id = $this->seedRuleset(GameRuleset::STATUS_FROZEN, $content, CanonicalJson::hash($content));
        $this->expectException(RulesetRefusedException::class);
        (new RulesetLoader())->load($id);
    }

    public function testMissingKeyThrows(): void
    {
        $id = $this->seedRuleset(GameRuleset::STATUS_FROZEN, self::CONTENT, CanonicalJson::hash(self::CONTENT));
        $rs = (new RulesetLoader())->load($id);
        $this->expectException(RulesetRefusedException::class);
        $rs->get('BUILD.DOES_NOT_EXIST');
    }

    /** @param array<string,mixed> $content */
    private function seedRuleset(string $status, array $content, string $hash): int
    {
        $row = new GameRuleset();
        $row->ruleset_name = 'balance_rc1';
        $row->version = 'test';
        $row->content_hash = $hash;
        $row->status = $status;
        $row->content_json = $content;
        $row->save();
        return (int) $row->id;
    }
}
