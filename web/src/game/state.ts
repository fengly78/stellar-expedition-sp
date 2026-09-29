import { create } from 'zustand'
import { simulate, type BattleInput, type BattleOutput, type FleetInput, type UnitSpecWithAmount } from './battle'
import { SYSTEM_COUNT, counterattackFleet, generateAllNpcs, npcDynamicGrowth, npcEspionageTech, npcKey, npcRegen, pirateFleet, type NpcPlanet } from './npc'
import { initialDeposits, settleDeposits, type OreDeposits } from './oreDeposit'
import { hash32, mulberry32 } from './prng'
import { CAMPAIGN_STAGES, CAMPAIGN_ELITE_STAGES } from './campaign'
import {
  BUILDINGS, DEFENSES, DEFENSE_FIELDS, OFFICERS, POS_COEF, SHIPS, TECHS, buildingCost, buildingTime, distance, espionageReveal, flightTime,
  fleetCargo, fleetFuel, fleetSlots, colonyCap, isDefense, isMissile, maxFields, meetsRequires, metalProduction, crystalProduction, deuteriumProduction,
  researchTime, canResearch, shipBuildTime, siloCapacity, unitBattleSpec, unitCost, shipSpeed, solarOutput, storageCapacity,
  energyConsumption, techCost, usedFields, planetProduction,
  type Coordinate, type Resource,
} from './objects'
import { ACHIEVEMENTS, emptyStats, type GameStats } from './achievements'
import { TUTORIAL_STEPS, type TutorialReward } from './tutorial'
import { saveSlotKey } from './accounts'
import { toast } from './toasts'
import { sfx } from './audio'
import { translate, translateTerm, translatePlanetName, localizeField, listSep } from './i18n'

export type MissionType = 'transport' | 'deploy' | 'colonize' | 'espionage' | 'attack' | 'recycle' | 'expedition' | 'missile'
// 单难度（真人+AI 共服，统一标定）。保留字面量类型便于旧存档与外部类型注释不报错。
export type Difficulty = 'normal'

export interface QueueItem {
  objectId: number
  level: number
  startAt: number
  finishAt: number
  /** 已暂停时冻结的剩余毫秒数；finishAt 保留原值但被 tick 跳过，恢复时重算 */
  pausedRemaining?: number
}

export interface ShipQueueItem {
  shipId: number
  count: number
  startAt: number
  finishAt: number
}

export const BUILD_SLOTS = 3

/**
 * 船坞产线（线程）数量。
 *
 * 此前 UI 渲染 3 条线程并以 3 禁用按钮，而 store 的 buildShips 却放行到 5 条——
 * 多出的 2 条玩家在页面上永远看不到（属于幽灵队列）。抽成常量由两端共用。
 */
export const SHIP_SLOTS = 3

/**
 * 科研线程数量。
 *
 * 与 BUILD_SLOTS / SHIP_SLOTS 同样的处理：此前这里是三处散落的裸数字
 * （state.ts 判定、Research.tsx 的 `/2` 文案、`[0,1].map` 线程渲染），
 * 抽成常量避免将来调整时漏改一处——这正是 SHIP_SLOTS 幽灵队列的成因。
 *
 * 注意：科研线程数**与实验室等级无关**。实验室（建筑 31）只影响两件事：
 *   canResearch(level, labLevel)   —— 实验室等级须高于待研究科技等级
 *   researchTime(..., labLevel)    —— 实验室等级进入时间公式做除数
 * 经典 OGame 中实验室等级直接决定科研位数量（Lv.N = N 个位），本项目未采用，
 * 属明确的设计决定而非遗漏。若将来要对齐原版，改这里并同步 Research.tsx。
 */
export const RESEARCH_SLOTS = 2

export interface Planet {
  id: number
  name: string
  coords: Coordinate
  isHome: boolean
  isMoon?: boolean
  temperatureMax: number
  posCoef?: { metal: number; crystal: number; deuterium: number }
  resources: Resource
  lastTick: number
  buildings: Record<number, number>
  ships: Record<number, number>
  defenses: Record<number, number>
  buildingQueue: QueueItem[]
  shipQueue: ShipQueueItem[]
  lastJumpAt?: number
  /** 月球直径（km，经典公式 3000+概率%×273 ±10%；仅 isMoon 有意义） */
  moonDiameter?: number
  /** 矿脉储量（CR-2026-09-27-ORE 决策 A）：缺省 = 满储量（老存档兼容，永不惩罚旧档） */
  oreDeposits?: OreDeposits
}

/**
 * 已废弃的等待预约条目形状（2026-09-28 移除）。
 *
 * 仅供 migrateToV11 读取老存档残留字段并退款，不再是活跃数据结构；
 * 新存档不会写入，Planet 上也不再声明 buildingWaitQueue。
 */
export interface WaitItem {
  objectId: number
  /** 预约时刻（gameTime），仅用于排序展示 */
  queuedAt: number
}

export interface FleetMission {
  id: number
  type: MissionType
  originId: number
  from: Coordinate
  to: Coordinate
  fleet: Record<number, number>
  cargo: Resource
  departAt: number
  arriveAt: number
  // 'done'（2026-09-28）：就地结算并终结的 mission（目前仅 deploy 成功驻扎）。
  // 它不参与「到达」与「返航」判定，由 tick 末尾统一移除。缺这个状态时，
  // 成功驻扎的 mission 会永久停在 'out' 且 arriveAt 已过期，每次 tick 重复触发到达分支。
  phase: 'out' | 'back' | 'done'
  returnAt?: number
  npcOwned?: boolean
  missileCount?: number
}

export interface BattleReportData {
  kind: 'battle'
  id: number
  time: number
  wallAt: number
  coords: Coordinate
  targetName: string
  input: BattleInput
  output: BattleOutput
  loot: Resource
  debris: { metal: number; crystal: number }
  result: 'win' | 'loss' | 'draw'
  defense?: boolean
}

export interface ExpeditionReportData {
  kind: 'expedition'
  id: number
  time: number
  wallAt: number
  coords: Coordinate
  outcome: string
  gained?: Resource
  gainedShips?: Record<number, number>
  shipsLost?: number
}

// 侦察报告只记录"这一档情报是否揭示"，未揭示的字段保持 undefined。
// UI 必须按字段存在性渲染，绝不能回退到直接读 npc.fleet / npc.defenses。
export interface EspionageReportData {
  kind: 'espionage'
  id: number
  time: number
  wallAt: number
  coords: Coordinate
  targetName: string
  depth: number
  fleetTotal?: number
  fleet?: Record<number, number>
  defenseTotal?: number
  resources?: Resource
  probesLost?: number
}

export interface MissileReportData {
  kind: 'missile'
  id: number
  time: number
  wallAt: number
  coords: Coordinate
  targetName: string
  fired: number
  intercepted: number
  destroyed: Record<number, number>
}

export type Report = BattleReportData | EspionageReportData | ExpeditionReportData | MissileReportData

export interface OfficerState {
  hiredAt: number
  nextUpkeepAt: number
}

export interface SaveData {
  planets: Planet[]
  techs: Record<number, number>
  researchQueue: QueueItem[]
  missions: FleetMission[]
  reports: Report[]
  npcs: Record<string, NpcPlanet>
  debrisFields: Record<string, { metal: number; crystal: number }>
  stats: GameStats
  achievements: number[]
  tutorialDone: number[]
  /** 玩家主动跳过了新手引导。老存档没有此字段，读取时按 false 处理。 */
  tutorialSkipped?: boolean
  officers: Record<string, OfficerState>
  lastDailyClaimWallAt: number
  dailyStreak: number
  campaignDone: number[]
  campaignEliteDone: number[]
  activeEvent?: { type: 'flare'; endsAt: number }
  lastEventRoll: number
  nextId: number
  saveVersion: number
  gameTime: number
  lastWallTick: number
  timeScale: number
  difficulty: Difficulty
  createdWallAt: number
}

export interface SlotMeta {
  savedWallAt: number
  label: string
  gameTime: number
  difficulty: Difficulty
  planetCount: number
}

interface SlotFile {
  meta: SlotMeta
  data: SaveData
}

// 单难度：本地单机 + AI 对手，统一一套数值标定。
// 起始资源 1千万×3（2026-09-25 用户指示的沙盒开局：跳过前期攒资源，直达舰队/殖民/战斗内容）。
// 仓库必须预置到能容纳 1千万（2^10 × 1e4 = 1.024e7），否则 produce 首个 tick 就会把资源 clamp 到 1e4。
//
// label/desc 配套 `labelEn`/`descEn`（2026-09-29）：这两个串是玩家在 LoadScreen 存档列表里
// 直接读到的文案，此前只有中文，EN 存档列表整行中文。
export interface DifficultyDef {
  label: string
  labelEn: string
  npcRes: number
  npcFleet: number
  startRes: Resource
  desc: string
  descEn: string
}
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  normal: {
    label: '标准', labelEn: 'Standard',
    npcRes: 1, npcFleet: 1, startRes: { metal: 10_000_000, crystal: 10_000_000, deuterium: 10_000_000 },
    desc: '本地单机 · AI 对手 · 标准难度', descEn: 'Local single-player · AI opponents · Standard difficulty',
  },
}

/**
 * 存档槽位名。配套 `nameEn`（2026-09-29）——消费点是 LoadScreen 的槽位标题与
 * 删除确认弹窗、GameScreen 的「保存到槽位」按钮，此前 EN 下全是中文。
 */
export interface SlotName {
  name: string
  nameEn: string
}
export const SLOT_NAMES: SlotName[] = [
  { name: '自动存档', nameEn: 'Auto Save' },
  { name: '存档一', nameEn: 'Save 1' },
  { name: '存档二', nameEn: 'Save 2' },
  { name: '存档三', nameEn: 'Save 3' },
]

const OFFLINE_CAP_MS = 12 * 3600 * 1000

// 新手保护期：从 createdWallAt 起 7 天，期间任何一方（玩家/NPC/AI）都不能攻击或探测玩家的星球。
// 用墙钟时间而不是 gameTime，暂停或低倍速游戏期间 NPC 也不会"保护失效"——对玩家公平。
const NEWBIE_SHIELD_MS = 7 * 24 * 3600 * 1000

function isNewbieShieldActive(createdWallAt: number, now = Date.now()): boolean {
  return now - createdWallAt < NEWBIE_SHIELD_MS
}

// 判断一组坐标是否指向玩家星球（不是 NPC）。NPC 的"星球"不存在于 s.planets，
// 玩家拥有的殖民地/月亮则全部都在 s.planets 里。月球与殖民地的 isHome 字段为 false。
function isPlayerPlanetTarget(s: GameStore, to: Coordinate): boolean {
  return s.planets.some((p) => p.coords.galaxy === to.galaxy && p.coords.system === to.system && p.coords.position === to.position)
}

function newPlanet(id: number, name: string, coords: Coordinate, isHome: boolean, isMoon = false): Planet {
  return {
    id, name, coords, isHome, isMoon,
    temperatureMax: isHome ? 130 : isMoon ? 130 : 200 - 10 * coords.position,
    posCoef: isHome || isMoon ? { metal: 1, crystal: 1, deuterium: 1 } : { ...(POS_COEF[coords.position] ?? { metal: 1, crystal: 1, deuterium: 1 }) },
    resources: isHome ? { metal: 6000, crystal: 2500, deuterium: 3000 } : { metal: 0, crystal: 0, deuterium: 0 },
    lastTick: 0,
    buildings: isHome || isMoon ? {} : { 4: 1 },
    ships: {},
    defenses: {},
    buildingQueue: [],
    shipQueue: [],
  }
}

export function moonAt(planets: Planet[], coords: Coordinate): Planet | undefined {
  return planets.find((p) => p.isMoon && p.coords.galaxy === coords.galaxy && p.coords.system === coords.system && p.coords.position === coords.position)
}

// 月球凝聚（经典口径：每 10 万残骸 1% 概率，上限 20%）——两条战斗结算路径共用。
// 此前 roll 只挂在「NPC 来袭」分支，玩家主动攻击的残骸永远不会凝月（死代码缺陷），
// 2026-09-25 提取为共用判定：只要战斗发生在同一坐标沉淀出足够残骸，双方都可能见证月球。
function spawnMoonFromDebris(
  planets: Planet[],
  debris: { metal: number; crystal: number } | undefined,
  to: Coordinate,
  gameNow: number,
  nextId: number,
  targetName: string,
  temperatureMax: number,
): { moon: Planet; nextId: number } | null {
  const totalDebris = debris ? debris.metal + debris.crystal : 0
  if (totalDebris < 100000 || moonAt(planets, to)) return null
  const chance = Math.min(0.2, totalDebris / 100000 / 100)
  if (!(mulberry32(hash32(gameNow, totalDebris))() < chance)) return null
  const moon = newPlanet(nextId, `${targetName}之月`, to, false, true)
  moon.temperatureMax = temperatureMax
  moon.lastTick = gameNow
  // 月直径（经典口径，公式同 ogame-vue-ts moonLogic）：3000 + 概率%×273，±10% 波动
  // 用凝月 roll 同源 rng 取波动（确定性——我们的回放纪律，vue-ts 的 Math.random 不采用）
  const chancePct = Math.round(chance * 100)
  const fluctuation = 0.9 + mulberry32(hash32(gameNow, totalDebris, 0x00d))() * 0.2
  moon.moonDiameter = Math.max(3476, Math.min(8944, Math.floor((3000 + chancePct * 273) * fluctuation)))
  return { moon, nextId: nextId + 1 }
}

// 传感器阵列射程 = 等级²−1 个系统（OGameX PhalanxService.php），系统号环形回绕。
// Lv1=0（只能看本星系自身坐标）、Lv2=3、Lv3=8、Lv4=15。
// 注意 Phalanx 扫的是「移动中的舰队」，不是星球驻军——原版也从不泄露驻军。
export function phalanxLevel(planets: Planet[], galaxy: number, system: number): number {
  let best = 0
  for (const p of planets) {
    if (!p.isMoon) continue
    const lv = p.buildings[42] ?? 0
    if (lv <= 0 || p.coords.galaxy !== galaxy) continue
    const range = lv * lv - 1
    const raw = Math.abs(p.coords.system - system)
    const dist = Math.min(raw, SYSTEM_COUNT - raw)
    if (dist <= range) best = Math.max(best, lv)
  }
  return best
}

export const PHALANX_SCAN_COST = 5000

function newGameData(): SaveData {
  const d = DIFFICULTIES.normal
  const home = newPlanet(1, '母星', { galaxy: 1, system: 8, position: 3 }, true)
  home.resources = { ...d.startRes }
  // 三系仓库预置 Lv.10（各 1024 万容量）兜住 1千万 起始资源；教程仓储步骤对老开局仍有意义，
  // 沙盒开局下则表示"容量已跟上存量"，继续升级仍会扩大上限。
  home.buildings = { ...home.buildings, 22: 10, 23: 10, 24: 10 }
  return {
    planets: [home],
    techs: {},
    researchQueue: [],
    missions: [],
    reports: [],
    npcs: generateAllNpcs(d.npcRes, d.npcFleet),
    debrisFields: {},
    stats: emptyStats(),
    achievements: [],
    tutorialDone: [],
    tutorialSkipped: false,
    officers: {},
    lastDailyClaimWallAt: 0,
    dailyStreak: 0,
    campaignDone: [],
    campaignEliteDone: [],
    lastEventRoll: 0,
    nextId: 2,
    saveVersion: 11,
    gameTime: 0,
    lastWallTick: Date.now(),
    timeScale: 1,
    difficulty: 'normal',
    createdWallAt: Date.now(),
  }
}

