<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandHandler;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Command\GameCommandBus;
use App\Domain\CanonicalJson;
use App\Domain\Ruleset\Ruleset;
use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameCommand;
use App\Models\GameRuleset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GameCommandBus 幂等测试（API-01 §1/§2）：
 * 同 ID 同 payload 重放直接返回已记录结果（handler 不二次执行）；
 * 同 ID 异 payload 拒绝；未知类型拒绝；Actor≠Owner 无授权拒绝。
 */
class CommandBusTest extends TestCase
{
    use RefreshDatabase;

    private int $rulesetId;

    protected function setUp(): void
    {
        parent::setUp();
        $content = ['X' => 1];
        $row = new GameRuleset();
        $row->ruleset_name = 'balance_rc1';
        $row->version = 'test';
        $row->content_hash = CanonicalJson::hash($content);
        $row->status = GameRuleset::STATUS_FROZEN;
        $row->content_json = $content;
        $row->save();
        $this->rulesetId = (int) $row->id;
    }

    public function testReplayReturnsRecordedResultWithoutReexecuting(): void
    {
        $handler = new CountingHandler();
        $bus = $this->bus($handler);
        $cmd = $this->envelope('cmd-1', ['amount' => 5]);

        $first = $bus->dispatch($cmd, $this->rulesetId);
        $second = $bus->dispatch($cmd, $this->rulesetId);

        self::assertSame($first, $second);
        self::assertSame(1, $handler->calls, '重放不得二次执行 handler');
        self::assertSame(1, GameCommand::query()->count());
    }

    public function testSameIdDifferentPayloadRejected(): void
    {
        $bus = $this->bus(new CountingHandler());
        $bus->dispatch($this->envelope('cmd-2', ['amount' => 5]), $this->rulesetId);

        $this->expectException(CommandRejectedException::class);
        $bus->dispatch($this->envelope('cmd-2', ['amount' => 6]), $this->rulesetId);
    }

    public function testUnknownTypeRejected(): void
    {
        $bus = $this->bus(new CountingHandler());
        $this->expectException(CommandRejectedException::class);
        $bus->dispatch($this->envelope('cmd-3', [], 'NOPE'), $this->rulesetId);
    }

    public function testRejectedCommandAuditRowPersisted(): void
    {
        // 2026-09-24 缺陷修复锁定：业务拒绝后审计行必须保留（事务回滚不带走命令行，API-01 §2 不删历史）
        $bus = $this->bus(new CountingHandler());
        try {
            $bus->dispatch($this->envelope('cmd-3', [], 'NOPE'), $this->rulesetId);
            $this->fail('NOPE 应被拒绝');
        } catch (CommandRejectedException) {
        }

        $row = GameCommand::query()->where('command_id', 'cmd-3')->first();
        self::assertNotNull($row, '被拒命令行必须保留审计');
        self::assertSame('rejected', $row->status);
    }

    public function testActorOwnerMismatchRequiresAuthorization(): void
    {
        $bus = $this->bus(new CountingHandler());
        $cmd = new CommandEnvelope('cmd-4', 'governor', 9, 1, 'ECHO', []);
        $this->expectException(CommandRejectedException::class);
        $bus->dispatch($cmd, $this->rulesetId);
    }

    private function bus(CommandHandler $handler): GameCommandBus
    {
        $bus = new GameCommandBus(new RulesetLoader());
        $bus->register($handler);
        return $bus;
    }

    /** @param array<string,mixed> $payload */
    private function envelope(string $id, array $payload, string $type = 'ECHO'): CommandEnvelope
    {
        return new CommandEnvelope($id, 'player', 1, 1, $type, $payload);
    }
}

/** 测试桩：记录执行次数并回显 payload。 */
class CountingHandler implements CommandHandler
{
    public int $calls = 0;

    public function type(): string
    {
        return 'ECHO';
    }

    public function validate(CommandEnvelope $cmd, Ruleset $ruleset): void
    {
    }

    /** @return array<string,mixed> */
    public function handle(CommandEnvelope $cmd, Ruleset $ruleset): array
    {
        $this->calls++;
        return ['echo' => $cmd->payload];
    }
}
