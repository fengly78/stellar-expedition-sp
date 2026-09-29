<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Command\CommandEnvelope;
use App\Domain\Command\CommandRejectedException;
use App\Domain\Command\GameCommandBus;
use App\Domain\Ruleset\RulesetRefusedException;
use App\Http\Requests\SubmitCommandRequest;
use App\Models\GameCommand;
use App\Models\GameRuleset;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * CommandController：统一命令入口的 HTTP 面（API-01 §1/§2）。
 *
 * 状态码语义：
 * - 200 COMMITTED（含重放返回的已记录结果）
 * - 409 REJECTED（业务拒绝：规则/资源/保护/授权不足——返回首次拒绝原因）
 * - 422 信封形状非法（FormRequest）
 * - 503 配置闸门拒绝（ruleset 未冻结/含 TBD/hash 不符）
 */
class CommandController extends Controller
{
    public function __construct(
        private readonly GameCommandBus $bus,
    ) {
    }

    public function submit(SubmitCommandRequest $request): JsonResponse
    {
        $v = $request->validated();

        // 鉴权（发布 P0-2）：令牌 owner 必须与信封 owner 一致——他人不得代提命令
        // （总督命令的 owner 也是资产所有者，语义不变）。
        $authOwner = $request->attributes->get('game_owner_id');
        if ($authOwner !== null && (int) $v['owner_id'] !== (int) $authOwner) {
            return response()->json(['error' => '禁止：令牌 owner 与信封 owner_id 不符。'], 403);
        }

        // ruleset_version → ruleset_id（提交时解析并锁定，§6）
        /** @var GameRuleset|null $ruleset */
        $ruleset = GameRuleset::query()
            ->where('ruleset_name', 'balance_rc1')->where('version', $v['ruleset_version'])->first();
        if ($ruleset === null) {
            return response()->json(['error' => "未知规则集版本：{$v['ruleset_version']}"], 422);
        }

        $envelope = new CommandEnvelope(
            commandId: $v['command_id'],
            actorKind: $v['actor']['kind'],
            actorId: (int) $v['actor']['actor_id'],
            ownerId: (int) $v['owner_id'],
            type: $v['type'],
            payload: $v['payload'],
            authorizationId: isset($v['authorization_ref']) ? (int) $v['authorization_ref']['id'] : null,
            authorizationVersion: isset($v['authorization_ref']) ? (int) $v['authorization_ref']['version'] : null,
            submittedAtMicros: isset($v['submitted_at']) ? (int) ($v['submitted_at'] * 1_000_000) : null,
        );

        try {
            $result = $this->bus->dispatch($envelope, (int) $ruleset->id);
            return response()->json(['status' => 'committed', 'result' => $result]);
        } catch (CommandRejectedException $e) {
            return response()->json(['status' => 'rejected', 'reason' => $e->getMessage()], 409);
        } catch (RulesetRefusedException $e) {
            return response()->json(['status' => 'refused', 'reasons' => $e->reasons], 503);
        }
    }

    /** 查询/重放：同 command_id 直接返回已记录结果（§1 铁律的读面）。 */
    public function show(\Illuminate\Http\Request $request, string $commandId): JsonResponse
    {
        /** @var GameCommand|null $cmd */
        $cmd = GameCommand::query()->where('command_id', $commandId)->first();
        if ($cmd === null) {
            return response()->json(['error' => '未知 command_id'], 404);
        }
        $authOwner = $request->attributes->get('game_owner_id');
        if ($authOwner !== null && (int) $authOwner !== (int) $cmd->owner_id) {
            return response()->json(['error' => '禁止：令牌不属于该 owner。'], 403);
        }
        return response()->json([
            'status' => $cmd->status,
            'result' => $cmd->result_json,
            'reject_reason' => $cmd->reject_reason,
            'submitted_at' => $cmd->submitted_at?->toIso8601String(),
            'committed_at' => $cmd->committed_at?->toIso8601String(),
        ]);
    }
}
