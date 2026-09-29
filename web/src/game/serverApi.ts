/**
 * serverApi：服务器模式（W1 竖切）的 HTTP 客户端。
 *
 * 对应契约：doc/api-01-command-contract.md §3/§7/§12。
 * 设计：纯函数 + 可注入 fetchImpl（vitest 可测）；错误统一抛 Error（message 面向玩家）。
 * 信任边界：本模块只做传输与形状转换，不做任何数值推导。
 */

export interface ServerConn {
  baseUrl: string
  ownerId: number
}

export interface ServerPlanet {
  id: number
  coords: string
  temp: number | null
  is_homeworld: boolean
  is_moon: boolean
  inventory: { M: number; C: number; D: number }
  reserved: { M: number; C: number; D: number }
  levels: Record<string, number>
  ships: Record<string, number>
  defense: Record<string, number>
  queue_building: unknown[]
  version: number
}

export interface ServerState {
  owner_id: number
  generated_at: string
  ruleset_version: string | null
  civilization: {
    techs: Record<string, number>
    research_active: { task_id?: number; tech?: string } | null
    mission_slots_used: number
  } | null
  planets: ServerPlanet[]
  announcement?: string | null
}

export type CommandOutcome =
  | { kind: 'committed'; result: Record<string, unknown> }
  | { kind: 'rejected'; reason: string }
  | { kind: 'refused'; reasons: string[] }

const CLEAN_BASE = (base: string): string => base.replace(/\/+$/, '')

/** Bearer 头（token 为空 = 开发态免鉴权服务器）。 */
const authHeaders = (token?: string): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}

export function connKey(base: string, ownerId: number): string {
  return `${CLEAN_BASE(base)}|${ownerId}`
}

/** GET /api/v1/state?owner_id=N —— 401=未鉴权，404=owner 不存在，422=参数非法。 */
export async function getState(base: string, ownerId: number, token?: string, fetchImpl: typeof fetch = fetch): Promise<ServerState> {
  let resp: Response
  try {
    resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/state?owner_id=${ownerId}`, {
      headers: { Accept: 'application/json', ...authHeaders(token) },
    })
  } catch (e) {
    throw new Error(`无法连接服务器（${String(e)}）`)
  }
  if (resp.status === 401) throw new Error(((await resp.json().catch(() => ({}))) as any).error ?? '未授权：缺少/无效 Token（服务端 game:issue-token 签发）')
  if (resp.status === 404) throw new Error('服务器上不存在该 owner——先在服务器执行 game:bootstrap-player')
  if (!resp.ok) {
    // 403（越权/封禁）等服务端语义错误透出 error 文案（含封禁原因）
    const body = (await resp.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `状态读取失败：HTTP ${resp.status}`)
  }
  return (await resp.json()) as ServerState
}

/** GET /api/v1/health —— 可达性探测。 */
export async function health(base: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/health`)
    return resp.ok
  } catch {
    return false
  }
}

export interface RegisterResult {
  owner_id: number
  name: string
  coords: string
  temp: number | null
  ruleset: string
  token: string
  token_note: string
}

/** POST /api/v1/register —— 自助开档（G1）：自动分配 owner、经典选址、令牌只返回这一次。 */
export async function register(base: string, name: string, fetchImpl: typeof fetch = fetch): Promise<RegisterResult> {
  let resp: Response
  try {
    resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name }),
    })
  } catch (e) {
    throw new Error(`注册网络失败（${String(e)}）`)
  }
  const data = (await resp.json().catch(() => ({}))) as Record<string, any>
  if (resp.status === 201) return data as RegisterResult
  if (resp.status === 409) throw new Error(String(data.error ?? '指挥官代号已被占用'))
  if (resp.status === 422) throw new Error(`输入无效：${data.message ?? '代号需 1-32 字符'}`)
  if (resp.status === 503) throw new Error(String(data.error ?? '服务器未就绪（无 frozen 规则集）'))
  if (resp.status === 429) throw new Error('注册过于频繁，请稍后再试。')
  throw new Error(`注册失败：HTTP ${resp.status}`)
}

/**
 * POST /api/v1/commands —— 统一命令信封（API-01 §1）。
 * 200=committed / 409=rejected（业务拒绝）/ 503=refused（配置闸门）/ 其他=异常。
 */
