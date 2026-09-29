<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * 统一命令信封的 HTTP 形状校验（API-01 §1）。
 * 业务校验（资源/前置/授权）在 handler 层；这里只守形状。
 */
class SubmitCommandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // 认证/鉴权中间件属部署层（E1 范围外，接入时加 auth 中间件）
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        return [
            'command_id' => ['required', 'uuid'],
            'actor.kind' => ['required', 'in:player,pirate_ai,governor'],
            'actor.actor_id' => ['required', 'integer', 'min:1'],
            'owner_id' => ['required', 'integer', 'min:1'],
            'type' => ['required', 'string', 'max:40'],
            // 契约说明（2026-09-29 澄清，ALPHA 试玩时把这条报成"与文档冲突"）：
            // Laravel 的 `required` 规则把**空数组视为缺失**，所以 `payload: {}` 会被判
            // "缺少 payload"。这是既有契约而非缺陷——当前 10 个命令类型**每一个**都至少需要一个
            // 参数（planet_id / task_id / index …），没有任何命令允许空 payload。
            // 保留 required 是有意的：信封里出现一个空 payload 几乎必然是调用方写错了结构，
            // 与其让它走到 handler 再报一个更费解的业务错误，不如在形状层就挡住。
            // 若将来真的新增无参命令，把这条改成 `['present', 'array']` 并由该 handler 自查。
            'payload' => ['required', 'array'],
            'ruleset_version' => ['required', 'string', 'max:32'],
            'authorization_ref' => ['nullable', 'array'],
            'authorization_ref.id' => ['required_with:authorization_ref', 'integer', 'min:1'],
            'authorization_ref.version' => ['required_with:authorization_ref', 'integer', 'min:1'],
            'submitted_at' => ['nullable', 'numeric'],   // 缺省由总线填服务器时间
        ];
    }

    /**
     * 中文校验文案。
     *
     * 2026-09-29（ALPHA 试玩报出）：原先 422 直接吐 Laravel 默认英文
     * （"The command id field must be a valid UUID."），与全站中文错误风格不一致。
     *
     * 用 FormRequest::messages() 显式声明，而不是改全局 app.locale：
     * 全局 locale 会连带影响日期/数字格式等一大片行为，而这里只需要校验消息本身。
     * 这样改动的爆炸半径仅限这一个请求类。
     *
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [
            'command_id.required' => '缺少 command_id（命令幂等键）',
            'command_id.uuid' => 'command_id 必须是合法 UUID',
            'actor.kind.required' => '缺少 actor.kind（player/pirate_ai/governor）',
            'actor.kind.in' => 'actor.kind 只能是 player、pirate_ai 或 governor',
            'actor.actor_id.required' => '缺少 actor.actor_id',
            'actor.actor_id.integer' => 'actor.actor_id 必须是整数',
            'actor.actor_id.min' => 'actor.actor_id 必须大于 0',
            'owner_id.required' => '缺少 owner_id（资产所有者）',
            'owner_id.integer' => 'owner_id 必须是整数',
            'owner_id.min' => 'owner_id 必须是正整数',
            'type.required' => '缺少 type（命令类型）',
            'type.max' => 'type 长度不能超过 40',
            'payload.required' => '缺少 payload（命令参数）',
            'payload.array' => 'payload 必须是对象',
            'ruleset_version.required' => '缺少 ruleset_version（先读 GET /state 取该字段）',
            'ruleset_version.max' => 'ruleset_version 长度不能超过 32',
            'authorization_ref.id.required_with' => '给了 authorization_ref 就必须给 id',
            'authorization_ref.version.required_with' => '给了 authorization_ref 就必须给 version',
            'submitted_at.numeric' => 'submitted_at 必须是数字（秒级时间戳）',
        ];
    }
}
