/**
 * 浏览器通知（G9）：页面隐藏时的系统级提醒。
 *
 * 纪律：默认关闭；仅当用户在设置中开启并授权后才发；只镜像既有 toast 文案（不新增数据面）。
 * 与隐私声明一致——Notification API 为浏览器本地能力，不产生网络请求。
 */

const KEY = 'browser-notify'

export function notifyEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setNotifyEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* 存储禁用时静默失败 */
  }
}

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notifyPermission(): NotificationPermission | 'unsupported' {
  if (!notifySupported()) return 'unsupported'
  return Notification.permission
}

/** 设置页按钮：先请求权限再开开关。返回是否成功开启。 */
export async function enableNotifications(): Promise<boolean> {
  if (!notifySupported()) return false
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  setNotifyEnabled(true)
  return true
}

/** toast 钩子：页面隐藏 + 已开启 + 已授权 → 发一条系统通知。任何失败静默（不打断游戏）。 */
export function mirrorToastAsNotification(text: string): void {
  try {
    if (!notifyEnabled() || !notifySupported()) return
    if (Notification.permission !== 'granted') return
    if (typeof document !== 'undefined' && !document.hidden) return
    new Notification('星际远征', { body: text, tag: 'starry-expedition-toast' })
  } catch {
    /* 部分环境（无 SW 的 file:// 等）构造 Notification 可能抛错——静默降级 */
  }
}
