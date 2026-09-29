/**
 * 战斗模拟器核心（G6）——纯函数层：编队 → battle.ts 规格构建 → 模拟 → 结果摘要。
 *
 * 数值纪律：全部取自 web 线权威 objects.ts 的 SHIPS 表（attacker/defender 编队仅由玩家输入）；
 * 残骸比例沿用 web 线既有 0.3 口径（与服务器 RC1 DEBRIS_RATE 同值，仅展示用）。
 * 同编队 → battle.ts 派生种子 → 结果确定（可复算校对）。
 */
import { simulate, type BattleOutput, type FleetInput, type UnitSpec } from './battle'
import { SHIPS } from './objects'

/** 模拟器可用舰种（web 线 SHIPS 表的可派遣战斗/护航舰） */
// 2026-09-27 补齐超空三舰（215/213/218）——此前模拟器无法推演新舰（bug 排查修复）
export const SIM_SHIP_IDS = [204, 205, 206, 207, 215, 213, 218, 202, 208, 210] as const

export type FleetCounts = Record<number, number>

/** 从 SHIPS 构建 UnitSpec（web 线数值；rapidfire 取 SHIPS 表 engine 同级的 rf 字段，缺省空）。 */
function specOf(shipId: number): UnitSpec {
  const def = SHIPS[shipId]
  return {
    unitId: def.id,
    attack: def.attack,
    shield: def.shield,
    hull: def.hull,
    rapidfire: (def as { rapidfire?: Record<number, number> }).rapidfire ?? {},
  }
}

function fleet(counts: FleetCounts, fleetId: number, ownerId: number): FleetInput {
  const units: FleetInput['units'] = {}
  for (const [id, n] of Object.entries(counts)) {
    const amount = Math.max(0, Math.floor(n))
    if (amount > 0) units[Number(id)] = { spec: specOf(Number(id)), amount }
  }
  return { fleetMissionId: fleetId, ownerId, units }
}

export interface SimulatorResult {
  rounds: number
  attackerSurvivors: FleetCounts
  defenderSurvivors: FleetCounts
  attackerLosses: FleetCounts
  defenderLosses: FleetCounts
  attackerLostValue: number
  defenderLostValue: number
  debrisM: number
  debrisC: number
  /** 攻方是否全灭（守方全灭为胜；双方存活=6 回合平局收场） */
  outcome: 'attacker-win' | 'defender-win' | 'draw'
}

/** 舰船 M/C 成本（web 线 SHIPS 表 cost 字段）。 */
function costOf(shipId: number): { M: number; C: number } {
  const c = (SHIPS[shipId] as { cost?: { metal?: number; crystal?: number } }).cost ?? {}
  return { M: c.metal ?? 0, C: c.crystal ?? 0 }
}

export function runSimulation(attacker: FleetCounts, defender: FleetCounts): SimulatorResult {
  const output: BattleOutput = simulate({
    attackerFleets: [fleet(attacker, 1, 1)],
    defenderFleets: [fleet(defender, 2, 2)],
  })
  const last = output.rounds[output.rounds.length - 1]
  const att = last?.attackerFleetResults?.[1]
  const def = last?.defenderFleetResults?.[2]

  const sum = (r: Record<number, number> | undefined): FleetCounts => {
    const out: FleetCounts = {}
    for (const [id, n] of Object.entries(r ?? {})) if (n > 0) out[Number(id)] = n
    return out
  }
  const attackerSurvivors = sum(att?.unitsResult)
  const defenderSurvivors = sum(def?.unitsResult)
  const attackerLosses = sum(att?.unitsLost)
  const defenderLosses = sum(def?.unitsLost)

  let attLostV = 0
  let defLostV = 0
  let debM = 0
  let debC = 0
  for (const [id, n] of Object.entries(attackerLosses)) {
    const c = costOf(Number(id))
    attLostV += (c.M + 2 * c.C) * n
    debM += c.M * n * 0.3
    debC += c.C * n * 0.3
  }
  for (const [id, n] of Object.entries(defenderLosses)) {
    const c = costOf(Number(id))
    defLostV += (c.M + 2 * c.C) * n
    debM += c.M * n * 0.3
    debC += c.C * n * 0.3
  }

  const alive = (c: FleetCounts) => Object.values(c).reduce((a, b) => a + b, 0)
  const attAlive = alive(attackerSurvivors)
  const defAlive = alive(defenderSurvivors)
  const attStart = alive(attacker)
  const defStart = alive(defender)
  // 空守方=不战而胜（0 回合）；判定以「开战时在场且被清空」为准
  const outcome: SimulatorResult['outcome'] =
    defAlive === 0 && attAlive > 0 ? 'attacker-win'
      : attAlive === 0 && defAlive > 0 ? 'defender-win'
        : defStart === 0 && attStart > 0 ? 'attacker-win'
          : 'draw'

  return {
    rounds: output.rounds.length,
    attackerSurvivors, defenderSurvivors, attackerLosses, defenderLosses,
    attackerLostValue: Math.round(attLostV),
    defenderLostValue: Math.round(defLostV),
    debrisM: Math.round(debM),
    debrisC: Math.round(debC),
    outcome,
  }
}