export function listSlots(): (SlotMeta | null)[] {
  const out: (SlotMeta | null)[] = []
  for (let slot = 0; slot <= 3; slot++) {
    const key = saveSlotKey(slot)
    if (!key) {
      out.push(null)
      continue
    }
    try {
      const raw = localStorage.getItem(key)
      out.push(raw ? (JSON.parse(raw) as SlotFile).meta : null)
    } catch {
      out.push(null)
    }
  }
  return out
}

export function deleteSlot(slot: number): void {
  const key = saveSlotKey(slot)
  if (key) localStorage.removeItem(key)
}

export function exportSlot(slot: number): void {
  const key = saveSlotKey(slot)
  if (!key) return
  const raw = localStorage.getItem(key)
  if (!raw) return
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stellar-expedition-save-slot${slot}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 存档版本区间。`saveVersion` 缺失（undefined）不在 [2,11] 内，必须按不兼容处理。 */
export const SAVE_VERSION_MIN = 2
export const SAVE_VERSION_MAX = 11

/**
 * 存档结构的**单一校验真值源**：返回可读错误或 null。
 *
 * 2026-09-29 新增。此前三条入口各写各的校验，标准不一致，导致两条高危路径：
 *   · importSlot 只查 `parsed.data` 存在 + 版本区间，**不查 `planets` 是不是数组**。
 *     任意垃圾 JSON 会被写入槽位并返回 null（UI 弹「导入成功」），
 *     直接覆盖掉原本正常的存档；之后 loadFromSlot 只能报「存档已损坏」，原档不可恢复。
 *   · 版本闸写作 `saveVersion < 2 || saveVersion > 11`。字段**缺失**时两个比较都是
 *     false（undefined < 2 和 undefined > 11 都为 false），存档被当作合法放行；
 *     随后 9 级 `if (d.saveVersion === N)` 因 undefined !== 2..10 全部跳过，
 *     planet 上的 shipQueue/posCoef/isMoon/defenses 不补齐，
 *     进入游戏后主循环首个 tick() 即抛 TypeError，且每 tick 都抛——游戏不可玩。
 * 所以这里用 `typeof === 'number'` 把「缺失」和「越界」一并挡掉，并强制校验 planets 数组。
 */
function saveFileProblem(parsed: unknown, prefix = ''): string | null {
  if (!parsed || typeof parsed !== 'object') return `${prefix}${translate('err.saveBadShape')}`
  const f = parsed as Partial<SlotFile>
  const d = f.data as Partial<SaveData> | undefined
  if (!d || typeof d !== 'object') return `${prefix}${translate('err.saveBadShape')}`
  if (typeof d.saveVersion !== 'number' || !Number.isFinite(d.saveVersion)) {
    return `${prefix}${translate('err.saveVersionMismatch')}`
  }
  if (d.saveVersion < SAVE_VERSION_MIN || d.saveVersion > SAVE_VERSION_MAX) {
    return `${prefix}${translate('err.saveVersionMismatch')}`
  }
  // planets 是主循环与所有页面的数据根；不是数组时后面必崩，必须在这里挡掉。
  if (!Array.isArray(d.planets) || d.planets.length === 0) return `${prefix}${translate('err.saveBadShape')}`
  return null
}

export function importSlot(slot: number, file: File): Promise<string | null> {
  return file.text().then((raw) => {
    try {
      // 2026-09-29：先完整校验再落盘。原先校验不足，垃圾文件会覆盖正常存档且报「成功」。
      const problem = saveFileProblem(JSON.parse(raw))
      if (problem) return problem
      const key = saveSlotKey(slot)
      if (!key) return translate('err.notLoggedIn')
      localStorage.setItem(key, raw)
      return null
    } catch {
      return translate('err.saveInvalid')
    }
  })
}

// G8 云备份：原始槽位读写（不经运行中的 store，恢复后由玩家从主菜单重新载入）
export function allSlotFilesRaw(): { slot: number; label: string; json: string }[] {
  const out: { slot: number; label: string; json: string }[] = []
  for (let slot = 0; slot <= 3; slot++) {
    const key = saveSlotKey(slot)
    if (!key) continue
    const raw = localStorage.getItem(key)
    // label 落进存档 meta，随存档一起持久化 —— 一律用中文 name（与 UI 语言无关），
    // 否则同一份存档会因创建时的界面语言不同而 meta.label 不同。
    if (raw) out.push({ slot, label: SLOT_NAMES[slot]?.name ?? `存档${slot}`, json: raw })
  }
  return out
}

export function writeSlotRaw(slot: number, rawJson: string): string | null {
  let parsed: SlotFile
  try {
    parsed = JSON.parse(rawJson) as SlotFile
  } catch {
    return translate('err.cloudNotJson')
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.meta) return translate('err.cloudBadShape')
  // 与 importSlot / loadFromSlot 走同一校验器，标准不再各写各的。
  const problem = saveFileProblem(parsed, translate('err.cloudPrefix'))
  if (problem) return problem
  const key = saveSlotKey(slot)
  if (!key) return translate('err.notLoggedIn')
  try {
    localStorage.setItem(key, rawJson)
  } catch {
    // 2026-09-29：原先无 try/catch，配额满时 QuotaExceededError 逃出 restoreSlotFromCloud，
    // SettingsScreen 的 async onClick 也不捕获 → unhandled rejection 且 setCloudBusy(false)
    // 不执行，云备份按钮永久 disabled，须刷新页面。
    return translate('err.cloudRestoreQuota')
  }
  return null
}

function snapshot(s: GameStore): SaveData {
  return {
    planets: s.planets,
    techs: s.techs,
    researchQueue: s.researchQueue,
    missions: s.missions,
    reports: s.reports,
    npcs: s.npcs,
    debrisFields: s.debrisFields,
    stats: s.stats,
    achievements: s.achievements,
    tutorialDone: s.tutorialDone,
    tutorialSkipped: s.tutorialSkipped,
    officers: s.officers,
    lastDailyClaimWallAt: s.lastDailyClaimWallAt,
    dailyStreak: s.dailyStreak,
    campaignDone: s.campaignDone,
    campaignEliteDone: s.campaignEliteDone,
    activeEvent: s.activeEvent,
    lastEventRoll: s.lastEventRoll,
    nextId: s.nextId,
    saveVersion: 11,
    gameTime: s.gameTime,
    lastWallTick: Date.now(),
    timeScale: s.timeScale,
    difficulty: s.difficulty,
    createdWallAt: s.createdWallAt,
  }
}

function writeSlot(slot: number, data: SaveData, label: string): boolean {
  const key = saveSlotKey(slot)
  if (!key) return false
  const meta: SlotMeta = {
    savedWallAt: Date.now(),
    label,
    gameTime: data.gameTime,
    difficulty: data.difficulty,
    planetCount: data.planets.length,
  }
  try {
    localStorage.setItem(key, JSON.stringify({ meta, data } satisfies SlotFile))
    return true
  } catch {
    toast(translate('toast.saveQuota'), 'error')
    // 2026-09-29：原先返回 void，调用方无从得知失败，saveToSlot 会在失败后再弹一条
    // 「已保存到…」的绿色成功提示——配额满时玩家同时看到红绿两条 toast，槽位却是空的。
    return false
  }
}

// 周期兜底自动存档（墙钟），配合 tick 末尾的落库逻辑。
const AUTO_SAVE_INTERVAL_MS = 60_000
let lastAutoSaveWallAt = 0

export interface ResDelta { metal: number; crystal: number; deuterium: number }
export interface ResourceGrant {
  /** 入账后的实际库存（已按仓容封顶） */
  resources: ResDelta
  /** 因超出仓容而被丢弃的部分；正常运作为 0 */
  overflow: ResDelta
}

const RES_KEYS = ['metal', 'crystal', 'deuterium'] as const

/**
 * 资源入账的**单一真值源**（纯函数，不改传入的 planet）。
 *
 * 2026-09-29 修复：原先舰队缴获、运输卸货、取消建造/研究退款，以及签到、成就、
 * 教程奖励、战役首通、流星雨、交易收益侧，全部直接写 `resources.metal += ...`，
 * 不做任何封顶；而 produce() 每 tick 用 `Math.min(仓容, 存量+产量)` 把超出部分
 * **静默抹掉**。后果：任何超仓的入账，玩家既看不到提示、也拿不回来——
 * 例如 Lv0 仓（10000）的殖民地收到 10 艘小型运输（货舱 50000）卸载时，
 * 进 27500、出 10000，17500 凭空蒸发。交易更糟：收益被削为 0 而付出已真实扣除，
 * 玩家净损失。
 *
 * 这里把「仓容是硬上限」这一既有平衡口径原样保留（入账方向不会超过仓容），
 * 只把**销毁时点**从「下一 tick 的暗处」搬到「入账的明处」，并把丢弃量
 * 如实返回，供调用方提示玩家。不改变任何数值平衡，只消除静默数据丢失。
 *
 * 关键细节：**只封顶 `gain` 里显式给出的资源**。若连带把未入账的资源也夹回上限，
 * 就会产生意外销毁——沙盒开局给 1000 万资源的玩家发 500 晶体时，
 * 顺手把他超上限的 990 万金属抹平，性质上仍是「静默吞掉玩家资产」。
 * 未入账资源的超上限状态交给 produce() 按原有节奏处理。
 */
export function grantResources(planet: Planet, gain: Partial<ResDelta>, cmdMul = 1): ResourceGrant {
  const b = planet.buildings
  const caps = {
    metal: storageCapacity(b[22] ?? 0) * cmdMul,
    crystal: storageCapacity(b[23] ?? 0) * cmdMul,
    deuterium: storageCapacity(b[24] ?? 0) * cmdMul,
  }
  const r = planet.resources
  const resources = { ...r }
  const overflow = { metal: 0, crystal: 0, deuterium: 0 }
  for (const k of RES_KEYS) {
    const amount = gain[k]
    if (amount === undefined) continue // 未入账的资源保持原样，不顺手夹取
    const want = r[k] + amount
    // 下限 0：重氢为净额，聚变燃耗可能把库存压到负；上限仓容：硬顶。
    const got = Math.min(caps[k], Math.max(0, want))
    resources[k] = got
    overflow[k] = want - got
  }
  return { resources, overflow }
}

/** 溢出量的可读文案；全为 0 时返回 null（调用方据此决定要不要提示）。 */
export function overflowText(overflow: ResDelta): string | null {
  // 用完整千分位而非 k/M 缩写：提示的是玩家实实在在损失掉的量，必须精确（对齐 Buildings.tsx 的 fmtFull 口径）。
  const n = (v: number): string => Math.round(v).toLocaleString('en-US')
  const parts: string[] = []
  if (overflow.metal >= 1) parts.push(`${resLabel('metal')} ${n(overflow.metal)}`)
  if (overflow.crystal >= 1) parts.push(`${resLabel('crystal')} ${n(overflow.crystal)}`)
  if (overflow.deuterium >= 1) parts.push(`${resLabel('deuterium')} ${n(overflow.deuterium)}`)
  return parts.length ? parts.join(listSep()) : null
}

/**
 * 资源超出仓容的统一提示口径。
 *
 * `prefixKey` 传的是**语言包键**而不是已翻译的文案：调用点分散在 tick 与各 action 里，
 * 此前每个调用点各写一个中文字面量，EN 下七处全是中文，且新增调用点极易再漏一个。
 */
export function warnOverflow(overflow: ResDelta, prefixKey = 'toast.overflowDefault'): void {
  const t = overflowText(overflow)
  if (t) toast(translate('toast.overflowLost', { prefix: translate(prefixKey), list: t }), 'error')
}

function produce(planet: Planet, techs: Record<number, number>, gameNow: number, officers: Record<string, OfficerState>, flare: boolean): void {
  const dtHours = (gameNow - planet.lastTick) / 3600000
  if (dtHours <= 0) return
  planet.lastTick = gameNow

  const cmdMul = officers.commander ? 1.1 : 1
  // 矿脉（CR-2026-09-27-ORE 决策 A）：老档懒初始化为满储量——首步结算即开始正常消耗；
  // 效率因子经 planetProduction 单一真值源生效（结算与所有 UI 展示同口径）。
  if (planet.oreDeposits === undefined) planet.oreDeposits = initialDeposits(planet.coords)
  const oreInitial = initialDeposits(planet.coords)
  const p = planetProduction(planet, techs, { officers, flare, oreInitial })

  // 入账统一走 grantResources（与缴获/卸货/退款同一真值源），封顶口径只有一份。
  // 重氢为净额：聚变燃耗是固定运营成本，不吃能源打折/地质学家加成。
  planet.resources = grantResources(
    planet,
    {
      metal: p.metal * dtHours,
      crystal: p.crystal * dtHours,
      deuterium: p.deuterium * dtHours,
    },
    cmdMul,
  ).resources

  planet.oreDeposits = settleDeposits(planet.oreDeposits, oreInitial, p, dtHours * 3600000)
}

export function buildFleetInput(fleet: Record<number, number>, techs: Record<number, number>, missionId: number): FleetInput {
  const units: Record<number, UnitSpecWithAmount> = {}
  for (const id in fleet) {
    if (fleet[+id] > 0) units[+id] = { spec: unitBattleSpec(+id, techs), amount: fleet[+id] }
  }
  return { fleetMissionId: missionId, ownerId: 0, units }
}

function npcDefenderInput(npc: NpcPlanet, missionId: number): FleetInput {
  const units: Record<number, UnitSpecWithAmount> = {}
  for (const id in npc.fleet) {
    if (npc.fleet[+id] > 0) units[+id] = { spec: unitBattleSpec(+id, {}), amount: npc.fleet[+id] }
  }
  for (const id in npc.defenses) {
    if (isMissile(+id)) continue
    if (npc.defenses[+id] > 0) units[+id] = { spec: unitBattleSpec(+id, {}), amount: npc.defenses[+id] }
  }
  return { fleetMissionId: missionId, ownerId: 1, units }
}

function playerDefenderInput(planet: Planet, techs: Record<number, number>, missionId: number, engineer: boolean): FleetInput {
  const units: Record<number, UnitSpecWithAmount> = {}
  for (const id in planet.ships) {
    if (planet.ships[+id] > 0) units[+id] = { spec: unitBattleSpec(+id, techs), amount: planet.ships[+id] }
  }
  for (const id in planet.defenses) {
    if (isMissile(+id)) continue
    if (planet.defenses[+id] > 0) {
      const spec = unitBattleSpec(+id, techs)
      if (engineer) {
        spec.shield *= 1.15
        spec.hull *= 1.15
      }
      units[+id] = { spec, amount: planet.defenses[+id] }
    }
  }
  return { fleetMissionId: missionId, ownerId: 0, units }
}

function debrisFromLosses(attackerLosses: Record<number, number>, defenderLosses: Record<number, number>): { metal: number; crystal: number } {
  let metal = 0
  let crystal = 0
  for (const losses of [attackerLosses, defenderLosses]) {
    for (const id in losses) {
      if (isDefense(+id)) continue
      const c = unitCost(+id)
      metal += c.metal * losses[+id] * 0.3
      crystal += c.crystal * losses[+id] * 0.3
    }
  }
  return { metal: Math.round(metal), crystal: Math.round(crystal) }
}

function checkProgress(state: SaveData): { achievements: number[]; tutorialDone: number[]; changed: boolean } {
  let changed = false
  const achievements = [...state.achievements]
  const tutorialDone = [...state.tutorialDone]

  const home = state.planets.find((p) => p.isHome) ?? state.planets[0]
  const totalShips = state.planets.reduce((sum, p) => sum + Object.values(p.ships).reduce((a, b) => a + b, 0), 0)
  const totalDefenses = state.planets.reduce((sum, p) => sum + Object.values(p.defenses).reduce((a, b) => a + b, 0), 0)
  const ownedTypes = new Set<number>()
  for (const p of state.planets) for (const id in p.ships) if (p.ships[+id] > 0) ownedTypes.add(+id)

  const grant = (reward: TutorialReward) => {
    if (!home) return
    if (reward.resources) {
      // 2026-09-29：裸 += 不封顶，超仓部分会被下一 tick 的 produce() 静默削掉，
      // 玩家点完教程却拿不到奖励。与成就奖励同处一个函数，此前一并遗漏。
      const g = grantResources(home, {
        metal: reward.resources.metal ?? 0,
        crystal: reward.resources.crystal ?? 0,
        deuterium: reward.resources.deuterium ?? 0,
      }, state.officers.commander ? 1.1 : 1)
      home.resources = g.resources
      warnOverflow(g.overflow, 'toast.overflowTutorial')
    }
    if (reward.ships) {
      for (const idStr of Object.keys(reward.ships)) {
        const id = +idStr
        home.ships[id] = (home.ships[id] ?? 0) + reward.ships[id]
      }
    }
  }

  // 舰船类步骤用「星球上有 / 舰队带着 / 已出报告」三选一判定：
  // 造出来就立刻派出去的话，停留在星球上的数量会是 0，只查 ships 会漏判。
  const hasShip = (id: number) =>
    state.planets.some((p) => (p.ships[id] ?? 0) >= 1) || state.missions.some((m) => (m.fleet[id] ?? 0) > 0)

  const tutorialChecks: Record<number, boolean> = {
    1: (home?.buildings[1] ?? 0) >= 1,   // 金属矿
    2: (home?.buildings[4] ?? 0) >= 1,   // 太阳能电站
    3: (home?.buildings[2] ?? 0) >= 1,   // 晶体矿
    4: (home?.buildings[22] ?? 0) >= 1,  // 金属仓库
    5: (home?.buildings[14] ?? 0) >= 1,  // 机器人工厂
    6: (home?.buildings[31] ?? 0) >= 1,  // 研究实验室
    7: (state.techs[115] ?? 0) >= 1,     // 燃烧引擎
    8: (home?.buildings[21] ?? 0) >= 1,  // 船坞
    9: hasShip(204),                      // 轻型战斗机
    10: hasShip(210) || state.reports.some((r) => r.kind === 'espionage'), // 间谍探测器
    11: state.reports.some((r) => r.kind === 'espionage'),
    12: state.stats.battlesWon >= 1,
    13: state.campaignDone.length >= 1,            // 战役首通
    14: Object.keys(state.officers).length >= 1,   // 雇佣首位军官
    15: state.stats.expeditions >= 1,              // 首次远征
  }
  for (const step of TUTORIAL_STEPS) {
    if (state.tutorialSkipped) break
    if (!tutorialDone.includes(step.id) && tutorialChecks[step.id]) {
      tutorialDone.push(step.id)
      grant(step.reward)
      // 教程步骤名与奖励舰船名都走数据表的 En 字段——直接用 step.title / SHIPS[].name
      // 会让 EN 玩家在完成提示里读到中文。
      const shipDesc = step.reward.ships
        ? translate('toast.tutorialShips', {
            list: Object.keys(step.reward.ships)
              .map((idStr) => `${translateTerm(+idStr, 'ships')}×${step.reward.ships![+idStr]}`)
              .join(listSep()),
          })
        : ''
      toast(translate('toast.tutorialDone', { title: localizeField(step, 'title'), ships: shipDesc }), 'success')
      sfx('complete')
      changed = true
    }
  }

  const achChecks: Record<number, boolean> = {
    1: state.planets.length >= 2,
    2: state.stats.battlesWon >= 1,
    3: totalShips >= 50,
    4: state.planets.some((p) => (p.buildings[1] ?? 0) >= 10),
    5: Object.values(state.techs).some((l) => l >= 5),
    6: state.stats.totalLoot >= 100000,
    7: state.stats.totalDebris >= 10000,
    8: [202, 203, 204, 205, 206, 207, 208, 209].every((id) => ownedTypes.has(id)),
    9: state.planets.some((p) => (p.ships[207] ?? 0) >= 1),
    10: totalDefenses >= 10,
    11: state.stats.missilesFired >= 1,
    12: state.stats.trades >= 1,
    13: Object.keys(state.officers).length >= 1,
    14: state.stats.expeditions >= 10,
    15: state.reports.some((r) => r.kind === 'battle' && !r.defense && r.result === 'win' && r.coords.galaxy === 3),
    16: state.stats.defensesDestroyed >= 100,
    17: state.planets.some((p) => p.isMoon),
    18: state.stats.moonsDestroyed >= 1,
    19: (state.campaignDone ?? []).length >= 8,
  }
  for (const a of ACHIEVEMENTS) {
    if (!achievements.includes(a.id) && achChecks[a.id]) {
      achievements.push(a.id)
      toast(translate('toast.achievementUnlocked', { name: localizeField(a, 'name'), desc: localizeField(a, 'desc') }), 'success')
      sfx('complete')
      // 成就奖励直接落到母星 resources（与上方 tutorial `grant` 一致的就地变更模式——
      // checkProgress 拿到的是 tick 已克隆的 planets，set 时整组回写，资源修改会随 set 落库）。
      if (a.reward && home) {
        // 2026-09-29：原先裸 += 不封顶，满仓时玩家看到「成就解锁」却拿不到超出部分。
        const g = grantResources(home, {
          metal: a.reward.metal ?? 0,
          crystal: a.reward.crystal ?? 0,
          deuterium: a.reward.deuterium ?? 0,
        }, state.officers.commander ? 1.1 : 1)
        home.resources = g.resources
        warnOverflow(g.overflow, 'toast.overflowAchievement')
      }
      changed = true
    }
  }

  return { achievements, tutorialDone, changed }
}

function scaleLoot(npc: NpcPlanet, cap: number): Resource {
  const half = { metal: npc.resources.metal * 0.5, crystal: npc.resources.crystal * 0.5, deuterium: npc.resources.deuterium * 0.5 }
  const total = half.metal + half.crystal + half.deuterium
  const k = total <= cap ? 1 : cap / total
  const loot = { metal: half.metal * k, crystal: half.crystal * k, deuterium: half.deuterium * k }
  npc.resources.metal -= loot.metal
  npc.resources.crystal -= loot.crystal
  npc.resources.deuterium -= loot.deuterium
  return loot
}

function lootFromPlanet(planet: Planet, cap: number): Resource {
  const half = { metal: planet.resources.metal * 0.5, crystal: planet.resources.crystal * 0.5, deuterium: planet.resources.deuterium * 0.5 }
  const total = half.metal + half.crystal + half.deuterium
  const k = total <= cap ? 1 : cap / total
  const loot = { metal: half.metal * k, crystal: half.crystal * k, deuterium: half.deuterium * k }
  planet.resources.metal -= loot.metal
  planet.resources.crystal -= loot.crystal
  planet.resources.deuterium -= loot.deuterium
  return loot
}

function posFree(planets: Planet[], npcs: Record<string, NpcPlanet>, c: Coordinate): boolean {
  if (planets.some((p) => p.coords.galaxy === c.galaxy && p.coords.system === c.system && p.coords.position === c.position)) return false
  return !npcs[npcKey(c)]
}

/**
 * 战斗结果标签。i18n 层的 translateTerm 只覆盖术语表，战斗结论属文案，
 * 放语言包并在这里按当前语言取值（此前是 `{ win: '胜利', ... }` 的中文字面量表）。
 */
function resultLabel(result: 'win' | 'loss' | 'draw'): string {
  return translate(result === 'win' ? 'toast.resultWin' : result === 'loss' ? 'toast.resultLoss' : 'toast.resultDraw')
}

/** 术语表 id 取名；id 不存在时回退语言包里的通用词，而不是裸露的 id。 */
function termOr(id: number, table: 'buildings' | 'ships' | 'defenses' | 'techs', fallbackKey: string): string {
  return translateTerm(id, table) || translate(fallbackKey)
}

/**
 * 资源名（金属/晶体/重氢），随语言切换。走 resource.* 族而非 common.*。
 *
 * 三个键写成字面量而不是模板串 `resource.${r}`：locale-contract 的「无孤儿键」门禁
 * 靠扫源码里的引号字符串字面量来判定「这个键有人用吗」，模板串扫不到，
 * 会把三个键全判成孤儿。
 */
function resLabel(r: 'metal' | 'crystal' | 'deuterium'): string {
  if (r === 'metal') return translate('resource.metal')
  if (r === 'crystal') return translate('resource.crystal')
  return translate('resource.deuterium')
}

interface GameStore extends SaveData {
  currentPlanet: number
  selectPlanet: (id: number) => void
  tick: () => void
  setTimeScale: (v: number) => void
  newGame: () => void
  saveToSlot: (slot: number, label?: string) => void
  loadFromSlot: (slot: number) => string | null
  upgradeBuilding: (planetId: number, objectId: number) => string | null
  startResearch: (objectId: number) => string | null
  buildShips: (planetId: number, shipId: number, count: number) => string | null
  dispatchMission: (originId: number, to: Coordinate, type: MissionType, fleet: Record<number, number>, cargo: Resource) => string | null
  renamePlanet: (planetId: number, name: string) => void
  abandonPlanet: (planetId: number) => string | null
  cancelBuildingQueue: (planetId: number, index: number) => void
  togglePauseBuildingQueue: (planetId: number, index: number) => void
  moveBuildingQueue: (planetId: number, index: number, dir: -1 | 1) => void
  cancelResearchQueue: (index: number) => void
  cancelShipQueueItem: (planetId: number, index: number) => void
  hireOfficer: (officerId: string) => string | null
  fireOfficer: (officerId: string) => void
  trade: (planetId: number, give: 'metal' | 'crystal' | 'deuterium', get: 'metal' | 'crystal' | 'deuterium', amount: number) => string | null
  claimDaily: () => void
  dispatchMissiles: (planetId: number, to: Coordinate, count: number) => string | null
  playCampaign: (planetId: number, stageId: number, fleet: Record<number, number>) => string | null
  playCampaignElite: (planetId: number, stageId: number, fleet: Record<number, number>) => string | null
  phalanxScan: (galaxy: number, system: number) => string | null
  skipTutorial: () => void
  scrapDefense: (planetId: number, defenseId: number, count: number) => string | null
}

export const useGame = create<GameStore>((set, get) => ({
  ...newGameData(),
  currentPlanet: 1,

  selectPlanet: (id) => set({ currentPlanet: id }),

  setTimeScale: (v) => set({ timeScale: v }),

  newGame: () => {
    const data = newGameData()
    set({ ...data, currentPlanet: 1 })
    writeSlot(0, data, SLOT_NAMES[0].name)
  },

  saveToSlot: (slot, label) => {
    // 落库的 label 恒为中文 name；展示给玩家的那条 toast 走当前语言。
    const name = label ?? SLOT_NAMES[slot]?.name ?? `存档${slot}`
    // 2026-09-29：writeSlot 失败（如配额满）时已弹错误 toast，此处不再补一条「已保存」。
    // 原先无条件弹成功，配额满时玩家会同时看到红绿两条 toast，而槽位其实是空的。
    if (!writeSlot(slot, snapshot(get()), name)) return
    toast(translate('toast.savedToSlot', { name: localizeField(SLOT_NAMES[slot], 'name') }), 'success')
    sfx('notify')
  },

  loadFromSlot: (slot) => {
    const key = saveSlotKey(slot)
    if (!key) return translate('err.notLoggedIn')
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return translate('err.saveNotFound')
      const file = JSON.parse(raw) as SlotFile
      const d = file.data
      // 2026-09-29：原先 `d.saveVersion < 2 || d.saveVersion > 11` 对**缺失值**失效
      // （undefined 与两个数字比较都是 false），于是缺版本的存档被当作合法放行，
      // 而 9 级迁移全部跳过，主循环首个 tick() 即抛且每 tick 都抛。
      const problem = saveFileProblem(file)
      if (problem) return problem
      if (d.saveVersion === 2) {
        d.planets = d.planets.map((p) => ({ ...p, defenses: p.defenses ?? {} }))
        for (const k in d.npcs) d.npcs[k] = { ...d.npcs[k], defenses: d.npcs[k].defenses ?? {} }
        d.reports = d.reports.map((r) =>
          r.kind === 'battle'
            ? { ...r, wallAt: r.wallAt ?? d.createdWallAt, debris: r.debris ?? { metal: 0, crystal: 0 } }
            : { ...r, wallAt: r.wallAt ?? d.createdWallAt },
        )
        d.debrisFields = d.debrisFields ?? {}
        d.stats = d.stats ?? emptyStats()
        d.achievements = d.achievements ?? []
        d.tutorialDone = d.tutorialDone ?? []
        d.tutorialSkipped = d.tutorialSkipped ?? false
        d.saveVersion = 3
      }
      if (d.saveVersion === 3) {
        for (const k in d.npcs) d.npcs[k] = { ...d.npcs[k], lastRegen: d.npcs[k].lastRegen ?? d.gameTime, respawnAt: d.npcs[k].respawnAt }
        d.reports = d.reports.map((r) => (r.kind === 'battle' ? { ...r, defense: r.defense ?? false } : r))
        d.saveVersion = 4
      }
      if (d.saveVersion === 4) {
        d.officers = d.officers ?? {}
        d.lastDailyClaimWallAt = d.lastDailyClaimWallAt ?? 0
        d.dailyStreak = d.dailyStreak ?? 0
        d.saveVersion = 5
      }
      if (d.saveVersion === 5) {
        d.stats = { ...emptyStats(), ...d.stats }
        d.lastEventRoll = d.lastEventRoll ?? d.gameTime
        d.saveVersion = 6
      }
      if (d.saveVersion === 6) {
        d.planets = d.planets.map((p) => ({ ...p, isMoon: p.isMoon ?? false }))
        d.saveVersion = 7
      }
      if (d.saveVersion === 7) {
        d.campaignDone = d.campaignDone ?? []
        d.stats = { ...emptyStats(), ...d.stats }
        d.saveVersion = 8
      }
      if (d.saveVersion === 8) {
        d.planets = d.planets.map((p) => ({ ...p, posCoef: p.posCoef ?? { metal: 1, crystal: 1, deuterium: 1 } }))
        d.saveVersion = 9
      }
      if (d.saveVersion === 9) {
        d.planets = d.planets.map((p) => ({
          ...p,
          buildingQueue: p.buildingQueue == null ? [] : Array.isArray(p.buildingQueue) ? p.buildingQueue : [p.buildingQueue],
        }))
        d.saveVersion = 10
      }
      if (d.saveVersion === 10) {
        d.researchQueue = d.researchQueue == null ? [] : Array.isArray(d.researchQueue) ? d.researchQueue : [d.researchQueue]
        d.saveVersion = 11
      }
      // campaignEliteDone 是 v11 期内追加的字段，不升 saveVersion——所有现存 v11 存档走这条 ?? [] 兜底。
      // 玩家数据无任何迁移成本：新字段缺省视为「精英战役未通关」，UI 表现正常。
      d.campaignEliteDone = d.campaignEliteDone ?? []
      // buildingWaitQueue（等待预约）已于 2026-09-28 整体移除：建筑队列固定 3 槽，满槽即拒绝。
      // 老存档里残留的预约在预约时已预扣资源，直接丢弃等于吞玩家资源，因此必须按预约时的
      // 等级口径逐项退款后清空。
      //
      // 口径核对（2026-09-28 复核）：当初 upgradeBuilding 满槽分支的扣费用
      //   waitLevels = wait.filter(w => w.objectId === objectId).length   // 追加前的预约数
      //   totalLevel = max(已建成, 队列等级) + waitLevels
      // 即第 i 项预约按 base+i 收费。这里用 perObject 按 objectId 独立分桶、before 递增，
      // 退费等级序列同样是 base, base+1, base+2…，与扣费严格一致（测试见
      // build-queue-slots.test.ts 的「迁移退款」用例）。
      d.planets = (d.planets as Array<Planet & { buildingWaitQueue?: WaitItem[] }>).map((p) => {
        const wait: WaitItem[] = Array.isArray(p.buildingWaitQueue) ? p.buildingWaitQueue : []
        const { buildingWaitQueue: _dropped, ...rest } = p
        if (wait.length === 0) return rest as Planet
        let metal = p.resources.metal
        let crystal = p.resources.crystal
        let deuterium = p.resources.deuterium
        // 逐项按"当时已建成 + 队列 + 该项之前同建筑的预约数"推算它被收取的等级
        const perObject = new Map<number, number>()
        for (const item of wait) {
          const def = BUILDINGS[item.objectId]
          if (!def) continue
          const before = perObject.get(item.objectId) ?? 0
          const queued = p.buildingQueue.filter((q) => q.objectId === item.objectId).map((q) => q.level)
          const level = Math.max(p.buildings[item.objectId] ?? 0, ...queued, 0) + before
          const refund = buildingCost(def, level)
          metal += refund.metal
          crystal += refund.crystal
          deuterium += refund.deuterium
          perObject.set(item.objectId, before + 1)
        }
        return { ...rest, resources: { metal, crystal, deuterium } } as Planet
      })
      // 离线收益：保留存档里的 lastWallTick。加载后第一次 tick 会把离线墙钟时长（≤OFFLINE_CAP_MS）
      // 计入 gameNow，produce/队列/任务/NPC 再生全部按 gameNow 补算。旧存档或损坏值兜底为当前时间。
      const offlineTick = typeof d.lastWallTick === 'number' && d.lastWallTick > 0 ? d.lastWallTick : Date.now()
      set({ ...d, lastWallTick: offlineTick, currentPlanet: d.planets[0]?.id ?? 1 })
      return null
    } catch {
      return translate('err.saveCorrupt')
    }
  },

  tick: () => {
    const s = get()
    const wallNow = Date.now()
    const dtWall = Math.min(Math.max(0, wallNow - s.lastWallTick), OFFLINE_CAP_MS)
    const gameNow = s.gameTime + dtWall * s.timeScale

    // 暂停：所有进度门控（队列、任务、NPC 再生、事件滚动）都靠 gameNow，timeScale=0 时 gameNow 不变；
    // 唯一必须推进的是 lastWallTick（否则恢复瞬间 dtWall 巨大），且没人订阅它，不会触发重渲染。
    // 自动存档一并跳过：没有任何字段变化，写也是把同一份数据再落一次 localStorage。
    if (s.timeScale === 0) {
      set({ lastWallTick: wallNow })
      return
    }

    let dirty = false

    const planets = s.planets.map((p) => ({ ...p, resources: { ...p.resources }, buildings: { ...p.buildings }, ships: { ...p.ships }, defenses: { ...p.defenses } }))
    const techs = { ...s.techs }
    // 仓容封顶口径与 produce() 保持一致（指挥官 +10%），入账点才不会比生产点更严。
    const cmdMul = s.officers.commander ? 1.1 : 1
    let researchQueue = s.researchQueue
    const npcs = { ...s.npcs }
    const debrisFields = { ...s.debrisFields }
    // stats/reports：脏分支才需要写回，未触发时保持对 s.stats / s.reports 的引用相等，zustand set 时
    // Object.is 为 true，不再触发订阅者重渲染、也不再产生无效拷贝。push / += 之前调用 touch*。
    let stats: typeof s.stats = s.stats
    let reports: Report[] = s.reports
    const touchStats = () => { if (stats === s.stats) stats = { ...s.stats } }
    const touchReports = () => { if (reports === s.reports) reports = [...s.reports] }
    let missions = s.missions.map((m) => ({ ...m, fleet: { ...m.fleet }, cargo: { ...m.cargo } }))
    let nextId = s.nextId

    for (const k in npcs) {
      npcs[k] = { ...npcs[k], fleet: { ...npcs[k].fleet }, defenses: { ...npcs[k].defenses }, resources: { ...npcs[k].resources } }
      npcRegen(npcs[k], gameNow)
    }

    // NPC 动态成长（2026-09-27，机制对照 ogame-vue-ts npcGrowthLogic）：玩家积分驱动
    // NPC 舰队分段增援——<1k 分不成长（教程保护），之后按 50%/80%/110% 实力上限爬坡。
    // playerScore 是 O(Σ levels) 重算，每 tick 一次可接受（planetCount 个位数）。
    const pScore = playerScore({ planets, techs })
    const shipCostMap: Record<number, { metal: number; crystal: number; deuterium: number }> = {}
    for (const sid in SHIPS) shipCostMap[+sid] = SHIPS[+sid].cost
    for (const k in npcs) {
      npcDynamicGrowth(npcs[k], pScore, gameNow, shipCostMap)
    }

    const officers = { ...s.officers }
    let activeEvent = s.activeEvent
    let lastEventRoll = s.lastEventRoll

    if (activeEvent && gameNow >= activeEvent.endsAt) {
      toast(translate('toast.flareEnded'), 'info')
      activeEvent = undefined
      dirty = true
    }
    if (gameNow - lastEventRoll >= 24 * 3600 * 1000) {
      lastEventRoll = gameNow
      const roll = mulberry32(gameNow)()
      const home = planets.find((p) => p.isHome)
      if (roll < 0.09 && home) {
        const bonus = 2000 + Math.floor(mulberry32(gameNow ^ 0x1000)() * 4000)
        // 2026-09-29：裸 += 不封顶，满仓时奖励静默归零。事件随机触发、玩家无预判，
        // 更需要如实告知而不是让数字凭空消失。
        const g = grantResources(home, { metal: bonus }, cmdMul)
        home.resources = g.resources
        if (g.overflow.metal >= 1) {
          toast(translate('toast.meteorCapped', { bonus, actual: bonus - g.overflow.metal }), 'info')
        } else {
          toast(translate('toast.meteor', { bonus }), 'success')
        }
        sfx('notify')
        dirty = true
      } else if (roll < 0.17) {
        activeEvent = { type: 'flare', endsAt: gameNow + 2 * 3600 * 1000 }
        toast(translate('toast.flareIncoming'), 'warn')
        sfx('notify')
        dirty = true
      } else if (roll < 0.25) {
        const target = planets[Math.floor(mulberry32(gameNow ^ 0x2000)() * planets.length)]
        // 新手保护：保护期内海盗巡逻队不得盯上玩家星球（2026-09-28 修复）。
        // 此分支原先完全没有保护判断，与 isNewbieShieldActive 的声明
        // （"期间任何一方都不能攻击或探测玩家的星球"）相矛盾——表现为新手
        // 开局 7 天内被无预警打母星，且战斗残骸干扰资源守恒。
        const cf = isNewbieShieldActive(s.createdWallAt) ? {} : counterattackFleet(target.coords, 1)
        if (Object.keys(cf).length > 0) {
          const deepSpace = { galaxy: 3, system: 20, position: 9 }
          const travelC = flightTime(distance(deepSpace, target.coords), 12500) * 1000
          missions.push({
            id: nextId++, type: 'attack', originId: -1, npcOwned: true,
            from: deepSpace, to: target.coords, fleet: cf,
            cargo: { metal: 0, crystal: 0, deuterium: 0 },
            departAt: gameNow, arriveAt: gameNow + travelC, phase: 'out',
          })
          toast(translate('toast.piratePatrol', { name: translatePlanetName(target.name) }), 'warn')
          dirty = true
        }
      }
    }

    touchStats()
    for (const p of planets) {
      produce(p, techs, gameNow, officers, !!activeEvent)

      if (p.buildingQueue.length > 0) {
        const doneItems = p.buildingQueue.filter((q) => q.pausedRemaining === undefined && q.finishAt <= gameNow)
        if (doneItems.length > 0) {
          for (const d of doneItems) {
            p.buildings[d.objectId] = d.level
            toast(translate('toast.buildingDone', { planet: translatePlanetName(p.name), name: termOr(d.objectId, 'buildings', 'toast.genericBuilding'), level: d.level }), 'success')
          }
          sfx('complete')
          p.buildingQueue = p.buildingQueue.filter((q) => q.pausedRemaining !== undefined || q.finishAt > gameNow)
          dirty = true
        }
      }

      if (p.shipQueue.length > 0 && p.shipQueue[0].finishAt <= gameNow) {
        const done = p.shipQueue.filter((q) => q.finishAt <= gameNow)
        p.shipQueue = p.shipQueue.filter((q) => q.finishAt > gameNow)
        for (const d of done) {
          if (isDefense(d.shipId)) {
            p.defenses[d.shipId] = (p.defenses[d.shipId] ?? 0) + d.count
            stats.defensesBuilt += d.count
            toast(translate('toast.defenseDeployed', { planet: translatePlanetName(p.name), name: termOr(d.shipId, 'defenses', 'toast.genericDefense'), count: d.count }), 'success')
          } else {
            p.ships[d.shipId] = (p.ships[d.shipId] ?? 0) + d.count
            stats.shipsBuilt += d.count
            toast(translate('toast.shipBuilt', { planet: translatePlanetName(p.name), name: termOr(d.shipId, 'ships', 'toast.genericShip'), count: d.count }), 'success')
          }
        }
        sfx('complete')
        dirty = true
      }
    }

    const doneR = researchQueue.filter((q) => q.finishAt <= gameNow)
    if (doneR.length > 0) {
      for (const r of doneR) {
        techs[r.objectId] = r.level
        toast(translate('toast.researchDone', { name: termOr(r.objectId, 'techs', 'toast.genericTech'), level: r.level }), 'success')
      }
      sfx('complete')
      researchQueue = researchQueue.filter((q) => q.finishAt > gameNow)
      dirty = true
    }

    for (const oid in officers) {
      const o = officers[oid]
      const def = OFFICERS[oid]
      if (!def) continue
      if (gameNow >= o.nextUpkeepAt) {
        const home = planets.find((p) => p.isHome)
        // 离线可能跨多周：按周数循环收缴，而不是只收一次
        while (gameNow >= (officers[oid] ?? o).nextUpkeepAt) {
          const cur = officers[oid] ?? o
          const paid =
            home &&
            home.resources.metal >= def.weeklyCost.metal &&
            home.resources.crystal >= def.weeklyCost.crystal &&
            home.resources.deuterium >= def.weeklyCost.deuterium
          if (paid) {
            home.resources.metal -= def.weeklyCost.metal
            home.resources.crystal -= def.weeklyCost.crystal
            home.resources.deuterium -= def.weeklyCost.deuterium
            officers[oid] = { ...cur, nextUpkeepAt: cur.nextUpkeepAt + 7 * 24 * 3600 * 1000 }
            toast(translate('toast.officerUpkeepPaid', { name: localizeField(def, 'name') }), 'info')
          } else {
            delete officers[oid]
            toast(translate('toast.officerLeft', { name: localizeField(def, 'name') }), 'warn')
            break
          }
        }
        dirty = true
      }
    }

    touchStats()
    touchReports()
    for (const m of missions) {
      if (m.phase === 'out' && m.arriveAt <= gameNow) {
        const key = npcKey(m.to)
        const npc = npcs[key]
        const targetPlanet = planets.find((p) => p.coords.galaxy === m.to.galaxy && p.coords.system === m.to.system && p.coords.position === m.to.position)
        dirty = true

        if (m.npcOwned) {
          if (!targetPlanet) {
            m.phase = 'back'
            m.returnAt = gameNow + (m.arriveAt - m.departAt)
          } else {
            const input: BattleInput = {
              attackerFleets: [buildFleetInput(m.fleet, {}, m.id)],
              defenderFleets: [playerDefenderInput(targetPlanet, techs, m.id + 2000000, !!officers.engineer)],
            }
            const output = simulate(input)
            const last = output.rounds[output.rounds.length - 1]
            const attackerSurvivors = last?.attackerFleetResults[m.id]?.unitsResult ?? {}
            const defenderSurvivorsAll = last?.defenderFleetResults[m.id + 2000000]?.unitsResult ?? {}
            const attackerLost = last?.attackerLosses ?? {}
            const defenderLost = last?.defenderLosses ?? {}

            const shipSurvivors: Record<number, number> = {}
            const defenseSurvivors: Record<number, number> = {}
            for (const id in defenderSurvivorsAll) {
              if (isDefense(+id)) defenseSurvivors[+id] = defenderSurvivorsAll[+id]
              else shipSurvivors[+id] = defenderSurvivorsAll[+id]
            }
            for (const id in targetPlanet.defenses) {
              const destroyed = (targetPlanet.defenses[+id] ?? 0) - (defenseSurvivors[+id] ?? 0)
              if (destroyed > 0) defenseSurvivors[+id] = (defenseSurvivors[+id] ?? 0) + rollDefenseRepairs(destroyed, hash32(gameNow, destroyed, 0xb000))
            }
            targetPlanet.ships = shipSurvivors
            targetPlanet.defenses = defenseSurvivors

            const debris = debrisFromLosses(attackerLost, defenderLost)
            if (debris.metal > 0 || debris.crystal > 0) {
              const existing = debrisFields[key] ?? { metal: 0, crystal: 0 }
              debrisFields[key] = { metal: existing.metal + debris.metal, crystal: existing.crystal + debris.crystal }
            }
            const spawned = spawnMoonFromDebris(planets, debrisFields[key], m.to, gameNow, nextId, targetPlanet.name, targetPlanet.temperatureMax)
            if (spawned) {
              planets.push(spawned.moon)
              nextId = spawned.nextId
              toast(translate('toast.gravityMoon', { name: translatePlanetName(targetPlanet.name) }), 'success')
              sfx('complete')
            }

            const result: 'win' | 'loss' | 'draw' =
              Object.keys(defenderSurvivorsAll).length === 0 ? 'win' : Object.keys(attackerSurvivors).length === 0 ? 'loss' : 'draw'
            let loot: Resource = { metal: 0, crystal: 0, deuterium: 0 }
            if (result === 'win') loot = lootFromPlanet(targetPlanet, fleetCargo(attackerSurvivors))
            stats.battlesTotal += 1

            reports.push({
              kind: 'battle', id: nextId++, time: gameNow, wallAt: wallNow, coords: m.to, targetName: targetPlanet.name,
              input, output, loot, debris, result, defense: true,
            })
            toast(
              translate('toast.planetAttacked', {
                name: translatePlanetName(targetPlanet.name),
                outcome: result === 'loss' ? translate('toast.defenceHeld') : result === 'win' ? translate('toast.defenceBroken') : translate('toast.stalemateShort'),
              }),
              result === 'loss' ? 'success' : result === 'win' ? 'error' : 'warn',
            )
            sfx('battle')

            m.fleet = attackerSurvivors
            m.cargo = loot
            if (Object.keys(attackerSurvivors).length > 0) {
              m.phase = 'back'
              m.returnAt = gameNow + (m.arriveAt - m.departAt)
            } else {
              m.phase = 'back'
              m.returnAt = gameNow
            }
          }
        } else if (m.type === 'transport') {
          if (targetPlanet) {
            // 2026-09-29：原先裸 += 不封顶，超仓部分被下一 tick 的 produce() 静默抹掉。
            const g = grantResources(targetPlanet, m.cargo, cmdMul)
            targetPlanet.resources = g.resources
            warnOverflow(g.overflow, 'toast.overflowUnload')
          } else if (npc) {
            npc.resources.metal += m.cargo.metal
            npc.resources.crystal += m.cargo.crystal
            npc.resources.deuterium += m.cargo.deuterium
          }
          m.cargo = { metal: 0, crystal: 0, deuterium: 0 }
          m.phase = 'back'
          m.returnAt = gameNow + (m.arriveAt - m.departAt)
          toast(translate('toast.transportDelivered'), 'info')
          sfx('notify')
        } else if (m.type === 'deploy') {
          if (targetPlanet) {
            for (const id in m.fleet) targetPlanet.ships[+id] = (targetPlanet.ships[+id] ?? 0) + m.fleet[+id]
            m.fleet = {}
            // 2026-09-28 修复：此前成功分支没有设 phase，mission 永远停在 'out' 且
            // arriveAt 已过期 —— 下一次 tick 会再次命中 `phase==='out' && arriveAt<=now`，
            // 把同一个 mission 反复执行到达分支，导致目标星球舰船无限增长
            // （实测 3 次 tick 多出 3 艘）。驻扎是终态：标记完成，
            // 由循环后的统一清理移除（不能在 for...of 内改 missions，会破坏迭代器）。
            m.phase = 'done'
            m.returnAt = undefined
            toast(translate('toast.fleetStationed', { name: translatePlanetName(targetPlanet.name) }), 'success')
            sfx('notify')
            continue
          }
          m.phase = 'back'
          m.returnAt = gameNow + (m.arriveAt - m.departAt)
        } else if (m.type === 'colonize') {
          if (!targetPlanet && !npc && posFree(planets, npcs, m.to)) {
            const colony = newPlanet(nextId++, '殖民地', m.to, false)
            colony.lastTick = gameNow
            planets.push(colony)
            stats.colonies += 1
            m.fleet[208] = (m.fleet[208] ?? 1) - 1
            if (m.fleet[208] <= 0) delete m.fleet[208]
            toast(translate('toast.colonyEstablished', { g: m.to.galaxy, s: m.to.system, p: m.to.position }), 'success')
            sfx('complete')
          } else {
            toast(translate('toast.colonizeOccupied'), 'warn')
          }
          if (Object.keys(m.fleet).length > 0) {
            m.phase = 'back'
            m.returnAt = gameNow + (m.arriveAt - m.departAt)
          } else {
            m.phase = 'back'
            m.returnAt = gameNow
          }
        } else if (m.type === 'espionage') {
          const probes = m.fleet[210] ?? 0
          let probesLost = 0
          if (npc) {
            const rv = espionageReveal(techs[106] ?? 0, npcEspionageTech(npc), probes)
            const fleetTotal = Object.values(npc.fleet).reduce((a, b) => a + b, 0)
            const defenseTotal = Object.values(npc.defenses).reduce((a, b) => a + b, 0)
            // 反侦察：目标有驻军时探测器可能被击毁。OGameX 里这是一场只有防御方舰船参战的
            // 拦截战；单机无真人对手，简化为随驻军规模递增的逐枚掷骰，驻军为 0 则无风险，
            // 避免新手第一次侦察就被团灭。报告始终生成——OGameX 源码注释明示
            // "Always create espionage report (even if all probes destroyed)"，只损失探测器。
            if (fleetTotal + defenseTotal > 0) {
              const risk = Math.min(0.5, (fleetTotal + defenseTotal) * 0.02)
              // ponytail: per-call rng seeded from mission coords + probe count.
              const probeRng = mulberry32(hash32(gameNow, m.to.galaxy, m.to.system, m.to.position, probes))
              for (let i = 0; i < probes; i++) if (probeRng() < risk) probesLost++
            }
            reports.push({
              kind: 'espionage', id: nextId++, time: gameNow, wallAt: wallNow, coords: m.to, targetName: npc.name,
              depth: rv.effective,
              fleetTotal: rv.fleet ? fleetTotal : undefined,
              fleet: rv.composition ? { ...npc.fleet } : undefined,
              defenseTotal: rv.defense ? defenseTotal : undefined,
              resources: rv.resources ? { ...npc.resources } : undefined,
              probesLost: probesLost > 0 ? probesLost : undefined,
            })
            if (probesLost >= probes && probes > 0) toast(translate('toast.espionageBlocked'), 'warn')
            else if (probesLost > 0) toast(translate('toast.espionageProbesLost', { n: probesLost }), 'info')
            else toast(translate('toast.espionageDelivered', { depth: rv.effective }), 'info')
          }
          if (probesLost > 0) {
            const left = Math.max(0, probes - probesLost)
            if (left > 0) m.fleet[210] = left
            else delete m.fleet[210]
          }
          m.phase = 'back'
          m.returnAt = gameNow + (m.arriveAt - m.departAt)
        } else if (m.type === 'attack' && npc) {
          const input: BattleInput = {
            attackerFleets: [buildFleetInput(m.fleet, techs, m.id)],
            defenderFleets: [npcDefenderInput(npc, m.id + 1000000)],
          }
          const output = simulate(input)
          const last = output.rounds[output.rounds.length - 1]
          const survivors = last?.attackerFleetResults[m.id]?.unitsResult ?? {}
          const defenderSurvivorsAll = last?.defenderFleetResults[m.id + 1000000]?.unitsResult ?? {}
          const attackerLost = last?.attackerLosses ?? {}
          const defenderLost = last?.defenderLosses ?? {}

          const defShipSurvivors: Record<number, number> = {}
          const defDefenseSurvivors: Record<number, number> = {}
          for (const id in defenderSurvivorsAll) {
            if (isDefense(+id)) defDefenseSurvivors[+id] = defenderSurvivorsAll[+id]
            else defShipSurvivors[+id] = defenderSurvivorsAll[+id]
          }
          const repairedDefenses = { ...defDefenseSurvivors }
          const initialDefs: Record<number, number> = { ...npc.defenses }
          for (const id in initialDefs) {
            const destroyed = (initialDefs[+id] ?? 0) - (defDefenseSurvivors[+id] ?? 0)
            if (destroyed > 0) repairedDefenses[+id] = (repairedDefenses[+id] ?? 0) + rollDefenseRepairs(destroyed, hash32(gameNow, destroyed, 0xc000))
          }
          npc.fleet = defShipSurvivors
          npc.defenses = repairedDefenses

          const debris = debrisFromLosses(attackerLost, defenderLost)
          if (debris.metal > 0 || debris.crystal > 0) {
            const existing = debrisFields[key] ?? { metal: 0, crystal: 0 }
            debrisFields[key] = { metal: existing.metal + debris.metal, crystal: existing.crystal + debris.crystal }
          }
          // 玩家出击同样按经典残骸口径凝聚月球（2026-09-25 死代码缺陷修复）。NPC 无温度场，取标准 25℃
          const spawned = spawnMoonFromDebris(planets, debrisFields[key], m.to, gameNow, nextId, npc.name, 25)
          if (spawned) {
            planets.push(spawned.moon)
            nextId = spawned.nextId
            toast(translate('toast.gravityMoon', { name: translatePlanetName(npc.name) }), 'success')
            sfx('complete')
          }

          const result: 'win' | 'loss' | 'draw' =
            Object.keys(defenderSurvivorsAll).length === 0 ? 'win' : Object.keys(survivors).length === 0 ? 'loss' : 'draw'
          const loot = result === 'win' ? scaleLoot(npc, fleetCargo(survivors)) : { metal: 0, crystal: 0, deuterium: 0 }
          stats.battlesTotal += 1
          if (result === 'win') stats.battlesWon += 1
          stats.totalLoot += loot.metal + loot.crystal + loot.deuterium
          for (const id in defenderLost) {
            if (isDefense(+id)) stats.defensesDestroyed += defenderLost[+id]
          }

          reports.push({
            kind: 'battle', id: nextId++, time: gameNow, wallAt: wallNow, coords: m.to, targetName: npc.name,
            input, output, loot, debris, result,
          })
          toast(translate('toast.attackResult', { name: translatePlanetName(npc.name), result: resultLabel(result) }), result === 'win' ? 'success' : result === 'loss' ? 'error' : 'warn')
          sfx('battle')

          if (result === 'win') {
            const chance = 0.25
            const weakest = planets.reduce((min, p) => {
              const strength = (pl: Planet) => Object.values(pl.ships).reduce((a, b) => a + b, 0) + Object.values(pl.defenses).reduce((a, b) => a + b, 0)
              return strength(p) < strength(min) ? p : min
            }, planets[0])
            // 新手保护：保护期内 NPC 不得反击玩家星球（2026-09-28 修复）。
            // 玩家保护期内可以主动打 NPC，打赢后这条反击路径原先不查保护，
            // 于是新开局玩家会被自己刚打赢的战斗反手打母星。
            if (mulberry32(hash32(gameNow, m.id, 0x5000))() < chance && weakest && !isNewbieShieldActive(s.createdWallAt)) {
              // R10 D-1 (P3.8) — 外交官：NPC 反击舰队强度 -10%
              const cf = counterattackFleet(m.to, s.officers.ambassador ? 0.9 : 1)
              if (Object.keys(cf).length > 0) {
                const travelC = flightTime(distance(m.to, weakest.coords), 12500) * 1000
                missions.push({
                  id: nextId++, type: 'attack', originId: -1, npcOwned: true,
                  from: m.to, to: weakest.coords, fleet: cf,
                  cargo: { metal: 0, crystal: 0, deuterium: 0 },
                  departAt: gameNow, arriveAt: gameNow + travelC + 30 * 60000, phase: 'out',
                })
                toast(translate('toast.counterattackIntel', { npc: translatePlanetName(npc.name), target: translatePlanetName(weakest.name) }), 'warn')
              }
            }

            if (npc.hasMoon && (survivors[214] ?? 0) > 0) {
              const dsCount = survivors[214] ?? 0
              const destroyChance = Math.min(0.9, 0.25 + 0.05 * dsCount)
              if (mulberry32(hash32(gameNow, dsCount, 0x6000))() < destroyChance) {
                npc.hasMoon = false
                for (const id of npc.moonDefenseIds ?? []) delete npc.defenses[id]
                npc.moonDefenseIds = undefined
                stats.moonsDestroyed += 1
                toast(translate('toast.deathstarMoonBlown', { name: translatePlanetName(npc.name) }), 'success')
                sfx('battle')
              } else if (mulberry32(hash32(gameNow, 0x7000))() < 0.05) {
                if ((survivors[214] ?? 0) > 0) {
                  survivors[214] -= 1
                  if (survivors[214] <= 0) delete survivors[214]
                }
                toast(translate('toast.deathstarLost'), 'error')
              }
            }
          }

          m.fleet = survivors
          m.cargo = loot
          if (Object.keys(survivors).length > 0) {
            m.phase = 'back'
            m.returnAt = gameNow + (m.arriveAt - m.departAt)
          } else {
            m.phase = 'back'
            m.returnAt = gameNow
          }
        } else if (m.type === 'recycle') {
          const debris = debrisFields[key]
          if (debris && (debris.metal > 0 || debris.crystal > 0)) {
            const cap = fleetCargo(m.fleet)
            const total = debris.metal + debris.crystal
            const k = total <= cap ? 1 : cap / total
            const got = { metal: Math.round(debris.metal * k), crystal: Math.round(debris.crystal * k) }
            const remain = { metal: debris.metal - got.metal, crystal: debris.crystal - got.crystal }
            if (remain.metal > 0 || remain.crystal > 0) debrisFields[key] = remain
            else delete debrisFields[key]
            m.cargo = { metal: got.metal, crystal: got.crystal, deuterium: 0 }
            stats.totalDebris += got.metal + got.crystal
            toast(translate('toast.recycleDone', { metal: got.metal, crystal: got.crystal }), 'success')
            sfx('complete')
          } else {
            toast(translate('toast.recycleEmpty'), 'info')
          }
          m.phase = 'back'
          m.returnAt = gameNow + (m.arriveAt - m.departAt)
        } else if (m.type === 'attack' && !npc) {
          m.phase = 'back'
          m.returnAt = gameNow + (m.arriveAt - m.departAt)
        } else if (m.type === 'missile') {
          const fired = m.missileCount ?? 0
          if (npc && fired > 0) {
            const abm = npc.defenses[503] ?? 0
            const intercepted = Math.min(fired, abm)
            const effective = fired - intercepted
            if (intercepted > 0) {
              npc.defenses[503] = abm - intercepted
              if (npc.defenses[503] <= 0) delete npc.defenses[503]
            }
            const destroyed: Record<number, number> = {}
            let remaining = effective
            const order = Object.keys(npc.defenses)
              .filter((id) => !isMissile(+id) && npc.defenses[+id] > 0)
              .sort((a, b) => {
                const ca = DEFENSES[+a].cost.metal + DEFENSES[+a].cost.crystal
                const cb = DEFENSES[+b].cost.metal + DEFENSES[+b].cost.crystal
                return cb - ca
              })
            for (const id of order) {
              if (remaining <= 0) break
              const kill = Math.min(remaining, npc.defenses[+id])
              npc.defenses[+id] -= kill
              if (npc.defenses[+id] <= 0) delete npc.defenses[+id]
              destroyed[+id] = kill
              remaining -= kill
              stats.defensesDestroyed += kill
            }
            reports.push({
              kind: 'missile', id: nextId++, time: gameNow, wallAt: wallNow, coords: m.to, targetName: npc.name,
              fired, intercepted, destroyed,
            })
            const totalKilled = Object.values(destroyed).reduce((a, b) => a + b, 0)
            toast(
              translate('toast.missileStrike', { name: translatePlanetName(npc.name), fired, intercepted, killed: totalKilled }),
              totalKilled > 0 ? 'success' : 'warn',
            )
            sfx('battle')
          }
          m.phase = 'back'
          m.returnAt = gameNow
        } else if (m.type === 'expedition') {
          const roll = mulberry32(hash32(gameNow, m.id, 0x8000))()
          // R10 D-1 (P3.8) — 战术官：舰队火力 +10%（影响远征 cargo / pirate / bounty 派生量）
          const tacMul = s.officers.tactician ? 1.1 : 1
          const fleetPower = Object.entries(m.fleet).reduce((sum, [id, n]) => sum + (SHIPS[+id]?.attack ?? 0) * n, 0) * tacMul
          let outcome = ''
          let gained: Resource | undefined
          let gainedShips: Record<number, number> | undefined
          let shipsLost = 0

          if (roll < 0.55) {
            const base = Math.min(fleetCargo(m.fleet), 800 + fleetPower * 8 + mulberry32(hash32(gameNow, m.id, 0x9000))() * 2500)
            gained = { metal: Math.round(base * 0.55), crystal: Math.round(base * 0.3), deuterium: Math.round(base * 0.15) }
            m.cargo = gained
            outcome = translate('exp.outcomeStation', { metal: gained.metal, crystal: gained.crystal, deuterium: gained.deuterium })
            toast(translate('toast.expeditionStation'), 'success')
            sfx('complete')
          } else if (roll < 0.72) {
            const joinRng = mulberry32(hash32(gameNow, m.id, 0xa000))
            const joinLf = joinRng() > 0.5 ? 1 + Math.floor(joinRng() * 3) : 0
            const joinHf = joinLf === 0 ? 1 : 0
            gainedShips = {}
            if (joinLf > 0) gainedShips[204] = joinLf
            if (joinHf > 0) gainedShips[205] = joinHf
            for (const id in gainedShips) m.fleet[+id] = (m.fleet[+id] ?? 0) + gainedShips[+id]
            outcome = translate('exp.outcomeRecruit', { list: [joinLf > 0 ? `${translateTerm(204, 'ships')} ×${joinLf}` : '', joinHf > 0 ? `${translateTerm(205, 'ships')} ×${joinHf}` : ''].filter(Boolean).join(listSep()) })
            toast(translate('toast.expeditionRecruited'), 'success')
            sfx('complete')
          } else if (roll < 0.85) {
            const pirates = pirateFleet(Math.max(2, Math.floor(fleetPower / 50)), fleetPower)
            const input: BattleInput = {
              attackerFleets: [buildFleetInput(m.fleet, techs, m.id)],
              defenderFleets: [buildFleetInput(pirates, {}, m.id + 3000000)],
            }
            const output = simulate(input)
            const last = output.rounds[output.rounds.length - 1]
            const survivors = last?.attackerFleetResults[m.id]?.unitsResult ?? {}
            const pirateSurvivors = last?.defenderFleetResults[m.id + 3000000]?.unitsResult ?? {}
            const won = Object.keys(pirateSurvivors).length === 0
            m.fleet = survivors
            if (won) {
              const bounty = { metal: Math.round(500 + fleetPower * 5), crystal: Math.round(250 + fleetPower * 2) }
              const total = bounty.metal + bounty.crystal
              const k = total <= fleetCargo(survivors) ? 1 : fleetCargo(survivors) / total
              gained = { metal: Math.round(bounty.metal * k), crystal: Math.round(bounty.crystal * k), deuterium: 0 }
              m.cargo = gained
              outcome = translate('exp.outcomePiratesWin', { metal: gained.metal, crystal: gained.crystal })
              toast(translate('toast.expeditionPiratesWon'), 'success')
            } else {
              outcome = translate(Object.keys(survivors).length === 0 ? 'exp.outcomePiratesWiped' : 'exp.outcomePiratesEscaped')
              toast(translate('toast.expeditionPiratesLost'), 'error')
            }
            sfx('battle')
            reports.push({
              kind: 'battle', id: nextId++, time: gameNow, wallAt: wallNow, coords: m.to, targetName: translate('exp.pirateAmbushName'),
              input, output, loot: gained ?? { metal: 0, crystal: 0, deuterium: 0 }, debris: { metal: 0, crystal: 0 },
              result: won ? 'win' : Object.keys(survivors).length === 0 ? 'loss' : 'draw',
            })
            stats.battlesTotal += 1
            if (won) stats.battlesWon += 1
          } else if (roll < 0.95) {
            outcome = translate('exp.outcomeNothing')
            toast(translate('toast.expeditionNothing'), 'info')
          } else {
            const before = Object.values(m.fleet).reduce((a, b) => a + b, 0)
            for (const id in m.fleet) {
              const lost = Math.floor(m.fleet[+id] * 0.1)
              if (lost > 0) m.fleet[+id] -= lost
              if (m.fleet[+id] <= 0) delete m.fleet[+id]
            }
            shipsLost = before - Object.values(m.fleet).reduce((a, b) => a + b, 0)
            outcome = translate(shipsLost > 0 ? 'exp.outcomeGravityLoss' : 'exp.outcomeGravitySafe', { n: shipsLost })
            toast(shipsLost > 0 ? translate('toast.expeditionGravityLost') : translate('toast.expeditionGravitySafe'), shipsLost > 0 ? 'error' : 'info')
          }

          reports.push({ kind: 'expedition', id: nextId++, time: gameNow, wallAt: wallNow, coords: m.to, outcome, gained, gainedShips, shipsLost: shipsLost || undefined })
          stats.expeditions += 1
          if (Object.keys(m.fleet).length > 0) {
            m.phase = 'back'
            m.returnAt = gameNow + (m.arriveAt - m.departAt)
          } else {
            m.phase = 'back'
            m.returnAt = gameNow
          }
        }
      }
    }

    // 'done' 是就地终结的 mission（deploy 成功驻扎）：不返航、不再参与到达判定，直接移除。
    const survivors = missions.filter(
      (m) =>
        m.phase !== 'done' &&
        !(m.phase === 'back' && m.returnAt !== undefined && m.returnAt <= gameNow),
    )
    if (survivors.length !== missions.length) {
      dirty = true
      for (const m of missions) {
        if (m.phase === 'back' && m.returnAt !== undefined && m.returnAt <= gameNow) {
          const origin = planets.find((p) => p.id === m.originId)
          if (origin) {
            for (const id in m.fleet) origin.ships[+id] = (origin.ships[+id] ?? 0) + m.fleet[+id]
            // 2026-09-29：原先裸 += 不封顶，超仓缴获被下一 tick 的 produce() 静默抹掉。
            const g = grantResources(origin, m.cargo, cmdMul)
            origin.resources = g.resources
            warnOverflow(g.overflow, 'toast.overflowLoot')
          } else if (m.originId === -1) {
            const homeNpc = npcs[npcKey(m.from)]
            if (homeNpc) {
              for (const id in m.fleet) homeNpc.fleet[+id] = (homeNpc.fleet[+id] ?? 0) + m.fleet[+id]
              homeNpc.resources.metal += m.cargo.metal
              homeNpc.resources.crystal += m.cargo.crystal
              homeNpc.resources.deuterium += m.cargo.deuterium
            }
          }
          const hasLoot = m.cargo.metal > 0 || m.cargo.crystal > 0 || m.cargo.deuterium > 0
          toast(hasLoot ? translate('toast.fleetReturnedLoot') : translate('toast.fleetReturned'), 'info')
        }
      }
      missions = survivors
    }

    let achievements = s.achievements
    let tutorialDone = s.tutorialDone
    if (dirty) {
      const progress = checkProgress({
        planets, techs, researchQueue, missions, reports, npcs, debrisFields, stats,
        achievements, tutorialDone, tutorialSkipped: s.tutorialSkipped, officers, lastDailyClaimWallAt: s.lastDailyClaimWallAt, dailyStreak: s.dailyStreak,
        campaignDone: s.campaignDone, campaignEliteDone: s.campaignEliteDone, activeEvent, lastEventRoll,
        nextId, saveVersion: 11, gameTime: gameNow,
        lastWallTick: wallNow, timeScale: s.timeScale, difficulty: s.difficulty, createdWallAt: s.createdWallAt,
      })
      if (progress.changed) {
        achievements = progress.achievements
        tutorialDone = progress.tutorialDone
      }
    }

    if (reports.length > 100) reports = reports.slice(-100)

    set({ planets, techs, researchQueue, missions, reports, npcs, debrisFields, stats, achievements, tutorialDone, officers, activeEvent, lastEventRoll, nextId, gameTime: gameNow, lastWallTick: wallNow })
    // 事件落库：dirty（建筑/研究完成、任务结算等）立即写；另有 60 秒墙钟兜底，
    // 覆盖"普通操作后刷新即撤销"的窗口（造舰、派遣、交易等本身不置 dirty）。
    if (dirty || wallNow - lastAutoSaveWallAt >= AUTO_SAVE_INTERVAL_MS) {
      lastAutoSaveWallAt = wallNow
      writeSlot(0, snapshot(get()), SLOT_NAMES[0].name)
    }
  },

  upgradeBuilding: (planetId, objectId) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet) return translate('err.planetNotFound')
    const def = BUILDINGS[objectId]
    if (!def) return translate('err.buildingNotFound')
    const queueFull = planet.buildingQueue.length >= BUILD_SLOTS
    const queuedLevels = planet.buildingQueue.filter((q) => q.objectId === objectId).map((q) => q.level)
    const level = Math.max(planet.buildings[objectId] ?? 0, ...queuedLevels, 0)
    if (def.maxLevel > 0 && level >= def.maxLevel) return translate('err.maxLevel')
    // 建筑前置里可能含科技 id（如 33 地形改造器需 113 能源技术、43 跳跃门需 117 脉冲引擎），
    // 因此必须把科技等级并入判定，否则这些建筑永远无法满足前置。
    if (!meetsRequires({ ...planet.buildings, ...s.techs }, def.requires)) return translate('err.prereqMissing')
    // C2：防御设施也占空间，空间校验必须计入 defenses。
    // 老存档防御超限属于既成事实（不拆除），只阻止继续扩建——Shipyard 提供拆解出口。
    if (usedFields(planet.buildings, planet.defenses) + 1 > maxFields(planet.buildings, !!planet.isMoon)) {
      return translate(planet.isMoon ? 'err.fieldsShortMoon' : 'err.fieldsShort')
    }

    // 建筑队列固定 BUILD_SLOTS=3 个。满槽即拒绝（2026-09-28 所有者决定：取消等待预约机制）。
    //
    // 背景：此前这里会转入无上限的 buildingWaitQueue 并预扣资源，导致队列可无限增长——
    // 一次点击序列就能把全部资源预扣进无界队列（试玩发现）。老存档残留预约的退款见
    // loadFromSlot 的迁移段。
    if (queueFull) return translate('err.buildQueueFull', { n: BUILD_SLOTS })

    const cost = buildingCost(def, level)
    if (planet.resources.metal < cost.metal || planet.resources.crystal < cost.crystal || planet.resources.deuterium < cost.deuterium) {
      return translate('err.notEnoughRes')
    }

    const timeMs = buildingTime(def, level, planet.buildings[14] ?? 0) * (s.officers.commander ? 0.85 : 1) * 1000
    const planets = s.planets.map((p) =>
      p.id === planetId
        ? {
            ...p,
            resources: {
              metal: p.resources.metal - cost.metal,
              crystal: p.resources.crystal - cost.crystal,
              deuterium: p.resources.deuterium - cost.deuterium,
            },
            buildingQueue: [...p.buildingQueue, { objectId, level: level + 1, startAt: s.gameTime, finishAt: s.gameTime + timeMs }],
          }
        : p,
    )
    set({ planets })
    return null
  },

  startResearch: (objectId) => {
    const s = get()
    if (s.researchQueue.length >= RESEARCH_SLOTS) return translate('err.researchQueueFull')
    const def = TECHS[objectId]
    if (!def) return translate('err.techNotFound')
    const home = s.planets.find((p) => p.isHome)
    if (!home) return translate('err.noHome')
    const labLevel = home.buildings[31] ?? 0
    const level = s.techs[objectId] ?? 0
    if (def.maxLevel > 0 && level >= def.maxLevel) return translate('err.maxLevel')
    if (!canResearch(level, labLevel)) return translate('err.labLevel', { n: level + 1 })
    if (!meetsRequires({ ...home.buildings, ...s.techs }, def.requires)) return translate('err.prereqMissing')

    const cost = techCost(def, level)
    if (home.resources.metal < cost.metal || home.resources.crystal < cost.crystal || home.resources.deuterium < cost.deuterium) {
      return translate('err.notEnoughResHome')
    }

    const timeMs = researchTime(def, level, labLevel, s.techs[113] ?? 0) * 1000
    const newItem = { objectId, level: level + 1, startAt: s.gameTime, finishAt: s.gameTime + timeMs }
    const planets = s.planets.map((p) =>
      p.id === home.id
        ? {
            ...p,
            resources: {
              metal: p.resources.metal - cost.metal,
              crystal: p.resources.crystal - cost.crystal,
              deuterium: p.resources.deuterium - cost.deuterium,
            },
          }
        : p,
    )
    set({ planets, researchQueue: [...s.researchQueue, newItem] })
    return null
  },

  buildShips: (planetId, shipId, count) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet || count <= 0) return translate('err.invalidCount')
    const isDef = isDefense(shipId)
    const def = isDef ? DEFENSES[shipId] : SHIPS[shipId]
    if (!def) return translate('err.unitNotFound')
    if (planet.shipQueue.length >= SHIP_SLOTS) return translate('err.shipQueueFull', { n: SHIP_SLOTS })
    if (!meetsRequires({ ...planet.buildings, ...planet.defenses, ...s.techs }, def.requires)) return translate('err.prereqMissing')
    if (isDef) {
      const d = DEFENSES[shipId]
      if (d.maxCount > 0 && (planet.defenses[shipId] ?? 0) + count > d.maxCount) return translate('err.maxCount', { name: translateTerm(shipId, 'defenses'), n: d.maxCount })
      if (isMissile(shipId)) {
        const current = (planet.defenses[502] ?? 0) + (planet.defenses[503] ?? 0)
        const cap = siloCapacity(planet.buildings[44] ?? 0)
        if (current + count > cap) return translate('err.siloCapacity', { cur: current, cap })
      } else {
        // C2：防御占星球空间。队列中的防御也要预留占位，否则可以靠排队绕过空间约束。
        const queuedFields = planet.shipQueue.reduce((acc, q) => acc + (DEFENSE_FIELDS[q.shipId] ?? 0) * q.count, 0)
        const used = usedFields(planet.buildings, planet.defenses) + queuedFields
        const cap = maxFields(planet.buildings, !!planet.isMoon)
        const need = (DEFENSE_FIELDS[shipId] ?? 0) * count
        if (used + need > cap) return translate('err.fieldsShortDefense', { used, cap, need })
      }
    }

    const totalCost = {
      metal: def.cost.metal * count,
      crystal: def.cost.crystal * count,
      deuterium: def.cost.deuterium * count,
    }
    if (planet.resources.metal < totalCost.metal || planet.resources.crystal < totalCost.crystal || planet.resources.deuterium < totalCost.deuterium) {
      return translate('err.notEnoughRes')
    }

    const perUnitMs = shipBuildTime(shipId, planet.buildings[21] ?? 0) * 1000
    const lastFinish = planet.shipQueue.length > 0 ? planet.shipQueue[planet.shipQueue.length - 1].finishAt : s.gameTime
    const item: ShipQueueItem = { shipId, count, startAt: lastFinish, finishAt: lastFinish + perUnitMs * count }

    const planets = s.planets.map((p) =>
      p.id === planetId
        ? {
            ...p,
            resources: {
              metal: p.resources.metal - totalCost.metal,
              crystal: p.resources.crystal - totalCost.crystal,
              deuterium: p.resources.deuterium - totalCost.deuterium,
            },
            shipQueue: [...p.shipQueue, item],
          }
        : p,
    )
    set({ planets })
    return null
  },

  // C2 配套：防御占空间后必须给玩家一个释放空间的出口，否则老存档里
  // 防御超占的星球会永久锁死一切建造。拆解无返还、立即生效——代价就是资源沉没。
  scrapDefense: (planetId, defenseId, count) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet) return translate('err.planetNotFound')
    if (isMissile(defenseId)) return translate('err.missileUseSilo')
    if (!DEFENSES[defenseId]) return translate('err.notDefense')
    const owned = planet.defenses[defenseId] ?? 0
    if (count <= 0 || count > owned) return translate('err.invalidCountOwned', { owned })
    const planets = s.planets.map((p) => {
      if (p.id !== planetId) return p
      const defenses = { ...p.defenses }
      const left = owned - count
      if (left > 0) defenses[defenseId] = left
      else delete defenses[defenseId]
      return { ...p, defenses }
    })
    set({ planets })
    toast(translate('toast.scrapDefense', { name: translateTerm(defenseId, 'defenses'), count, fields: (DEFENSE_FIELDS[defenseId] ?? 0) * count }), 'info')
    return null
  },

  dispatchMission: (originId, to, type, fleet, cargo) => {
    const s = get()
    const origin = s.planets.find((p) => p.id === originId)
    if (!origin) return translate('err.originNotFound')

    let hasShip = false
    for (const id in fleet) {
      if (fleet[+id] > 0) {
        hasShip = true
        if ((origin.ships[+id] ?? 0) < fleet[+id]) return translate('err.shipShortage')
      }
    }
    if (!hasShip) return translate('err.noShipSelected')

    if (type === 'colonize') {
      if (!(fleet[208] > 0)) return translate('err.colonyShipRequired')
      const colonyCount = s.planets.filter((p) => !p.isHome && !p.isMoon).length
      const cap = colonyCap(s.techs)
      if (colonyCount >= cap) return translate('err.colonyCap', { cur: colonyCount, cap })
    }
    if (type === 'espionage' && !(fleet[210] > 0)) return translate('err.probeRequired')
    if (type === 'recycle' && !(fleet[209] > 0)) return translate('err.recyclerRequired')
    if (type === 'expedition' && to.position !== 16) return translate('err.expeditionNeedsDeepSpace')

    // 新手保护：7 天内不能攻击/探测玩家（含 NPC 反向骚扰玩家与玩家主动出击两种情况）
    if ((type === 'attack' || type === 'espionage') && isNewbieShieldActive(s.createdWallAt) && isPlayerPlanetTarget(s, to)) {
      const days = Math.ceil((NEWBIE_SHIELD_MS - (Date.now() - s.createdWallAt)) / (24 * 3600 * 1000))
      return translate('err.newbieShield', { days })
    }

    const activeOut = s.missions.filter((m) => !m.npcOwned && m.phase === 'out').length
    const slots = fleetSlots(s.techs)
    if (activeOut >= slots) return translate('err.fleetSlotsFull', { cur: activeOut, slots })

    const dist = distance(origin.coords, to)
    const activeIds = Object.keys(fleet).filter((id) => fleet[+id] > 0)
    const slowest = Math.min(...activeIds.map((id) => shipSpeed(+id, s.techs)))
    const targetPlanet = s.planets.find((p) => p.coords.galaxy === to.galaxy && p.coords.system === to.system && p.coords.position === to.position)
    const jumpReady =
      type === 'deploy' &&
      !!origin.isMoon &&
      !!targetPlanet?.isMoon &&
      (origin.buildings[43] ?? 0) >= 1 &&
      (targetPlanet.buildings[43] ?? 0) >= 1 &&
      s.gameTime >= (origin.lastJumpAt ?? 0) + 3600000 &&
      s.gameTime >= (targetPlanet.lastJumpAt ?? 0) + 3600000
    const fuel = jumpReady ? 0 : fleetFuel(fleet, dist)
    if (origin.resources.deuterium < fuel) return translate('err.fuelShort', { fuel })
    if (type === 'transport' && fleetCargo(fleet) < cargo.metal + cargo.crystal + cargo.deuterium) return translate('err.cargoTooSmall')
    if (jumpReady && (cargo.metal > 0 || cargo.crystal > 0 || cargo.deuterium > 0)) return translate('err.jumpGateNoCargo')
    // 货物必须从出发星球真实扣除（2026-09-28 修复）：
    // 此前 cargo 只被校验、从不被扣，而任务完成时又会被清零——等于货物凭空消失。
    // 同时校验货物不得超过出发星球库存，否则可以运输不存在的资源。
    // 逐资源给出错误文案，玩家才知道该减哪一项。
    if (type === 'transport') {
      for (const res of ['metal', 'crystal', 'deuterium'] as const) {
        if (cargo[res] > origin.resources[res]) {
          const label = resLabel(res)
          return translate('err.cargoShort', { res: label, have: Math.floor(origin.resources[res]), need: cargo[res] })
        }
      }
    }

    const travelMs = jumpReady ? 0 : flightTime(dist, slowest) * 1000
    const planets = s.planets.map((p) => {
      if (p.id === originId) {
        const ships = { ...p.ships }
        for (const id in fleet) ships[+id] = (ships[+id] ?? 0) - fleet[+id]
        return {
          ...p,
          ships,
          // 扣燃料（全部任务）+ 扣货物（仅运输）。非运输任务 cargo 恒为 0，减法无副作用。
          resources: {
            metal: p.resources.metal - cargo.metal,
            crystal: p.resources.crystal - cargo.crystal,
            deuterium: p.resources.deuterium - fuel - cargo.deuterium,
          },
          lastJumpAt: jumpReady ? s.gameTime : p.lastJumpAt,
        }
      }
      if (jumpReady && targetPlanet && p.id === targetPlanet.id) {
        return { ...p, lastJumpAt: s.gameTime }
      }
      return p
    })
    const missions = [
      ...s.missions,
      { id: s.nextId, type, originId, from: origin.coords, to, fleet, cargo, departAt: s.gameTime, arriveAt: s.gameTime + travelMs, phase: 'out' as const },
    ]
    set({ planets, missions, nextId: s.nextId + 1 })
    return null
  },

  phalanxScan: (galaxy, system) => {
    const s = get()
    const moon = s.planets.find((p) => {
      if (!p.isMoon) return false
      const lv = p.buildings[42] ?? 0
      if (lv <= 0 || p.coords.galaxy !== galaxy) return false
      const range = lv * lv - 1
      const raw = Math.abs(p.coords.system - system)
      return Math.min(raw, SYSTEM_COUNT - raw) <= range
    })
    if (!moon) return translate('err.outOfSensorRange')
    if (moon.resources.deuterium < PHALANX_SCAN_COST) return translate('err.phalanxFuel', { n: PHALANX_SCAN_COST })
    set({
      planets: s.planets.map((p) =>
        p.id === moon.id
          ? { ...p, resources: { ...p.resources, deuterium: p.resources.deuterium - PHALANX_SCAN_COST } }
          : p,
      ),
    })
    return null
  },

  skipTutorial: () => {
    set({ tutorialSkipped: true })
  },

  renamePlanet: (planetId, name) => {
    const s = get()
    const trimmed = name.trim()
    if (!trimmed) return
    set({ planets: s.planets.map((p) => (p.id === planetId ? { ...p, name: trimmed.slice(0, 24) } : p)) })
  },

  abandonPlanet: (planetId) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet) return translate('err.planetNotFound')
    if (planet.isHome) return translate('err.homeNotAbandonable')
    if (s.missions.some((m) => m.originId === planetId)) return translate('err.fleetInFlight')
    set({
      planets: s.planets.filter((p) => p.id !== planetId),
      currentPlanet: s.currentPlanet === planetId ? (s.planets.find((p) => p.isHome)?.id ?? 1) : s.currentPlanet,
    })
    toast(translate('toast.colonyAbandoned', { g: planet.coords.galaxy, s: planet.coords.system, p: planet.coords.position }), 'warn')
    return null
  },

  cancelBuildingQueue: (planetId, index) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    const item = planet?.buildingQueue[index]
    if (!planet || !item) return
    const def = BUILDINGS[item.objectId]
    if (def) {
      const cost = buildingCost(def, item.level - 1)
      let refundLoss: ResDelta = { metal: 0, crystal: 0, deuterium: 0 }
      set({
        planets: s.planets.map((p) =>
          p.id === planetId
            ? (() => {
                const g = grantResources(p, cost, s.officers.commander ? 1.1 : 1)
                refundLoss = g.overflow
                return { ...p, buildingQueue: p.buildingQueue.filter((_, i) => i !== index), resources: g.resources }
              })()
            : p,
        ),
      })
      toast(translate('toast.buildingCancelled', { name: translateTerm(item.objectId, 'buildings') }), 'info')
      if (overflowText(refundLoss)) toast(translate('toast.refundCapped'), 'error')
    }
  },

  // 暂停 = 冻结剩余时间；恢复 = 从当前游戏时刻重新起算。
  // finishAt 保留原值仅作进度条基准，tick 靠 pausedRemaining 跳过已完成判定。
  togglePauseBuildingQueue: (planetId, index) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    const item = planet?.buildingQueue[index]
    if (!planet || !item) return
    const gameNow = s.gameTime
    const buildingQueue = planet.buildingQueue.map((q, i) => {
      if (i !== index) return q
      if (q.pausedRemaining !== undefined) {
        const { pausedRemaining, ...rest } = q
        return { ...rest, finishAt: gameNow + pausedRemaining }
      }
      return { ...q, pausedRemaining: Math.max(0, q.finishAt - gameNow) }
    })
    set({
      planets: s.planets.map((p) => (p.id === planetId ? { ...p, buildingQueue } : p)),
    })
  },

  moveBuildingQueue: (planetId, index, dir) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet) return
    const target = index + dir
    if (target < 0 || target >= planet.buildingQueue.length) return
    const buildingQueue = [...planet.buildingQueue]
    ;[buildingQueue[index], buildingQueue[target]] = [buildingQueue[target], buildingQueue[index]]
    set({
      planets: s.planets.map((p) => (p.id === planetId ? { ...p, buildingQueue } : p)),
    })
  },

  cancelResearchQueue: (index) => {
    const s = get()
    if (index < 0 || index >= s.researchQueue.length) return
    const def = TECHS[s.researchQueue[index].objectId]
    const home = s.planets.find((p) => p.isHome)
    if (!def || !home) return
    const cost = techCost(def, s.researchQueue[index].level - 1)
    let refundLoss: ResDelta = { metal: 0, crystal: 0, deuterium: 0 }
    set({
      researchQueue: s.researchQueue.filter((_, i) => i !== index),
      planets: s.planets.map((p) =>
        p.id === home.id
          ? (() => {
              const g = grantResources(p, cost, s.officers.commander ? 1.1 : 1)
              refundLoss = g.overflow
              return { ...p, resources: g.resources }
            })()
          : p,
      ),
    })
    toast(translate('toast.researchCancelled', { name: translateTerm(def.id, 'techs') }), 'info')
    if (overflowText(refundLoss)) toast(translate('toast.refundCapped'), 'error')
  },

  cancelShipQueueItem: (planetId, index) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    const item = planet?.shipQueue[index]
    if (!planet || !item) return
    const def = isDefense(item.shipId) ? DEFENSES[item.shipId] : SHIPS[item.shipId]
    const perUnit = shipBuildTime(item.shipId, planet.buildings[21] ?? 0) * 1000
    const remaining = Math.max(0, Math.ceil((item.finishAt - s.gameTime) / Math.max(1, perUnit)))
    const refundCount = Math.min(item.count, remaining)
    let refundLoss: ResDelta = { metal: 0, crystal: 0, deuterium: 0 }
    const planets = s.planets.map((p) => {
      if (p.id !== planetId) return p
      // 2026-09-29：原先是裸 + 退款，不封顶。与 cancelBuildingQueue / cancelResearchQueue
      // 是同一「退款」语义，此前只有后两者封顶——同一语义两条实现，只有一条守上限。
      const g = grantResources(p, {
        metal: (def?.cost.metal ?? 0) * refundCount,
        crystal: (def?.cost.crystal ?? 0) * refundCount,
        deuterium: (def?.cost.deuterium ?? 0) * refundCount,
      }, s.officers.commander ? 1.1 : 1)
      refundLoss = g.overflow
      return { ...p, shipQueue: p.shipQueue.filter((_, i) => i !== index), resources: g.resources }
    })
    set({ planets })
    toast(translate('toast.shipCancelled', { name: termOr(item.shipId, isDefense(item.shipId) ? 'defenses' : 'ships', 'toast.genericUnit'), count: refundCount }), 'info')
    if (overflowText(refundLoss)) toast(translate('toast.refundCapped'), 'error')
  },

  hireOfficer: (officerId) => {
    const s = get()
    const def = OFFICERS[officerId]
    if (!def) return translate('err.officerNotFound')
    if (s.officers[officerId]) return translate('err.alreadyHired')
    const home = s.planets.find((p) => p.isHome)
    if (!home) return translate('err.noHome')
    if (home.resources.metal < def.hireCost.metal || home.resources.crystal < def.hireCost.crystal || home.resources.deuterium < def.hireCost.deuterium) {
      return translate('err.notEnoughResHome')
    }
    set({
      planets: s.planets.map((p) =>
        p.id === home.id
          ? {
              ...p,
              resources: {
                metal: p.resources.metal - def.hireCost.metal,
                crystal: p.resources.crystal - def.hireCost.crystal,
                deuterium: p.resources.deuterium - def.hireCost.deuterium,
              },
            }
          : p,
      ),
      officers: { ...s.officers, [officerId]: { hiredAt: s.gameTime, nextUpkeepAt: s.gameTime + 7 * 24 * 3600 * 1000 } },
    })
    toast(translate('toast.officerHired', { name: localizeField(def, 'name'), desc: localizeField(def, 'desc') }), 'success')
    sfx('complete')
    return null
  },

  fireOfficer: (officerId) => {
    const s = get()
    const officers = { ...s.officers }
    delete officers[officerId]
    set({ officers })
    toast(translate('toast.officerFired', { name: localizeField(OFFICERS[officerId], 'name') || translate('toast.genericOfficer') }), 'info')
  },

  trade: (planetId, give, getRes, amount) => {
    const s = get()
    if (give === getRes) return translate('err.sameResource')
    if (amount <= 0) return translate('err.invalidCount')
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet) return translate('err.planetNotFound')
    if (planet.resources[give] < amount) return translate('err.notEnoughRes')
    const VALUE = { metal: 1, crystal: 1.5, deuterium: 3 } as const
    const got = Math.floor((amount * VALUE[give] * 0.95) / VALUE[getRes])
    if (got <= 0) return translate('err.tooSmallToTrade')
    const cmdMul = s.officers.commander ? 1.1 : 1
    // 2026-09-29：收益侧原先是裸 `+ got` 不封顶，目标资源满仓时被下一 tick 的
    // produce() 削为 0，而付出侧已经真实扣除 —— 玩家白付 1000 金属、颗粒无收
    // （实测 netMetal = -1000），且全流程没有任何提示。
    // 现在两侧统一走 grantResources：先扣，再按仓容入账并如实返回溢出。
    // 若收益装不下，只扣「实际能换到的」那部分，避免净损失。
    const capOf = (res: 'metal' | 'crystal' | 'deuterium'): number => {
      const b = planet.buildings
      const base = res === 'metal' ? storageCapacity(b[22] ?? 0) : res === 'crystal' ? storageCapacity(b[23] ?? 0) : storageCapacity(b[24] ?? 0)
      return base * cmdMul
    }
    const headroom = capOf(getRes) - planet.resources[getRes]
    if (headroom < 1) return translate('err.tradeStorageFull', { res: resLabel(getRes) })
    const giveable = Math.min(got, Math.floor(headroom))
    if (giveable < 1) return translate('err.tooSmallToTrade')
    const charged = giveable < got ? Math.ceil((giveable * VALUE[getRes]) / (VALUE[give] * 0.95)) : amount

    let gained = 0
    const planets = s.planets.map((p) => {
      if (p.id !== planetId) return p
      // 付出侧用普通减法，**不能**走 grantResources：它是双向封顶的
      // （Math.min(cap, max(0, want))），拿它扣款会把库存「夹回」仓容上限——
      // 实测金属 20000 扣款后反而变成 10000。扣减方向由上面的余额校验兜底。
      const deducted = { ...p.resources, [give]: p.resources[give] - charged }
      const credited = grantResources({ ...p, resources: deducted }, { [getRes]: giveable } as Partial<ResDelta>, cmdMul)
      gained = credited.resources[getRes] - deducted[getRes]
      return { ...p, resources: credited.resources }
    })
    set({ planets, stats: { ...s.stats, trades: s.stats.trades + 1 } })
    if (gained < got) {
      toast(translate('toast.tradeCapped', { charged, giveRes: resLabel(give), gained, getRes: resLabel(getRes), short: got - gained }), 'info')
    } else {
      toast(translate('toast.tradeDone', { charged, giveRes: resLabel(give), gained, getRes: resLabel(getRes) }), 'success')
    }
    sfx('complete')
    return null
  },

  claimDaily: () => {
    const s = get()
    const today = new Date().toDateString()
    if (s.lastDailyClaimWallAt > 0 && new Date(s.lastDailyClaimWallAt).toDateString() === today) return
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toDateString()
    const streak = s.lastDailyClaimWallAt > 0 && new Date(s.lastDailyClaimWallAt).toDateString() === yesterday ? s.dailyStreak + 1 : 1
    const mul = Math.min(streak, 7)
    const reward = { metal: 1000 * mul, crystal: 500 * mul, deuterium: 250 * mul }
    const home = s.planets.find((p) => p.isHome)
    // 2026-09-29：原先是裸 `+ reward.*`，满仓时奖励被下一 tick 的 produce() 削为 0，
    // 而 toast 仍显示「+7000 / +3500 / +1750」—— 显示与实际不符的误导。
    // 现在按实际入账量播报，装不下的部分明确告知。
    let actual = { metal: 0, crystal: 0, deuterium: 0 }
    const planets = home
      ? s.planets.map((p) => {
          if (p.id !== home.id) return p
          const before = p.resources
          const g = grantResources(p, reward, s.officers.commander ? 1.1 : 1)
          actual = {
            metal: g.resources.metal - before.metal,
            crystal: g.resources.crystal - before.crystal,
            deuterium: g.resources.deuterium - before.deuterium,
          }
          return { ...p, resources: g.resources }
        })
      : s.planets
    set({ planets, lastDailyClaimWallAt: Date.now(), dailyStreak: streak })
    const actualTotal = actual.metal + actual.crystal + actual.deuterium
    const wantedTotal = reward.metal + reward.crystal + reward.deuterium
    if (actualTotal < wantedTotal) {
      toast(translate('toast.dailyCapped', { streak, metal: actual.metal, crystal: actual.crystal, deuterium: actual.deuterium, lost: wantedTotal - actualTotal }), 'info')
    } else {
      toast(translate('toast.dailyDone', { streak, metal: reward.metal, crystal: reward.crystal, deuterium: reward.deuterium }), 'success')
    }
    sfx('complete')
  },

  dispatchMissiles: (planetId, to, count) => {
    const s = get()
    const planet = s.planets.find((p) => p.id === planetId)
    if (!planet) return translate('err.planetNotFound')
    if ((planet.buildings[44] ?? 0) < 1) return translate('err.missileSiloRequired')
    if (count <= 0) return translate('err.invalidCount')
    if ((planet.defenses[502] ?? 0) < count) return translate('err.missileShortage', { n: planet.defenses[502] ?? 0 })

    // 新手保护：导弹打击同样不能打到玩家星球
    if (isNewbieShieldActive(s.createdWallAt) && isPlayerPlanetTarget(s, to)) {
      const days = Math.ceil((NEWBIE_SHIELD_MS - (Date.now() - s.createdWallAt)) / (24 * 3600 * 1000))
      return translate('err.newbieShieldMissile', { days })
    }

    const dist = distance(planet.coords, to)
    const travelMs = flightTime(dist, 30000) * 1000
    const planets = s.planets.map((p) =>
      p.id === planetId
        ? { ...p, defenses: { ...p.defenses, 502: (p.defenses[502] ?? 0) - count } }
        : p,
    )
    const missions = [
      ...s.missions,
      {
        id: s.nextId, type: 'missile' as const, originId: planetId, from: planet.coords, to,
        fleet: {}, cargo: { metal: 0, crystal: 0, deuterium: 0 },
        departAt: s.gameTime, arriveAt: s.gameTime + travelMs, phase: 'out' as const, missileCount: count,
      },
    ]
    set({ planets, missions, nextId: s.nextId + 1, stats: { ...s.stats, missilesFired: s.stats.missilesFired + count } })
    toast(translate('toast.missilesLaunched', { count, g: to.galaxy, s: to.system, p: to.position }), 'warn')
    sfx('battle')
    return null
  },

  playCampaign: (planetId, stageId, fleet) => {
    const s = get()
    const stage = CAMPAIGN_STAGES.find((st) => st.id === stageId)
    const planet = s.planets.find((p) => p.id === planetId)
    if (!stage || !planet) return translate('err.stageOrPlanetNotFound')
    let hasShip = false
    for (const id in fleet) {
      if (fleet[+id] > 0) {
        hasShip = true
        if ((planet.ships[+id] ?? 0) < fleet[+id]) return translate('err.shipShortage')
      }
    }
    if (!hasShip) return translate('err.noShipSelected')

    const input: BattleInput = {
      attackerFleets: [buildFleetInput(fleet, s.techs, s.nextId)],
      defenderFleets: [buildFleetInput({ ...stage.enemyFleet, ...stage.enemyDefenses }, {}, s.nextId + 1000000)],
    }
    const output = simulate(input)
    const last = output.rounds[output.rounds.length - 1]
    const survivors = last?.attackerFleetResults[s.nextId]?.unitsResult ?? {}
    const enemySurvivors = last?.defenderFleetResults[s.nextId + 1000000]?.unitsResult ?? {}
    const won = Object.keys(enemySurvivors).length === 0
    const firstClear = won && !s.campaignDone.includes(stageId)

    const planets = s.planets.map((p) => {
      if (p.id !== planetId) return p
      const ships = { ...p.ships }
      for (const id in fleet) {
        ships[+id] = (ships[+id] ?? 0) - fleet[+id] + (survivors[+id] ?? 0)
        if (ships[+id] <= 0) delete ships[+id]
      }
      let resources = { ...p.resources }
      if (firstClear) {
        // 2026-09-29：原先裸 += 不封顶。后段关卡奖励量级很大（普通第 7 关 10 万金属/5 万晶体），
        // 满仓时整笔首通奖励归零，玩家却看到「首通达成」。
        const g = grantResources(p, stage.reward, s.officers.commander ? 1.1 : 1)
        resources = g.resources
        warnOverflow(g.overflow, 'toast.overflowCampaign')
        if (stage.rewardShips) for (const id in stage.rewardShips) ships[+id] = (ships[+id] ?? 0) + stage.rewardShips[+id]
      }
      return { ...p, ships, resources }
    })

    const reports = [
      ...s.reports,
      {
        kind: 'battle' as const, id: s.nextId, time: s.gameTime, wallAt: Date.now(), coords: planet.coords,
        targetName: translate('exp.campaignTarget', { name: localizeField(stage, 'name') }), input, output,
        loot: firstClear ? stage.reward : { metal: 0, crystal: 0, deuterium: 0 },
        debris: { metal: 0, crystal: 0 },
        result: (won ? 'win' : Object.keys(survivors).length === 0 ? 'loss' : 'draw') as 'win' | 'loss' | 'draw',
      },
    ].slice(-100)
    const stats = { ...s.stats, battlesTotal: s.stats.battlesTotal + 1, battlesWon: s.stats.battlesWon + (won ? 1 : 0), campaignWins: s.stats.campaignWins + (won ? 1 : 0) }
    const campaignDone = firstClear ? [...s.campaignDone, stageId] : s.campaignDone
    set({ planets, reports, stats, campaignDone, nextId: s.nextId + 1 })
    // OGameX 路线：含随机性的战斗结算后立即落库。战役在 action 里同步结算，
    // 不经过 tick 的 dirty 存档——缺了这一步，玩家打完看结果不满意，
    // 刷新页面就能当这场战斗没发生过（免费重roll）。
    writeSlot(0, snapshot(get()), SLOT_NAMES[0].name)
    toast(
      won
        ? translate('toast.campaignWin', {
            name: localizeField(stage, 'name'),
            extra: firstClear ? translate('toast.campaignFirstClear') : translate('toast.campaignRepeat'),
          })
        : translate('toast.campaignLoss', { name: localizeField(stage, 'name') }),
      won ? 'success' : 'error',
    )
    sfx('battle')
    return null
  },

  playCampaignElite: (planetId, stageId, fleet) => {
    const s = get()
    const stage = CAMPAIGN_ELITE_STAGES.find((st) => st.id === stageId)
    const planet = s.planets.find((p) => p.id === planetId)
    if (!stage || !planet) return translate('err.stageOrPlanetNotFound')
    let hasShip = false
    for (const id in fleet) {
      if (fleet[+id] > 0) {
        hasShip = true
        if ((planet.ships[+id] ?? 0) < fleet[+id]) return translate('err.shipShortage')
      }
    }
    if (!hasShip) return translate('err.noShipSelected')

    const input: BattleInput = {
      attackerFleets: [buildFleetInput(fleet, s.techs, s.nextId)],
      defenderFleets: [buildFleetInput({ ...stage.enemyFleet, ...stage.enemyDefenses }, {}, s.nextId + 1000000)],
    }
    const output = simulate(input)
    const last = output.rounds[output.rounds.length - 1]
    const survivors = last?.attackerFleetResults[s.nextId]?.unitsResult ?? {}
    const enemySurvivors = last?.defenderFleetResults[s.nextId + 1000000]?.unitsResult ?? {}
    const won = Object.keys(enemySurvivors).length === 0
    const firstClear = won && !s.campaignEliteDone.includes(stageId)

    const planets = s.planets.map((p) => {
      if (p.id !== planetId) return p
      const ships = { ...p.ships }
      for (const id in fleet) {
        ships[+id] = (ships[+id] ?? 0) - fleet[+id] + (survivors[+id] ?? 0)
        if (ships[+id] <= 0) delete ships[+id]
      }
      let resources = { ...p.resources }
      if (firstClear) {
        // 精英关只发放资源——故意不复用 stage.rewardShips（精英数据本身就不带该字段）。
        // 防止玩家纯靠首通反复白嫖 207 战列舰等顶级舰船，破坏长期进度曲线。
        // 2026-09-29：原先裸 += 不封顶，精英关奖励量级更大，满仓时整笔首通奖励归零。
        const g = grantResources(p, stage.reward, s.officers.commander ? 1.1 : 1)
        resources = g.resources
        warnOverflow(g.overflow, 'toast.overflowElite')
      }
      return { ...p, ships, resources }
    })

    const reports = [
      ...s.reports,
      {
        kind: 'battle' as const, id: s.nextId, time: s.gameTime, wallAt: Date.now(), coords: planet.coords,
        targetName: translate('exp.eliteTarget', { name: localizeField(stage, 'name') }), input, output,
        loot: firstClear ? stage.reward : { metal: 0, crystal: 0, deuterium: 0 },
        debris: { metal: 0, crystal: 0 },
        result: (won ? 'win' : Object.keys(survivors).length === 0 ? 'loss' : 'draw') as 'win' | 'loss' | 'draw',
      },
    ].slice(-100)
    const stats = { ...s.stats, battlesTotal: s.stats.battlesTotal + 1, battlesWon: s.stats.battlesWon + (won ? 1 : 0), campaignWins: s.stats.campaignWins + (won ? 1 : 0) }
    const campaignEliteDone = firstClear ? [...s.campaignEliteDone, stageId] : s.campaignEliteDone
    set({ planets, reports, stats, campaignEliteDone, nextId: s.nextId + 1 })
    writeSlot(0, snapshot(get()), SLOT_NAMES[0].name)
    toast(
      won
        ? translate('toast.eliteWin', {
            name: localizeField(stage, 'name'),
            extra: firstClear ? translate('toast.campaignFirstClear') : translate('toast.campaignRepeat'),
          })
        : translate('toast.eliteLoss', { name: localizeField(stage, 'name') }),
      won ? 'success' : 'error',
    )
    sfx('battle')
    return null
  },
}))

