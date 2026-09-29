/**
 * G8 云备份（WebDAV）——把本地 0-3 号存档槽整体备份到用户自备的 WebDAV 网盘，
 * 并可从云端恢复覆盖同名本地槽位。离线安全：所有操作显式失败返回中文错误，
 * 恢复只写 localStorage、不动运行中的 store（玩家回主菜单自行载入）。
 *
 * 隐私口径：WebDAV 地址/账号/密码保存在浏览器本地（与参照实现 vue-ts 同口径），
 * 仅在用户点击备份/恢复/测试时向所填服务器发起请求。
 */

export interface CloudConfig {
  url: string
  username: string
  password: string
}

const CLOUD_CONFIG_KEY = 'ogame-sp-cloud-config'
const REMOTE_DIR = 'ogame-sp-backup'

export function loadCloudConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as CloudConfig
    return c && typeof c.url === 'string' ? c : null
  } catch {
    return null
  }
}

export function saveCloudConfig(c: CloudConfig): void {
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(c))
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function authHeader(c: CloudConfig): string {
  return 'Basic ' + btoa(`${c.username}:${c.password}`)
}

async function putText(c: CloudConfig, name: string, text: string): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${normalizeUrl(c.url)}/${REMOTE_DIR}/${name}`, {
      method: 'PUT',
      headers: { Authorization: authHeader(c), 'Content-Type': 'application/json' },
      body: text,
    })
  } catch {
    return '无法连接服务器（检查地址与网络）'
  }
  if (!res.ok) return `上传失败（HTTP ${res.status}）`
  return null
}

async function getText(c: CloudConfig, name: string): Promise<{ status: number; ok: boolean; text: string | null; error?: string }> {
  let res: Response
  try {
    res = await fetch(`${normalizeUrl(c.url)}/${REMOTE_DIR}/${name}`, {
      method: 'GET',
      headers: { Authorization: authHeader(c) },
    })
  } catch {
    return { status: 0, ok: false, text: null, error: '无法连接服务器（检查地址与网络）' }
  }
  if (res.status === 401) return { status: 401, ok: false, text: null, error: '账号或密码错误' }
  const text = await res.text().catch(() => null)
  return { status: res.status, ok: res.ok, text }
}

export interface CloudManifest {
  savedWallAt: number
  appVersion: string
  slots: { slot: number; label: string; remoteName: string; savedWallAt: number }[]
}

export interface CloudResult {
  ok: boolean
  message: string
  uploaded?: number
  manifest?: CloudManifest
}

export async function backupToCloud(config: CloudConfig, slots: { slot: number; label: string; json: string }[]): Promise<CloudResult> {
  if (!config.url.trim()) return { ok: false, message: '请先填写 WebDAV 地址' }
  const savedWallAt = Date.now()
  const manifest: CloudManifest = {
    savedWallAt,
    appVersion: (typeof document !== 'undefined' ? document.querySelector('meta[name="app-version"]')?.getAttribute('content') : null) ?? '',
    slots: [],
  }
  let uploaded = 0
  for (const s of slots) {
    const remoteName = `${encodeURIComponent(`slot-${s.slot}`)}-${encodeURIComponent(s.label)}.json`
    const err = await putText(config, remoteName, s.json)
    if (err) return { ok: false, message: `${s.label}：${err}` }
    manifest.slots.push({ slot: s.slot, label: s.label, remoteName, savedWallAt: extractWallAt(s.json) })
    uploaded++
  }
  const manifestErr = await putText(config, 'manifest.json', JSON.stringify(manifest))
  if (manifestErr) return { ok: false, message: `清单：${manifestErr}` }
  return { ok: true, message: `已备份 ${uploaded} 个存档到云端`, uploaded, manifest }
}

function extractWallAt(json: string): number {
  try {
    const parsed = JSON.parse(json) as { meta?: { savedWallAt?: number } }
    return parsed.meta?.savedWallAt ?? 0
  } catch {
    return 0
  }
}

export async function fetchCloudManifest(config: CloudConfig): Promise<CloudResult> {
  if (!config.url.trim()) return { ok: false, message: '请先填写 WebDAV 地址' }
  const r = await getText(config, 'manifest.json')
  if (r.error) return { ok: false, message: r.error }
  if (r.status === 404) return { ok: false, message: '云端尚未备份（先执行一次备份）' }
  if (!r.ok || !r.text) return { ok: false, message: `读取清单失败（HTTP ${r.status}）` }
  try {
    const manifest = JSON.parse(r.text) as CloudManifest
    if (!manifest || !Array.isArray(manifest.slots)) return { ok: false, message: '云端清单结构无效' }
    return { ok: true, message: `云端备份于 ${new Date(manifest.savedWallAt).toLocaleString()}，共 ${manifest.slots.length} 个存档`, manifest }
  } catch {
    return { ok: false, message: '云端清单不是合法 JSON' }
  }
}

export async function restoreSlotFromCloud(config: CloudConfig, remoteName: string, slot: number, write: (slot: number, raw: string) => string | null): Promise<CloudResult> {
  const r = await getText(config, remoteName)
  if (r.error) return { ok: false, message: r.error }
  if (!r.ok || !r.text) return { ok: false, message: `下载存档失败（HTTP ${r.status}）` }
  const err = write(slot, r.text)
  if (err) return { ok: false, message: err }
  return { ok: true, message: '已恢复到本地槽位（回主菜单用「读取存档」载入）' }
}

export async function testCloud(config: CloudConfig): Promise<CloudResult> {
  if (!config.url.trim()) return { ok: false, message: '请先填写 WebDAV 地址' }
  const r = await getText(config, 'manifest.json')
  if (r.error) return { ok: false, message: r.error }
  if (r.status === 401) return { ok: false, message: '账号或密码错误' }
  if (r.status === 404) return { ok: true, message: '连接成功（云端目录为空，尚未备份）' }
  if (!r.ok) return { ok: false, message: `连接失败（HTTP ${r.status}）` }
  return { ok: true, message: '连接成功，云端已有备份' }
}
