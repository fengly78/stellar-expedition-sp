<?php

declare(strict_types=1);

namespace App\Domain\Command;

use App\Domain\Ruleset\RulesetLoader;
use App\Models\GameCommand;
use App\Models\GameRuleset;
use Illuminate\Support\Facades\DB;

/**
 * GameCommandBus：唯一资产变更入口（API-01 §1/§2/§5）。
 *
 * 幂等两层之一（提交层）：
 * - 同 command_id 同 payload → 直接返回首次记录的结果（不重放业务）。
 * - 同 command_id 不同 payload → REJECTED（GDD-13）。
 * 之二（业务阶段键 task_id+阶段 / battle_id）由各 handler 与任务表唯一约束保证。
 *
 * 事务纪律（§5）：命令结果 + handler 内的资产/任务/Ledger/Outbox 全部在同一事务；
 * 提交后才分发 Outbox 消息（消息可重复，资产效果不重复）。
 */
class GameCommandBus
{
    /** @var array<string,CommandHandler> */
    private array $handlers = [];

    public function __construct(
        private readonly RulesetLoader $rulesets,
    ) {
    }

    public function register(CommandHandler $handler): void
    {
        $this->handlers[$handler->type()] = $handler;
    }

    /**
     * @return array<string,mixed> 命令结果（与首次提交同内容）
     */
    public function dispatch(CommandEnvelope $cmd, int $rulesetId): array
    {
        try {
            return $this->run($cmd, $rulesetId);
        } catch (CommandRejectedException $e) {
            // 业务拒绝：事务已回滚资产效果，但审计命令行也随之回滚——
            // 此处以独立事务补写 REJECTED 审计行（API-01 §2「命令行保留审计」，2026-09-24 缺陷修复：
            // 此前被拒命令在 game_commands 完全消失，违反不删历史纪律）。
            try {
                DB::transaction(function () use ($cmd, $rulesetId, $e) {
                    // 2026-09-29 补：重放一个**此前已被拒绝**的 command_id 时，
                    // run() 会抛 CommandRejectedException（为让重放与首次提交口径一致）。
                    // 但该 command_id 早已有 REJECTED 审计行在库，再插一次必然撞唯一键，
                    // 只会产生一条无意义的 error_log 噪音。已存在就跳过补写。
                    if (DB::table('game_commands')->where('command_id', $cmd->commandId)->exists()) {
                        return;
                    }
                    $ruleset = GameRuleset::query()->find($rulesetId);
                    DB::table('game_commands')->insert([
                        'command_id' => $cmd->commandId,
                        'payload_hash' => $cmd->payloadHash(),
                        'actor_kind' => $cmd->actorKind,
                        'actor_id' => $cmd->actorId,
                        'owner_id' => $cmd->ownerId,
                        'authorization_id' => $cmd->authorizationId,
                        'authorization_version' => $cmd->authorizationVersion,
                        'type' => $cmd->type,
                        'payload_json' => json_encode($cmd->payload, JSON_UNESCAPED_UNICODE),
                        'ruleset_id' => $ruleset?->id ?? 0,
                        'status' => CommandStatus::REJECTED->value,
                        'reject_reason' => $e->getMessage(),
                        'attempt_count' => 1,
                        'submitted_at' => now(),
                    ]);
                });
            } catch (\Throwable $inner) {
                // 审计补写失败不掩盖原拒绝语义（诊断可临时加输出）
                error_log('GM/audit backfill failed: '.$inner->getMessage());
            }
            throw $e;
        }
    }

    private function run(CommandEnvelope $cmd, int $rulesetId): array
    {
        $payloadHash = $cmd->payloadHash();

        // 提交去重（先于一切业务）
        /** @var GameCommand|null $existing */
        $existing = GameCommand::query()->where('command_id', $cmd->commandId)->first();
        if ($existing !== null) {
            if (!hash_equals((string) $existing->payload_hash, $payloadHash)) {
                throw new CommandRejectedException('同 command_id 不同 payload，拒绝（GDD-13）');
            }
            // 2026-09-29 修复（ALPHA 与 BRAVO 各自独立复现）：
            // 原先对 REJECTED 记录回放时返回 `['status' => 'rejected']`，
            // 而 CommandController 会把任何非异常结果统一包成 `['status' => 'committed', ...]`，
            // 于是重放一个被拒命令会得到「外层 committed + 内层 rejected」的**自相矛盾**返回体，
            // 与同一 id 的 `GET /commands/{id}`（返回 rejected）也对不上。
            // 改为按首次提交的口径重放：被拒就照样抛，由控制器返回 409 + 原 reason。
            if ($existing->status === CommandStatus::REJECTED->value) {
                throw new CommandRejectedException(
                    (string) ($existing->reject_reason ?? '该 command_id 此前已被拒绝'),
                );
            }

            return $existing->result_json ?? ['status' => $existing->status];
        }

        $handler = $this->handlers[$cmd->type]
            ?? throw new CommandRejectedException("未知命令类型：{$cmd->type}");

        // Actor≠Owner 时必须有有效授权（§1 铁律；授权校验细节属 E1-S5，此处卡口先行）
        if ($cmd->actorId !== $cmd->ownerId && $cmd->authorizationId === null) {
            throw new CommandRejectedException('Actor≠Owner 且未提供授权引用');
        }

        $ruleset = $this->rulesets->load($rulesetId);
        $now = $cmd->submittedAtMicros ?? (int) (microtime(true) * 1_000_000);

        return DB::transaction(function () use ($cmd, $handler, $ruleset, $payloadHash, $now) {
            $record = new GameCommand();
            $record->command_id = $cmd->commandId;
            $record->payload_hash = $payloadHash;
            $record->actor_kind = $cmd->actorKind;
            $record->actor_id = $cmd->actorId;
            $record->owner_id = $cmd->ownerId;
            $record->authorization_id = $cmd->authorizationId;
            $record->authorization_version = $cmd->authorizationVersion;
            $record->type = $cmd->type;
            $record->payload_json = $cmd->payload;
            $record->ruleset_id = $ruleset->id;
            $record->status = CommandStatus::RECEIVED->value;
            $record->attempt_count = 1;
            // 事件时序以信封提交时间为准（API-01 §1：submitted_at 为服务器接收时间）
            $record->submitted_at = \Carbon\Carbon::createFromTimestamp($now / 1_000_000, 'UTC');
            $record->save();

            try {
                $handler->validate($cmd, $ruleset);
                $record->status = CommandStatus::VALIDATED->value;
                $result = $handler->handle($cmd, $ruleset);
                $record->status = CommandStatus::COMMITTED->value;
                $record->result_json = $result;
                $record->committed_at = now();
                $record->save();
                return $result;
            } catch (CommandRejectedException $e) {
                // 业务拒绝：记录原因后回滚资产效果，命令行保留审计（不删历史，§2）
                $record->status = CommandStatus::REJECTED->value;
                $record->reject_reason = $e->getMessage();
                $record->save();
                throw $e;
            } catch (\Throwable $e) {
                $record->status = CommandStatus::FAILED->value;
                $record->error_class = $e::class;
                $record->save();
                throw $e;
            }
        });
    }
}
