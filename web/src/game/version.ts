/**
 * 版本与更新检查（G3，运营基本功）。
 *
 * 版本号/构建日期由 vite define 构建期注入（__APP_VERSION__ / __BUILD_DATE__）。
 * 更新检查：可选清单 URL（VITE_VERSION_MANIFEST_URL，形如 {"version":"0.3.1","notes":"...","url":"..."}）；
 * 未配置 = 离线模式（只展示当前版本，不发任何网络请求——与隐私声明一致）。
 */

export interface UpdateCheckResult {
  mode: 'offline' | 'up-to-date' | 'available' | 'error'
  current: string
  latest?: string
  notes?: string
  url?: string
  message: string
}

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
export const BUILD_DATE: string = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const manifestUrl = import.meta.env.VITE_VERSION_MANIFEST_URL
  if (!manifestUrl) {
    return { mode: 'offline', current: APP_VERSION, message: '当前为离线分发模式：仅展示版本，不检查更新。' }
  }
  try {
    const resp = await fetch(manifestUrl, { headers: { Accept: 'application/json' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as { version?: string; notes?: string; url?: string }
    if (!data.version) throw new Error('清单缺 version')
    if (data.version === APP_VERSION) {
      return { mode: 'up-to-date', current: APP_VERSION, latest: data.version, message: `已是最新版本 v${APP_VERSION}。` }
    }
    return {
      mode: 'available', current: APP_VERSION, latest: data.version,
      notes: data.notes, url: data.url,
      message: `发现新版本 v${data.version}（当前 v${APP_VERSION}）。`,
    }
  } catch (e) {
    return { mode: 'error', current: APP_VERSION, message: `更新检查失败：${e instanceof Error ? e.message : String(e)}` }
  }
}