function unitSum(cost: Resource | undefined, n: number): number {
  if (!cost) return 0
  return (cost.metal + cost.crystal + cost.deuterium) * n
}

// C6：逐座 70% 概率修复（OGame 原生规则）。旧实现 Math.round(destroyed × 0.7)
// 无条件触发——destroyed=1 时必然"修回"一座，防御永不净损失。
// 逐座掷骰保证修复数 ≤ 被毁数，期望同为 0.7/座但分布诚实。
// ponytail: seed 由 caller 注入（来自 gameNow + destroyed），使 save→reload 时
// 修复数稳定——同存档 reload 不再 re-roll 防御修复数。
function rollDefenseRepairs(destroyed: number, seed: number): number {
  if (destroyed <= 0) return 0
  const rng = mulberry32(seed)
  let repaired = 0
  for (let i = 0; i < destroyed; i++) if (rng() < 0.7) repaired++
  return repaired
}

export function playerScore(data: Pick<SaveData, 'planets' | 'techs'>): number {
  let total = 0
  for (const p of data.planets) {
    for (const id in p.buildings) {
      const def = BUILDINGS[+id]
      if (!def) continue
      const lv = p.buildings[+id]
      for (let l = 0; l < lv; l++) {
        const c = buildingCost(def, l)
        total += c.metal + c.crystal + c.deuterium
      }
    }
    for (const id in p.ships) total += unitSum(SHIPS[+id]?.cost, p.ships[+id])
    for (const id in p.defenses) total += unitSum(DEFENSES[+id]?.cost, p.defenses[+id])
  }
  for (const id in data.techs) {
    const def = TECHS[+id]
    if (!def) continue
    const lv = data.techs[+id]
    for (let l = 0; l < lv; l++) {
      const f = Math.pow(def.factor, l)
      total += (def.cost.metal + def.cost.crystal + def.cost.deuterium) * f
    }
  }
  return Math.floor(total / 1000)
}

export function npcScore(npc: NpcPlanet): number {
  let total = 0
  for (const id in npc.fleet) total += unitSum(SHIPS[+id]?.cost, npc.fleet[+id])
  for (const id in npc.defenses) total += unitSum(DEFENSES[+id]?.cost, npc.defenses[+id])
  total += (npc.resources.metal + npc.resources.crystal + npc.resources.deuterium) / 10
  return Math.floor(total / 1000)
}

export { BUILDINGS, DEFENSES, SHIPS, TECHS, buildingCost, buildingTime, techCost, researchTime, shipBuildTime, storageCapacity, metalProduction, crystalProduction, deuteriumProduction, solarOutput, energyConsumption, meetsRequires, canResearch, fleetCargo, isDefense, npcKey }
export type { NpcPlanet }
