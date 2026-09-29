export interface Profile {
  id: string
  username: string
  passHash: string
  createdAt: number
  volume: number
  sfx: boolean
  music?: boolean
}

const ACCOUNTS_KEY = 'ogame-sp-accounts'
const SESSION_KEY = 'ogame-sp-session'

function isProfile(v: unknown): v is Profile {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return typeof p.id === 'string' && typeof p.username === 'string' && typeof p.passHash === 'string'
}

function readProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // localStorage 可能被其他脚本改写或残留旧格式；断言成 Profile[] 之前先过滤，
    // 否则一条损坏记录就会让 undefined 一路传播到 ProfileScreen。
    return Array.isArray(parsed) ? parsed.filter(isProfile) : []
  } catch {
    // corrupted registry → empty
  }
  return []
}

function writeProfiles(profiles: Profile[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(profiles))
  } catch {
    // ignore storage errors
  }
}

async function hashPassword(username: string, password: string): Promise<string> {
  const text = `${username}::${password}::stellar-expedition`
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    let h = 5381
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
    return 'f' + (h >>> 0).toString(16)
  }
}

export function listProfiles(): Profile[] {
  return readProfiles()
}

export async function register(username: string, password: string): Promise<string | null> {
  const name = username.trim()
  if (!name) return '用户名不能为空'
  if (name.length > 24) return '用户名不能超过 24 个字符'
  if (password.length < 4) return '密码至少 4 位'
  const profiles = readProfiles()
  if (profiles.some((p) => p.username === name)) return '用户名已存在'
  const profile: Profile = {
    id: 'p' + Date.now().toString(36) + crypto.randomUUID().slice(0, 6),
    username: name,
    passHash: await hashPassword(name, password),
    createdAt: Date.now(),
    volume: 0.7,
    sfx: true,
  }
  profiles.push(profile)
  writeProfiles(profiles)
  localStorage.setItem(SESSION_KEY, profile.id)
  return null
}

export async function login(username: string, password: string): Promise<string | null> {
  const profile = readProfiles().find((p) => p.username === username.trim())
  if (!profile) return '账号不存在'
  if ((await hashPassword(profile.username, password)) !== profile.passHash) return '密码错误'
  localStorage.setItem(SESSION_KEY, profile.id)
  return null
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function currentProfile(): Profile | null {
  const id = localStorage.getItem(SESSION_KEY)
  if (!id) return null
  return readProfiles().find((p) => p.id === id) ?? null
}

export function updateProfileSettings(partial: Partial<Pick<Profile, 'volume' | 'sfx' | 'music'>>): void {
  const id = localStorage.getItem(SESSION_KEY)
  if (!id) return
  const profiles = readProfiles()
  const idx = profiles.findIndex((p) => p.id === id)
  if (idx < 0) return
  profiles[idx] = { ...profiles[idx], ...partial }
  writeProfiles(profiles)
}

export function deleteProfile(id: string): void {
  writeProfiles(readProfiles().filter((p) => p.id !== id))
  if (localStorage.getItem(SESSION_KEY) === id) localStorage.removeItem(SESSION_KEY)
  for (let slot = 0; slot <= 3; slot++) {
    localStorage.removeItem(`ogame-sp-save-${id}-${slot}`)
  }
}

export function saveSlotKey(slot: number): string | null {
  const id = localStorage.getItem(SESSION_KEY)
  return id ? `ogame-sp-save-${id}-${slot}` : null
}
