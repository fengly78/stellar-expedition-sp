<?php

declare(strict_types=1);

namespace App\Domain\Ruleset;

use App\Models\GameRuleset;

/**
 * RulesetLoader：游戏服唯一配置入口（API-01 §6 / GDD-10）。
 *
 * 铁律：
 * - 仅 frozen 状态可激活用于生产结算；testing 仅供测试环境显式调用。
 * - content_hash 必须等于 canonical JSON 的 sha256（与 tools/config_validate.py 同口径）。
 * - 内容任何位置出现 TBD 标记 → 拒绝启用（不得以零/默认值静默代替，§6）。
 * - 任务开始时锁定 ruleset_id 与关键参数快照；规则更新不回溯已支付成本。
 */
class RulesetLoader
{
    /**
     * 加载并校验一个规则集；不合法即抛 RulesetRefusedException。
     *
     * @param bool $allowTesting 仅测试环境可传 true 放行 testing 状态
     */
    public function load(int $rulesetId, bool $allowTesting = false): Ruleset
    {
        /** @var GameRuleset|null $row */
        $row = GameRuleset::query()->find($rulesetId);
        if ($row === null) {
            throw new RulesetRefusedException(["ruleset #{$rulesetId} 不存在"]);
        }

        $reasons = [];

        $statusOk = $row->status === GameRuleset::STATUS_FROZEN
            || ($allowTesting && $row->status === GameRuleset::STATUS_TESTING);
        if (!$statusOk) {
            $reasons[] = "状态 {$row->status} 不可启用（仅 frozen" . ($allowTesting ? '/testing' : '') . '）';
        }

        if ($row->status === GameRuleset::STATUS_DEPRECATED) {
            $reasons[] = '规则集已废弃';
        }

        $content = $row->content_json;
        if (!is_array($content) || $content === []) {
            $reasons[] = 'content_json 为空或非法';
        } else {
            if ($row->content_hash === null || $row->content_hash === '') {
                $reasons[] = 'content_hash 缺失（评审通过后回填，缺失拒绝启用）';
            } elseif (!hash_equals($row->content_hash, self::hashContent($content))) {
                $reasons[] = 'content_hash 与内容不符（配置被篡改或未走 CR 流程）';
            }
            $tbdPaths = self::findTbd($content);
            if ($tbdPaths !== []) {
                $reasons[] = '含 TBD 参数：' . implode(', ', $tbdPaths);
            }
        }

        if ($reasons !== []) {
            throw new RulesetRefusedException($reasons, "规则集 {$row->ruleset_name}@{$row->version}");
        }

        return new Ruleset($row->id, $row->ruleset_name, $row->version, $content);
    }

    /** canonical JSON（键递归排序、无空白、UTF-8 不转义）的 sha256，与 Python 侧对账口径一致。 */
    public static function hashContent(array $content): string
    {
        return \App\Domain\CanonicalJson::hash($content);
    }

    public static function canonicalJson(array $data): string
    {
        return \App\Domain\CanonicalJson::encode($data);
    }

    /** @return list<string> TBD 出现的路径（点分） */
    private static function findTbd(array $data, string $prefix = ''): array
    {
        $hits = [];
        foreach ($data as $key => $value) {
            $path = $prefix === '' ? (string) $key : $prefix . '.' . $key;
            if (is_string($value) && strtoupper($value) === 'TBD') {
                $hits[] = $path;
            } elseif (is_array($value)) {
                $hits = array_merge($hits, self::findTbd($value, $path));
            }
        }
        return $hits;
    }
}
