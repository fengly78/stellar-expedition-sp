<?php

declare(strict_types=1);

namespace App\Domain\Combat;

/**
 * CombatEngine：Rust Classic 战斗模块 FFI 边界（doc/rust-combat-ffi-spec.md）。
 *
 * 契约：纯函数——同一（输入, 种子, 规则版本）→ 同一输出。
 * 边界纪律：库缺失/加载失败 → fail-closed 抛 RuntimeException（战斗不得降级为任何内置近似实现）。
 * 验收：黄金语料 11 例逐位回放（spec §6 L0）在 Rust 侧 cargo 测试 + PHP 侧集成测试双层。
 */
class CombatEngine
{
    private ?\FFI $ffi = null;

    public function __construct(
        private readonly string $libraryPath,   // config: services.combat.library_path
    ) {
    }

    private function ffi(): \FFI
    {
        if ($this->ffi === null) {
            if (!extension_loaded('ffi')) {
                throw new \RuntimeException('PHP FFI 扩展未启用（战斗引擎不可用，拒绝降级）');
            }
            if (!is_file($this->libraryPath)) {
                throw new \RuntimeException("Rust 战斗库不存在：{$this->libraryPath}（拒绝降级）");
            }
            // ABI 注意：返回值必须声明为 char* 而非 const char*——
            // PHP 8.3 FFI 对 const char* 返回值自动转成 PHP 字符串拷贝，
            // 拿不到原指针会导致 ogame_battle_free 收到 PHP 缓冲区 → 跨分配器释放 → 堆损坏。
            // char* 声明下 PHP 返回 CData，string()/free() 按契约配对（2026-09-23 首运行发现）。
            $this->ffi = \FFI::cdef(
                'char* ogame_battle_simulate(const char* input_json);
                 void ogame_battle_free(char* ptr);',
                $this->libraryPath,
            );
        }
        return $this->ffi;
    }

    /**
     * @param array<string,mixed> $input BattleInput（spec §3：attacker_fleets/defender_fleets/seed/max_rounds）
     * @return array<string,mixed> BattleOutput（spec §4）
     */
    public function simulate(array $input): array
    {
        $ffi = $this->ffi();
        $in = json_encode(self::objectifyEmptyMaps($input), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $outPtr = $ffi->ogame_battle_simulate($in);
        try {
            $json = \FFI::string($outPtr);
        } finally {
            $ffi->ogame_battle_free($outPtr);
        }
        /** @var array<string,mixed> $result */
        $result = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (isset($result['error'])) {
            // 注意：?? 不能写进字符串插值 {$...}（复杂语法不支持该运算符，会解析错误）。
            $class = $result['class'] ?? 'unknown';
            throw new \RuntimeException("战斗引擎错误（{$class}）：{$result['error']}");
        }
        return $result;
    }

    /**
     * units / rapidfire 按规格 §3 是映射（对象）。PHP 空数组 json_encode 会产出 []，
     * Rust 侧 as_object 拒绝（"缺 units"）——空防舰队（units:{}）是合法场景（语料 G-005），
     * 空映射必须显式对象化。其余空数组（如列表字段）不动。
     */
    private static function objectifyEmptyMaps(array $v): array
    {
        foreach ($v as $k => $val) {
            if (is_array($val)) {
                $v[$k] = $val === [] && in_array($k, ['units', 'rapidfire'], true)
                    ? new \stdClass()
                    : self::objectifyEmptyMaps($val);
            }
        }
        return $v;
    }
}