export async function submitCommand(
  base: string,
  body: Record<string, unknown>,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommandOutcome> {
  let resp: Response
  try {
    resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(token) },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(`命令提交网络失败（${String(e)}）`)
  }
  const data = (await resp.json().catch(() => ({}))) as Record<string, any>
  if (resp.status === 401) {
    throw new Error(String(data.error ?? '未授权：缺少/无效 Token'))
  }
  if (resp.status === 403) {
    throw new Error(String(data.error ?? '禁止：令牌 owner 与请求 owner 不符'))
  }
  if (resp.status === 200 && data.status === 'committed') {
    return { kind: 'committed', result: (data.result ?? {}) as Record<string, unknown> }
  }
  if (resp.status === 409 && data.status === 'rejected') {
    return { kind: 'rejected', reason: String(data.reason ?? '未知拒绝原因') }
  }
  if (resp.status === 503 && data.status === 'refused') {
    return { kind: 'refused', reasons: (data.reasons ?? []) as string[] }
  }
  if (resp.status === 422) {
    throw new Error(`信封形状非法：${data.message ?? 'HTTP 422'}`)
  }
  throw new Error(`命令提交失败：HTTP ${resp.status}`)
}

/** 组装标准信封（owner 直操作；command_id 由浏览器 crypto 生成 UUID）。 */
export function makeEnvelope(ownerId: number, type: string, payload: Record<string, unknown>, rulesetVersion: string): Record<string, unknown> {
  return {
    command_id: crypto.randomUUID(),
    actor: { kind: 'player', actor_id: ownerId },
    owner_id: ownerId,
    type,
    payload,
    ruleset_version: rulesetVersion,
  }
}

/** GET /api/v1/reports?owner_id=N —— 战报读面（最近 20 场涉及该 owner 的战斗）。 */
export interface BattleReport {
  battle_id: string
  command_id: string
  at: string | null
  result: {
    loot?: { M: number; C: number; D: number }
    debris?: { M: number; C: number }
    attacker_survivors?: Record<string, number>
    attacker_losses?: Record<string, number>
    defender_survivors?: Record<string, number>
    defender_losses?: Record<string, number>
    defense_losses?: Record<string, number>
    defense_repaired?: Record<string, number>
  } | null
}

export interface ReportsPayload {
  owner_id: number
  count: number
  battles: BattleReport[]
}

export async function getReports(base: string, ownerId: number, token?: string, fetchImpl: typeof fetch = fetch): Promise<ReportsPayload> {
  let resp: Response
  try {
    resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/reports?owner_id=${ownerId}`, {
      headers: { Accept: 'application/json', ...authHeaders(token) },
    })
  } catch (e) {
    throw new Error(`战报读取网络失败（${String(e)}）`)
  }
  if (resp.status === 401) throw new Error(((await resp.json().catch(() => ({}))) as any).error ?? '未授权')
  if (!resp.ok) throw new Error(`战报读取失败：HTTP ${resp.status}`)
  return (await resp.json()) as ReportsPayload
}

/** GET /api/v1/intel —— 最新侦察快照（G6 模拟器回填源）。 */
export interface IntelSnapshot {
  id: number
  target: string
  observed_at: string | null
  visible: {
    target_exists?: boolean
    resources?: { M: number; C: number; D: number }
    ships?: Record<string, number> | null
    levels?: Record<string, number> | null
    research?: Record<string, number> | null
    meta?: Record<string, unknown>
  } | null
}

export async function getIntel(base: string, ownerId: number, token?: string, fetchImpl: typeof fetch = fetch): Promise<IntelSnapshot[]> {
  let resp: Response
  try {
    resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/intel?owner_id=${ownerId}`, {
      headers: { Accept: 'application/json', ...authHeaders(token) },
    })
  } catch (e) {
    throw new Error(`侦察情报读取网络失败（${String(e)}）`)
  }
  if (resp.status === 401) throw new Error(((await resp.json().catch(() => ({}))) as any).error ?? '未授权')
  if (!resp.ok) throw new Error(`侦察情报读取失败：HTTP ${resp.status}`)
  return ((await resp.json()) as { snapshots: IntelSnapshot[] }).snapshots
}