// ---- G12：Worker 化（模拟器推演移出主线程；不可用时同步回退，结果相同） ----

type SimWorker = Worker & { __simBusy?: boolean }

let worker: SimWorker | null = null
let workerBroken = false
let nextMsgId = 1

function getWorker(): SimWorker | null {
  if (workerBroken) return null
  if (worker !== null) return worker
  try {
    // Vite 原生 Worker 构造（module 模式，打包自动分块）；node 测试环境构造抛错 → 回退
    worker = new Worker(new URL('./battleSimWorker.ts', import.meta.url), { type: 'module' }) as SimWorker
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/** Worker 单飞：一次只跑一个推演（模拟器单按钮语义）。resolve null = Worker 不可用/出错/超时。 */
function runInWorker(attacker: FleetCounts, defender: FleetCounts, timeoutMs = 10000): Promise<SimulatorResult | null> {
  const w = getWorker()
  if (w === null || w.__simBusy) return Promise.resolve(null)
  const id = nextMsgId++
  w.__simBusy = true

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      w.removeEventListener('message', onMsg)
      w.__simBusy = false
      workerBroken = true   // 超时视为 Worker 环境不可靠，后续走同步
      resolve(null)
    }, timeoutMs)

    const onMsg = (ev: MessageEvent<{ id: number; result?: SimulatorResult; error?: string }>) => {
      if (ev.data.id !== id) return
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      w.__simBusy = false
      if (ev.data.error) {
        workerBroken = true
        resolve(null)
        return
      }
      resolve(ev.data.result ?? null)
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ id, attacker, defender })
  })
}

/**
 * 异步推演入口（UI 用）：优先 Worker（主线程零卡顿），
 * Worker 不可用/超时/出错 → 同步回退（确定性引擎，结果相同）。
 */
export async function runSimulationAsync(attacker: FleetCounts, defender: FleetCounts): Promise<SimulatorResult> {
  const viaWorker = await runInWorker(attacker, defender)
  return viaWorker ?? runSimulation(attacker, defender)
}

/**
 * 侦察报告回填：server intel 快照 visible_fields.ships（键=舰名或 unit_id 字符串）
 * → FleetCounts（unit_id 数字键）。未揭示（null/缺 ships）返回空并注明。
 */
export function fleetFromIntel(visibleShips: unknown): { counts: FleetCounts; note: string } {
  if (!visibleShips || typeof visibleShips !== 'object') {
    return { counts: {}, note: '该报告未揭示舰船（探针数不足或反侦察）' }
  }
  const nameToId: Record<string, number> = {}
  for (const id of SIM_SHIP_IDS) nameToId[SHIPS[id].name] = id
  // 服务端 intel 键为英文舰名（LIGHT/HEAVY/SCOUT/SMALL_CARGO/COLONY）——一并映射
  Object.assign(nameToId, {
    LIGHT: 204, HEAVY: 205, CRUISER: 206, BATTLESHIP: 207,
    SMALL_CARGO: 202, COLONY: 208, SCOUT: 210,
  })
  const counts: FleetCounts = {}
  let matched = 0
  let unmatched: string[] = []
  for (const [k, v] of Object.entries(visibleShips as Record<string, unknown>)) {
    const n = Math.max(0, Math.floor(Number(v)))
    if (n <= 0) continue
    const byId = /^\d+$/.test(k) && (SIM_SHIP_IDS as readonly number[]).includes(Number(k)) ? Number(k) : undefined
    const id = byId ?? nameToId[k] // 数字键优先，舰名兜底
    if (id !== undefined) {
      counts[id] = (counts[id] ?? 0) + n
      matched++
    } else {
      unmatched.push(k)
    }
  }
  const note = matched > 0
    ? `已回填 ${matched} 类舰船` + (unmatched.length ? `（未识别：${unmatched.join('、')}）` : '')
    : '报告中无可识别舰船'
  return { counts, note }
}
