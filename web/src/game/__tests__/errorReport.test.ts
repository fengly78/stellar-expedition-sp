import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearErrorLog, exportErrorLog, getErrorLog, recordError, reportToEndpoint } from '../errorReport'

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

describe('G11 错误日志与可选上报', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    clearErrorLog()
  })

  it('记录/读取：进环形队列，截断超长消息', () => {
    recordError('uncaught', 'boom', 'stack-line')
    const log = getErrorLog()
    expect(log.length).toBe(1)
    expect(log[0].kind).toBe('uncaught')
    expect(log[0].message).toBe('boom')
    recordError('render', 'x'.repeat(2000))
    expect(getErrorLog()[1].message.length).toBeLessThanOrEqual(500)
  })

  it('30 秒内相同错误去重（渲染期每帧抛错只记一条）', () => {
    recordError('render', 'same error')
    recordError('render', 'same error')
    expect(getErrorLog().length).toBe(1)
    recordError('render', 'different error')
    expect(getErrorLog().length).toBe(2)
  })

  it('上限 30 条：旧错误被挤出', () => {
    for (let i = 0; i < 40; i++) recordError('uncaught', `error-${i}`)
    const log = getErrorLog()
    expect(log.length).toBe(30)
    expect(log[0].message).toBe('error-10')
    expect(log[29].message).toBe('error-39')
  })

  it('导出：含时间戳与堆栈；空日志有占位文案', () => {
    expect(exportErrorLog()).toBe('没有记录的错误。')
    recordError('rejection', 'async fail', 'at line 1')
    const text = exportErrorLog()
    expect(text).toContain('rejection: async fail')
    expect(text).toContain('at line 1')
  })

  it('上报：仅向用户端点 POST 一批；空端点/空日志拒绝', async () => {
    expect((await reportToEndpoint('')).message).toBe('请先填写上报端点')
    expect((await reportToEndpoint('https://e.example.com/r')).message).toBe('没有可上报的错误')
    recordError('uncaught', 'reportable')
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await reportToEndpoint('https://e.example.com/r')
    expect(r.ok).toBe(true)
    expect(r.message).toContain('1 条')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://e.example.com/r')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as { app: string; errors: unknown[] }
    expect(body.app).toBe('ogame-sp')
    expect(body.errors.length).toBe(1)
  })

  it('上报失败：非 2xx 与网络错误返回中文错误', async () => {
    recordError('uncaught', 'oops')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })))
    expect((await reportToEndpoint('https://e.example.com/r')).message).toContain('HTTP 502')
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('down')
    }))
    expect((await reportToEndpoint('https://e.example.com/r')).message).toContain('无法连接')
  })
})