/** 便捷动作：建造（入队 + 立即尝试启动——付不起时留队，符合 02.2 队列纪律）。 */
export async function buildStructure(
  base: string,
  ownerId: number,
  rulesetVersion: string,
  planetId: number,
  building: string,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommandOutcome[]> {
  const enqueue = await submitCommand(
    base,
    makeEnvelope(ownerId, 'BUILD_ENQUEUE', { planet_id: planetId, building }, rulesetVersion),
    token,
    fetchImpl,
  )
  if (enqueue.kind !== 'committed') return [enqueue]
  const start = await submitCommand(
    base,
    makeEnvelope(ownerId, 'BUILD_START', { planet_id: planetId }, rulesetVersion),
    token,
    fetchImpl,
  )
  return [enqueue, start]
}

/** 便捷动作：研究（RESEARCH_START，文明同时至多 1 项）。 */
export async function researchTech(
  base: string,
  ownerId: number,
  rulesetVersion: string,
  planetId: number,
  tech: string,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommandOutcome> {
  return submitCommand(
    base,
    makeEnvelope(ownerId, 'RESEARCH_START', { planet_id: planetId, tech }, rulesetVersion),
    token,
    fetchImpl,
  )
}

/** 便捷动作：建造防御设施/舰船（SHIP_ORDER 族路由，batch_no 自动生成保证幂等）。 */
export async function buildDefense(
  base: string,
  ownerId: number,
  rulesetVersion: string,
  planetId: number,
  defense: string,
  amount: number,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommandOutcome> {
  return submitCommand(
    base,
    makeEnvelope(ownerId, 'SHIP_ORDER', {
      planet_id: planetId, ship: defense, amount, batch_no: crypto.randomUUID(),
    }, rulesetVersion),
    token,
    fetchImpl,
  )
}

/** 便捷动作：舰队出击（raid/scout/transport/colonize；编队由调用方按在港舰船组装）。 */
export async function dispatchFleet(
  base: string,
  ownerId: number,
  rulesetVersion: string,
  planetId: number,
  mission: 'raid' | 'scout' | 'transport' | 'colonize',
  ships: Record<string, number>,
  target: string,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommandOutcome> {
  return submitCommand(
    base,
    makeEnvelope(ownerId, 'FLEET_DISPATCH', {
      planet_id: planetId, mission, ships, target, speed_pct: 100,
    }, rulesetVersion),
    token,
    fetchImpl,
  )
}

/* ==================== G10 GM 管理后台（X-GM-Key 独立凭据） ==================== */

export interface GmPlayerRow {
  owner_id: number
  name: string
  created_at: string
  planet_count: number
  home_resources: { M: number; C: number; D: number } | null
  banned: boolean
  ban_reason: string | null
}

export interface GmAuditRow {
  id: number
  command_id: string
  type: string
  owner_id: number
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  committed_at: string | null
}

const gmHeaders = (gmKey: string): Record<string, string> => ({
  'X-GM-Key': gmKey,
  'Content-Type': 'application/json',
})

async function gmRequest<T>(base: string, gmKey: string, path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<T> {
  let resp: Response
  try {
    resp = await fetchImpl(`${CLEAN_BASE(base)}/api/v1/gm${path}`, {
      ...init,
      headers: { ...gmHeaders(gmKey), ...(init?.headers ?? {}) },
    })
  } catch {
    throw new Error('无法连接服务器')
  }
  const body = (await resp.json().catch(() => null)) as (T & { error?: string }) | null
  if (!resp.ok) throw new Error(body?.error ?? `请求失败（HTTP ${resp.status}）`)
  return body as T
}

/** GET /api/v1/gm/players?query= —— 玩家列表（名字/owner 搜索）。 */
export async function gmListPlayers(base: string, gmKey: string, query = '', fetchImpl: typeof fetch = fetch): Promise<GmPlayerRow[]> {
  const r = await gmRequest<{ players: GmPlayerRow[] }>(base, gmKey, `/players?query=${encodeURIComponent(query)}`, undefined, fetchImpl)
  return r.players
}

/** POST /api/v1/gm/grant —— 发放资源（可负=扣回；扣至负库存被服务端拒绝）。 */
export async function gmGrant(
  base: string,
  gmKey: string,
  ownerId: number,
  deltas: { M: number; C: number; D: number },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await gmRequest(base, gmKey, '/grant', { method: 'POST', body: JSON.stringify({ owner_id: ownerId, ...deltas }) }, fetchImpl)
}

/** POST /api/v1/gm/level —— 直接设置建筑等级。 */
export async function gmSetLevel(
  base: string,
  gmKey: string,
  ownerId: number,
  planetId: number,
  building: string,
  level: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await gmRequest(base, gmKey, '/level', { method: 'POST', body: JSON.stringify({ owner_id: ownerId, planet_id: planetId, building, level }) }, fetchImpl)
}

/** POST /api/v1/gm/ban | /unban —— 封禁/解封（封禁后该玩家全部请求 403）。 */
export async function gmSetBanned(base: string, gmKey: string, ownerId: number, banned: boolean, reason = '', fetchImpl: typeof fetch = fetch): Promise<void> {
  await gmRequest(base, gmKey, banned ? '/ban' : '/unban', { method: 'POST', body: JSON.stringify({ owner_id: ownerId, reason }) }, fetchImpl)
}

/** POST /api/v1/gm/announce —— 运营公告（玩家 state.announcement 投影）。 */
export async function gmAnnounce(base: string, gmKey: string, message: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await gmRequest(base, gmKey, '/announce', { method: 'POST', body: JSON.stringify({ message }) }, fetchImpl)
}

/** GET /api/v1/gm/audit —— GM 操作日志（game_commands 的 GM_* 行）。 */
export async function gmAudit(base: string, gmKey: string, limit = 50, fetchImpl: typeof fetch = fetch): Promise<GmAuditRow[]> {
  const r = await gmRequest<{ audit: GmAuditRow[] }>(base, gmKey, `/audit?limit=${limit}`, undefined, fetchImpl)
  return r.audit
}
