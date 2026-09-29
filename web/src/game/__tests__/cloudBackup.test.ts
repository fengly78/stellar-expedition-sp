import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backupToCloud, fetchCloudManifest, restoreSlotFromCloud, testCloud, type CloudConfig } from '../cloudBackup'

const config: CloudConfig = { url: 'https://dav.example.com/dav/', username: 'user', password: 'pass' }

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

const validSlotJson = JSON.stringify({
  meta: { savedWallAt: 1000, label: '自动存档', gameTime: 0, difficulty: 'normal', planetCount: 1 },
  data: { saveVersion: 11, planets: [] },
})

describe('G8 云备份（WebDAV 客户端）', () => {
  beforeEach(() => {
    localStorageShim()
    vi.unstubAllGlobals()
  })

  it('备份：逐槽 PUT + manifest，Basic 认证头与路径正确', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await backupToCloud(config, [{ slot: 0, label: '自动存档', json: validSlotJson }])
    expect(r.ok).toBe(true)
    expect(r.uploaded).toBe(1)
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.length).toBe(2) // 1 slot + manifest
    const [url, init] = calls[0]
    expect(url).toBe('https://dav.example.com/dav/ogame-sp-backup/slot-0-%E8%87%AA%E5%8A%A8%E5%AD%98%E6%A1%A3.json')
    expect((init.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('user:pass'))
    expect(init.method).toBe('PUT')
    const manifestCall = calls[1]
    expect(manifestCall[0].endsWith('manifest.json')).toBe(true)
  })

  it('备份：任一槽失败即中止并返回中文错误', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await backupToCloud(config, [{ slot: 0, label: '自动存档', json: validSlotJson }])
    expect(r.ok).toBe(false)
    expect(r.message).toContain('HTTP 500')
  })

  it('恢复：下载槽位并通过结构校验后写回', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('manifest.json')
        ? new Response(JSON.stringify({ savedWallAt: 1, appVersion: '', slots: [{ slot: 0, label: '自动存档', remoteName: 'slot-0.json', savedWallAt: 1 }] }), { status: 200 })
        : new Response(validSlotJson, { status: 200 }),
    ))
    const writes: [number, string][] = []
    const r = await restoreSlotFromCloud(config, 'slot-0.json', 0, (slot, raw) => {
      writes.push([slot, raw])
      return null
    })
    expect(r.ok).toBe(true)
    expect(writes).toEqual([[0, validSlotJson]])
  })

  it('恢复：结构无效被 write 校验拦截', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"broken":true}', { status: 200 })))
    const r = await restoreSlotFromCloud(config, 'slot-0.json', 0, () => '云端存档结构无效')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('云端存档结构无效')
  })

  it('清单：404 提示尚未备份；401 提示凭据错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect((await fetchCloudManifest(config)).message).toContain('尚未备份')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    expect((await testCloud(config)).message).toBe('账号或密码错误')
  })

  it('网络失败：统一中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down')
    }))
    const r = await testCloud(config)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('无法连接服务器')
  })
})
