import { describe, expect, it, vi } from 'vitest'
import { buildStructure, getState, makeEnvelope, submitCommand } from '../serverApi'

/** W1 服务器模式客户端测试：传输形状、错误映射、便捷动作序列。 */
function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

describe('serverApi', () => {
  it('getState parses payload and hits the contract URL', async () => {
    const f = fakeFetch(200, { owner_id: 7, generated_at: 'now', ruleset_version: 'dev_seed', civilization: null, planets: [] })
    const st = await getState('http://srv:8099/', 7, 'tok', f as unknown as typeof fetch)
    expect(st.ruleset_version).toBe('dev_seed')
    expect(f).toHaveBeenCalledWith('http://srv:8099/api/v1/state?owner_id=7', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
    }))
  })

  it('getState maps 401 to a friendly auth error', async () => {
    const f = fakeFetch(401, { error: '未授权：缺少 Bearer Token' })
    await expect(getState('http://srv', 42, undefined, f as unknown as typeof fetch))
      .rejects.toThrow(/未授权/)
  })

  it('getState maps 404 to a friendly error', async () => {
    await expect(getState('http://srv', 42, undefined, fakeFetch(404, { error: 'x' }) as unknown as typeof fetch))
      .rejects.toThrow('game:bootstrap-player')
  })

  it('makeEnvelope fills uuid/actor/owner/ruleset_version', () => {
    const env = makeEnvelope(3, 'BUILD_ENQUEUE', { planet_id: 1, building: 'METAL_MINE' }, 'dev_seed')
    expect(env.command_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(env.actor).toEqual({ kind: 'player', actor_id: 3 })
    expect(env.owner_id).toBe(3)
    expect(env.type).toBe('BUILD_ENQUEUE')
    expect(env.ruleset_version).toBe('dev_seed')
  })

  it('submitCommand maps committed/rejected/refused', async () => {
    expect((await submitCommand('http://srv', {}, undefined, fakeFetch(200, { status: 'committed', result: { ok: 1 } }) as unknown as typeof fetch)).kind).toBe('committed')
    const rej = await submitCommand('http://srv', {}, undefined, fakeFetch(409, { status: 'rejected', reason: '资源不足' }) as unknown as typeof fetch)
    expect(rej).toEqual({ kind: 'rejected', reason: '资源不足' })
    const ref = await submitCommand('http://srv', {}, undefined, fakeFetch(503, { status: 'refused', reasons: ['a'] }) as unknown as typeof fetch)
    expect(ref).toEqual({ kind: 'refused', reasons: ['a'] })
  })

  it('submitCommand maps 401/403 to auth errors', async () => {
    await expect(submitCommand('http://srv', {}, undefined, fakeFetch(401, { error: '未授权' }) as unknown as typeof fetch)).rejects.toThrow('未授权')
    await expect(submitCommand('http://srv', {}, undefined, fakeFetch(403, { error: '禁止' }) as unknown as typeof fetch)).rejects.toThrow('禁止')
  })

  it('buildStructure stops after rejected enqueue (no START fired)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'rejected', reason: '队列已满' }), { status: 409 }))
    const outcomes = await buildStructure('http://srv', 1, 'dev_seed', 5, 'METAL_MINE', undefined, f as unknown as typeof fetch)
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toEqual({ kind: 'rejected', reason: '队列已满' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('buildStructure fires ENQUEUE then START', async () => {
    const f = fakeFetch(200, { status: 'committed', result: {} })
    const outcomes = await buildStructure('http://srv', 1, 'dev_seed', 5, 'METAL_MINE', undefined, f as unknown as typeof fetch)
    expect(outcomes).toHaveLength(2)
    const firstBody = JSON.parse((f as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    const secondBody = JSON.parse((f as ReturnType<typeof vi.fn>).mock.calls[1][1].body)
    expect(firstBody.type).toBe('BUILD_ENQUEUE')
    expect(secondBody.type).toBe('BUILD_START')
  })
})
