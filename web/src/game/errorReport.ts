/**
 * G11 错误日志与可选上报。
 *
 * 隐私口径（与首启声明一致：不内置遥测/上报）：错误只记录在浏览器本地环形队列
 * （最近 30 条），供玩家导出附在反馈里；仅当玩家在设置页显式填写自己的上报端点
 * 并点击上报时，才向该端点发送一次。默认零网络请求。
 */

export interface ErrorEntry {
  time: number
  kind: 'render' | 'uncaught' | 'rejection'
  message: string
  stack?: string
}

const ERROR_LOG_KEY = 'ogame-sp-error-log'
const ERROR_LOG_MAX = 30

export function getErrorLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ErrorEntry[]
    return Array.isArray(parsed) ? parsed.slice(-ERROR_LOG_MAX) : []
  } catch {
    return []
  }
}

export function recordError(kind: ErrorEntry['kind'], message: string, stack?: string): void {
  try {
    const log = getErrorLog()
    const entry: ErrorEntry = { time: Date.now(), kind, message: String(message).slice(0, 500), stack: stack?.slice(0, 2000) }
    // 相同错误 30 秒内去重（渲染期可能每帧抛一次）
    const last = log[log.length - 1]
    if (last && last.kind === kind && last.message === entry.message && entry.time - last.time < 30_000) return
    log.push(entry)
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log.slice(-ERROR_LOG_MAX)))
  } catch {
    // 日志本身失败时静默（不能因记录错误再抛错误）
  }
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY)
  } catch {
    // ignore
  }
}

export function exportErrorLog(): string {
  const log = getErrorLog()
  if (log.length === 0) return '没有记录的错误。'
  const lines = log.map((e) => `[${new Date(e.time).toLocaleString()}] ${e.kind}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
  return lines.join('\n\n')
}

let installed = false

/** 注册全局未捕获异常监听（幂等，App 挂载时调用一次） */
export function installErrorReporting(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => {
    recordError('uncaught', event.message, event.error instanceof Error ? event.error.stack : undefined)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    recordError('rejection', reason, event.reason instanceof Error ? event.reason.stack : undefined)
  })
}

export interface ReportResult {
  ok: boolean
  message: string
}

/** 手动上报：把本地错误日志 POST 到玩家自备端点（一次一批） */
export async function reportToEndpoint(endpoint: string): Promise<ReportResult> {
  const url = endpoint.trim()
  if (!url) return { ok: false, message: '请先填写上报端点' }
  const log = getErrorLog()
  if (log.length === 0) return { ok: false, message: '没有可上报的错误' }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'ogame-sp', reportedAt: Date.now(), errors: log }),
    })
  } catch {
    return { ok: false, message: '无法连接上报端点（检查地址与网络）' }
  }
  if (!res.ok) return { ok: false, message: `上报失败（HTTP ${res.status}）` }
  return { ok: true, message: `已上报 ${log.length} 条错误` }
}
