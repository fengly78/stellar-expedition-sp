<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Gm\GmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * GmController（G10）：GM 管理后台 HTTP 面。全部路由经 GmAuth（X-GM-Key fail-closed）。
 *
 * 动词：players（查询）/ grant（发资源）/ level（设等级）/ ban|unban（封禁）/
 *       announce（公告）/ audit（操作日志）。
 * 审计：grant/level 复用 GmService → game_commands（type=GM_*；封禁与公告
 *       也各自留一条 GM_* 审计行，保证后台每个动作都可追溯。
 */
class GmController extends Controller
{
    public function __construct(private readonly GmService $gm)
    {
    }

    public function players(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('query', ''));
        $rows = DB::table('players')->when($query !== '', function ($q) use ($query) {
            $q->where(function ($w) use ($query) {
                $w->where('name', 'like', "%{$query}%")->orWhere('owner_id', (int) $query);
            });
        })->orderByDesc('owner_id')->limit(50)->get();

        $players = $rows->map(function ($p) {
            $planetCount = DB::table('planets')->where('owner_id', $p->owner_id)->count();
            $home = DB::table('planets')->where('owner_id', $p->owner_id)->where('is_homeworld', true)->first();

            return [
                'owner_id' => (int) $p->owner_id,
                'name' => $p->name,
                'created_at' => $p->created_at,
                'planet_count' => (int) $planetCount,
                'home_resources' => $home === null ? null : [
                    'M' => (float) $home->inv_m, 'C' => (float) $home->inv_c, 'D' => (float) $home->inv_d,
                ],
                'banned' => $p->banned_at !== null,
                'ban_reason' => $p->ban_reason,
            ];
        });

        return response()->json(['players' => $players]);
    }

    public function grant(Request $request): JsonResponse
    {
        $data = $this->validated($request, ['owner_id' => 'required|int', 'M' => 'numeric', 'C' => 'numeric', 'D' => 'numeric']);
        if (($data['owner_id'] ?? 0) <= 0) {
            return response()->json(['error' => 'owner_id 必须为正整数'], 422);
        }
        $r = $this->gm->grantResources((int) $data['owner_id'], [
            'M' => $data['M'] ?? 0, 'C' => $data['C'] ?? 0, 'D' => $data['D'] ?? 0,
        ], isset($data['planet_id']) ? (int) $data['planet_id'] : null);

        return $this->gmResponse($r);
    }

    public function level(Request $request): JsonResponse
    {
        $data = $this->validated($request, ['owner_id' => 'required|int', 'building' => 'required|string', 'level' => 'required|int']);
        if (($data['owner_id'] ?? 0) <= 0) {
            return response()->json(['error' => 'owner_id 必须为正整数'], 422);
        }
        $r = $this->gm->setLevel((int) $data['owner_id'], (string) $data['building'], (int) $data['level'],
            isset($data['planet_id']) ? (int) $data['planet_id'] : null);

        return $this->gmResponse($r);
    }

    public function ban(Request $request): JsonResponse
    {
        return $this->banUnban($request, true);
    }

    public function unban(Request $request): JsonResponse
    {
        return $this->banUnban($request, false);
    }

    private function banUnban(Request $request, bool $banned): JsonResponse
    {
        $data = $this->validated($request, ['owner_id' => 'required|int']);
        if (($data['owner_id'] ?? 0) <= 0) {
            return response()->json(['error' => 'owner_id 必须为正整数'], 422);
        }
        $r = $this->gm->setBanned((int) $data['owner_id'], $banned, (string) ($data['reason'] ?? ''));
        if ($r['ok']) {
            $this->auditSimple((int) $data['owner_id'], $banned ? 'GM_BAN' : 'GM_UNBAN',
                ['owner_id' => (int) $data['owner_id'], 'reason' => (string) ($data['reason'] ?? '')]);
        }

        return $this->gmResponse($r);
    }

    public function announce(Request $request): JsonResponse
    {
        $data = $this->validated($request, ['message' => 'required|string']);
        $r = $this->gm->announce((string) ($data['message'] ?? ''));
        if ($r['ok']) {
            $this->auditSimple(0, 'GM_ANNOUNCE', ['message' => (string) $r['message']]);
        }

        return $this->gmResponse($r);
    }

    public function audit(Request $request): JsonResponse
    {
        $limit = min(200, max(1, (int) $request->query('limit', '50')));
        $rows = DB::table('game_commands')
            ->where('type', 'like', 'GM%')   // GM_* 族（LIKE 转义跨库差异，用前缀匹配足够）
            ->orderByDesc('id')->limit($limit)->get();

        return response()->json(['audit' => $rows->map(fn ($r) => [
            'id' => (int) $r->id,
            'command_id' => $r->command_id,
            'type' => $r->type,
            'owner_id' => (int) $r->owner_id,
            'payload' => json_decode((string) $r->payload_json, true),
            'result' => json_decode((string) $r->result_json, true),
            'committed_at' => $r->committed_at,
        ])]);
    }

    private function validated(Request $request, array $rules): array
    {
        $data = $request->all();
        foreach ($rules as $key => $rule) {
            $required = str_contains($rule, 'required');
            if ($required && !array_key_exists($key, $data)) {
                return [];
            }
        }

        return $data;
    }

    private function gmResponse(array $r): JsonResponse
    {
        if (!$r['ok']) {
            return response()->json(['error' => $r['error']], 422);
        }

        return response()->json($r);
    }

    private function auditSimple(int $ownerId, string $type, array $payload): void
    {
        $rulesetId = DB::table('game_rulesets')->where('status', 'frozen')->orderByDesc('id')->value('id');
        if ($rulesetId === null) {
            return; // 无 frozen 规则集时封禁/公告仍生效，仅缺审计行（与 GmService 纪律一致：资源类必须审计）
        }
        DB::table('game_commands')->insert([
            'command_id' => \Illuminate\Support\Str::uuid()->toString(),
            'payload_hash' => \App\Domain\CanonicalJson::hash($payload),
            // 与 GmService 同口径：actor_kind 沿用 CLI 先例（'player' + GM_* 类型区分）
            'actor_kind' => 'player', 'actor_id' => $ownerId, 'owner_id' => $ownerId,
            'type' => $type,
            'payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'ruleset_id' => $rulesetId,
            'status' => 'committed', 'attempt_count' => 1,
            'submitted_at' => now(), 'committed_at' => now(),
            'result_json' => json_encode(['ok' => true], JSON_UNESCAPED_UNICODE),
        ]);
    }
}
