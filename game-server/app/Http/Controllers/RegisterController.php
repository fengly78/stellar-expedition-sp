<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Account\PlayerProvisioner;
use App\Domain\Account\ProvisionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * RegisterController：自助注册（G1，公测放量入口）。
 *
 * POST /api/v1/register {name}
 * - 分配下一个 owner_id → 经典开档（自动选址/定温/init 台账）→ 签发访问令牌。
 * - name 仅作展示登记（players.name 列）；身份凭证 = 返回的令牌（只显示一次）。
 * - 409：name 已被占用；503：无 frozen 规则集；422：形状非法。
 */
class RegisterController extends Controller
{
    public function store(Request $request, PlayerProvisioner $provisioner): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|min:1|max:32',
        ]);

        $name = trim($validated['name']);

        $taken = DB::table('players')->where('name', $name)->exists();
        if ($taken) {
            return response()->json(['error' => "指挥官代号「{$name}」已被占用。"], 409);
        }

        // owner 分配 + 开档（civilizations.owner_id 唯一约束兜底并发，冲突重试）
        $attempts = 0;
        do {
            $ownerId = $provisioner->nextOwnerId();
            try {
                $info = $provisioner->provision($ownerId, 500.0, 500.0, 0.0);
            } catch (ProvisionException $e) {
                if ($e->configProblem) {
                    return response()->json(['error' => $e->getMessage()], 503);
                }
                if (str_contains($e->getMessage(), '已有文明') && $attempts < 3) {
                    $attempts++;
                    continue;   // 并发抢号 → 重试下一个 id
                }
                return response()->json(['error' => $e->getMessage()], 409);
            }
            break;
        } while (true);

        DB::table('players')->insert([
            'owner_id' => $ownerId, 'name' => $name, 'created_at' => now(),
        ]);

        $token = $provisioner->issueToken($ownerId);

        return response()->json([
            'owner_id' => $ownerId,
            'name' => $name,
            'coords' => $info['coords'],
            'temp' => $info['temp'],
            'ruleset' => $info['ruleset'],
            'token' => $token,
            'token_note' => '访问令牌只显示这一次——粘贴到客户端 Token 输入框保存。',
        ], 201);
    }
}
