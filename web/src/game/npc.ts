import type { Coordinate } from './objects'
import { SHIPS } from './objects'
import { mulberry32 } from './prng'

export interface NpcPlanet {
  name: string
  coords: Coordinate
  fleet: Record<number, number>
  defenses: Record<number, number>
  hasMoon?: boolean
  moonDefenseIds?: number[]
  // 反侦察强度，作为侦察公式里的"对方间谍技术等级"。按难度档 0/2/4，
  // 使高难度 NPC 必须靠更多探测器或更高间谍技术才能看穿。
  espionageTech?: number
  // NPC 动态成长档位（2026-09-27）：档数 = floor(gameNow / interval)，幂等去重用
  growthStage?: number
  resources: { metal: number; crystal: number; deuterium: number }
  activity: 'inactive' | 'moderate'
  lastRegen: number
  respawnAt?: number
}

export function npcKey(c: Coordinate): string {
  return `${c.galaxy}:${c.system}:${c.position}`
}

export const GALAXY_COUNT = 3
export const SYSTEM_COUNT = 20
export const NPC_POSITIONS = [4, 9]

function galaxyMul(galaxy: number): number {
  return galaxy === 1 ? 1 : galaxy === 2 ? 1.6 : 2.5
}

export function generateNpc(galaxy: number, system: number, position: number, resMul = 1, fleetMul = 1): NpcPlanet | null {
  const gMul = galaxyMul(galaxy)
  resMul *= gMul
  fleetMul *= gMul
  const rng = mulberry32(galaxy * 100000 + system * 1000 + position)
  if (rng() > 0.7) return null

  // 与 npcRegen / counterattackFleet 共用同一套分档；此前这里用 system<=10，
  // 与 npcDifficultyOf 的 system<=12 冲突，导致 system 11-12 的星球按"困难"生成，
  // 后续再生与实际强度却按"中等"结算。
  const difficulty = npcDifficultyOf(system)
  const names = ['废弃前哨', '红沙殖民地', '铁幕站', '静默之环', '焦土基地', '远星哨站']
  const fleet: Record<number, number> = {}
  const add = (id: number, n: number) => {
    n = Math.round(n * fleetMul)
    if (n > 0) fleet[id] = n
  }

  if (difficulty === 0) {
    // 安全区（系统 1-5）1-2 架轻战：新手按教程凑出的首支小队（3 架轻战）
    // 必须能打赢第一仗，否则"首胜"成就与整条征伐线都无从谈起。中高危分档不变。
    add(204, 1 + Math.floor(rng() * 2))
  } else if (difficulty === 1) {
    add(204, 5 + Math.floor(rng() * 11))
    add(205, Math.floor(rng() * 4))
  } else {
    add(204, 10 + Math.floor(rng() * 11))
    add(205, 2 + Math.floor(rng() * 5))
    if (rng() > 0.6) add(206, 1)
  }
  add(210, Math.floor(rng() * 3))

  const defenses: Record<number, number> = {}
  const addDef = (id: number, n: number) => {
    n = Math.round(n * fleetMul)
    if (n > 0) defenses[id] = n
  }
  if (difficulty === 1) {
    addDef(401, 2 + Math.floor(rng() * 4))
  } else if (difficulty === 2) {
    addDef(401, 3 + Math.floor(rng() * 5))
    addDef(402, Math.floor(rng() * 3))
    if (rng() > 0.7) addDef(403, 1)
  }

  let hasMoon = false
  let moonDefenseIds: number[] | undefined
  if ((difficulty >= 2 || galaxy >= 2) && rng() > 0.6) {
    hasMoon = true
    moonDefenseIds = []
    const addMoon = (id: number, n: number) => {
      n = Math.round(n * fleetMul)
      if (n > 0) {
        defenses[id] = (defenses[id] ?? 0) + n
        if (!moonDefenseIds!.includes(id)) moonDefenseIds!.push(id)
      }
    }
    addMoon(403, 1 + Math.floor(rng() * 2))
    if (galaxy >= 2) addMoon(404, 1)
    if (galaxy >= 3 && rng() > 0.5) addMoon(406, 1)
    addMoon(503, Math.floor(rng() * 4))
  }

  const scale = 1 + difficulty
  const fleetPower = Object.entries(fleet).reduce((sum, [id, n]) => sum + (SHIPS[+id]?.attack ?? 0) * n, 0)

  return {
    name: names[Math.floor(rng() * names.length)],
    coords: { galaxy, system, position },
    fleet,
    defenses,
    hasMoon,
    moonDefenseIds,
    espionageTech: difficulty * 2,
    resources: {
      metal: Math.round((800 + fleetPower * 20) * scale * (0.5 + rng()) * resMul),
      crystal: Math.round((400 + fleetPower * 10) * scale * (0.5 + rng()) * resMul),
      deuterium: Math.round((200 + fleetPower * 5) * scale * (0.5 + rng()) * resMul),
    },
    activity: rng() > 0.5 ? 'inactive' : 'moderate',
    lastRegen: 0,
  }
}

export function npcDifficultyOf(system: number): number {
  // 安全区覆盖系统 1-9：母星固定在 1:8:3，玩家星系页默认看到的同星系 NPC（位置 4/9）
  // 必须是新手首支小队（教程补给后约 3 架轻战）能打赢的档位，否则"首胜"永远排在
  // "跑去找低危星系"后面。10-12 中危、13+ 高危保持递进。
  return system <= 9 ? 0 : system <= 12 ? 1 : 2
}

// 老存档里的 NPC 没有 espionageTech 字段，按难度档兜底，避免 undefined 传播成 NaN
export function npcEspionageTech(npc: NpcPlanet): number {
  return npc.espionageTech ?? npcDifficultyOf(npc.coords.system) * 2
}

export function npcRegen(npc: NpcPlanet, gameNow: number): void {
  const difficulty = npcDifficultyOf(npc.coords.system)
  // C4：再生速率翻倍（400/1000/1600 每时）。旧速率下掠夺收益在中期只剩矿产的 3.8%，
  // 整条舰队/军官/残骸系统失去动机。
  const rate = (800 + difficulty * 1200) / 3600000 // ponytail: 再生翻倍。旧速率下掠夺收益 12h 后只占矿产的 3.8%，整条掠夺循环失去动机
  const dt = Math.max(0, gameNow - npc.lastRegen)
  npc.lastRegen = gameNow
  const cap = 120000 + difficulty * 120000 // ponytail: 封顶翻倍。封顶与再生同比例抬升，使一次扫荡仍可清空但回报量级匹配舰队养成周期
  // C7：Math.max 兜底——再生只封顶、不砍存量。旧实现 Math.min(cap, x) 会把
  // 高于上限的存量（如反击增援后）在下次 tick 直接削低。
  npc.resources.metal = Math.max(npc.resources.metal, Math.min(cap, npc.resources.metal + rate * dt))
  npc.resources.crystal = Math.max(npc.resources.crystal, Math.min(cap / 2, npc.resources.crystal + rate * 0.6 * dt))
  npc.resources.deuterium = Math.max(npc.resources.deuterium, Math.min(cap / 4, npc.resources.deuterium + rate * 0.3 * dt))

  const wiped = Object.keys(npc.fleet).length === 0 && Object.keys(npc.defenses).length === 0
  if (wiped) {
    if (!npc.respawnAt) {
      npc.respawnAt = gameNow + 24 * 3600000
    } else if (gameNow >= npc.respawnAt) {
      const rng = mulberry32(Math.floor(gameNow / 3600000) + npc.coords.system * 977)
      const grown = generateNpc(npc.coords.galaxy, npc.coords.system, npc.coords.position)
      if (grown) {
        npc.fleet = grown.fleet
        npc.defenses = grown.defenses
        if (rng() > 0.7 && difficulty >= 1) npc.fleet[204] = (npc.fleet[204] ?? 0) + 3
      }
      npc.respawnAt = undefined
    }
  }
}

/**
 * NPC 动态成长（2026-09-27，机制对照 ogame-vue-ts npcGrowthLogic 的分段实力比例）：
 * 玩家积分越高，NPC 舰队按比例增援——中后期 NPC 不再是静态靶子。
 *
 * 分段（对齐 vue-ts calculateDynamicDifficulty 的节奏，数值按我们的单位口径校定）：
 *   <1k 分（新手期）：不成长（教程保护）
 *   1k-5k：每 6 游戏小时 +1 档增援（轻战），封顶玩家积分的 50% 实力
 *   5k-20k：轻战+重战混合增援，封顶 80%
 *   ≥20k：加入巡洋舰，封顶 110%
 *
 * 幂等性：成长写入 npc.growthStage（老存档缺省 0），每档只加一次；
 * 实力上限用 fleet 造价 ÷ 玩家积分的近似比（unitCost 表直算，不走 Balance 常数）。
 */
export function npcDynamicGrowth(npc: NpcPlanet, playerScore: number, gameNow: number, SHIPS_COST: Record<number, { metal: number; crystal: number; deuterium: number }>): void {
  if (playerScore < 1000) return
  // 被玩家清剿（舰队+防御全空）的 NPC 走 24h 重生管线——growth 不得给空舰队塞兵，
  // 否则 wiped 判定失效、清剿战果被即时回填（2026-09-27 bug 排查修复）。
  const wiped = Object.keys(npc.fleet).length === 0 && Object.keys(npc.defenses).length === 0
  if (wiped) {
    npc.growthStage = Math.floor(gameNow / ((6 - npcDifficultyOf(npc.coords.system)) * 3600000))
    return
  }
  const difficulty = npcDifficultyOf(npc.coords.system)
  const tier = playerScore < 5000 ? 1 : playerScore < 20000 ? 2 : 3
  // 每 6 游戏小时一个成长档；档位间隔随难度略缩短（高危区成长更快）
  const intervalMs = (6 - difficulty) * 3600000
  const stage = Math.floor(gameNow / intervalMs)
  if (stage <= (npc.growthStage ?? 0)) return

  const fleetValue = (fleet: Record<number, number>): number => {
    let v = 0
    for (const id in fleet) {
      const c = SHIPS_COST[+id]
      if (c) v += (c.metal + c.crystal + c.deuterium) * fleet[+id]
    }
    return v / 1000
  }
  const cap = playerScore * (tier === 1 ? 0.5 : tier === 2 ? 0.8 : 1.1) * (0.6 + difficulty * 0.2)
  if (fleetValue(npc.fleet) >= cap) {
    npc.growthStage = stage
    return
  }

  // 按档位增援：seed 由 coords+stage 派生（确定性，与 counterattackFleet 同纪律）
  const rng = mulberry32(hashCoords(npc.coords) + stage * 7919)
  const n = Math.min(12, 2 + tier * 2 + difficulty)
  npc.fleet[204] = (npc.fleet[204] ?? 0) + n
  if (tier >= 2) npc.fleet[205] = (npc.fleet[205] ?? 0) + Math.floor(n / 3)
  if (tier >= 3 && rng() > 0.5) npc.fleet[206] = (npc.fleet[206] ?? 0) + 1 + Math.floor(n / 6)
  npc.growthStage = stage
}

function hashCoords(c: Coordinate): number {
  return c.galaxy * 100000 + c.system * 1000 + c.position
}

export function counterattackFleet(coords: Coordinate, mul: number): Record<number, number> {
  // R10 fix: 原 Math.floor(Math.random()*1e6) 是 fresh entropy，开发者以为 seed 化实际每次刷新 fleet 都变。
  // 改为纯 coords 派生 seed → 同 coords 永远同 fleet（replay determinism）。
  const rng = mulberry32(coords.system * 31337 + coords.position * 7919)
  const difficulty = npcDifficultyOf(coords.system)
  const fleet: Record<number, number> = {}
  const lf = Math.round((3 + difficulty * 5 + Math.floor(rng() * 6)) * mul)
  if (lf > 0) fleet[204] = lf
  if (difficulty >= 1) {
    const hf = Math.round((1 + Math.floor(rng() * 3)) * mul)
    if (hf > 0) fleet[205] = hf
  }
  if (difficulty >= 2 && rng() > 0.5) fleet[206] = 1
  return fleet
}

export function pirateFleet(strength: number, seed?: number): Record<number, number> {
  // R10 fix: 原 Math.floor(Math.random()*1e9) 是 fresh entropy，每次调用都给不同 fleet。
  // 改为 strength 派生 seed（caller 可 override 注入额外 entropy）。
  const s = seed ?? (strength * 2654435761 + 1)
  const rng = mulberry32(s >>> 0)
  const fleet: Record<number, number> = {}
  fleet[204] = Math.max(1, Math.round(strength * (0.7 + rng() * 0.6)))
  if (strength >= 5 && rng() > 0.5) fleet[205] = Math.max(1, Math.floor(strength / 4))
  return fleet
}

export function generateAllNpcs(resMul = 1, fleetMul = 1): Record<string, NpcPlanet> {
  const npcs: Record<string, NpcPlanet> = {}
  for (let g = 1; g <= GALAXY_COUNT; g++) {
    for (let s = 1; s <= SYSTEM_COUNT; s++) {
      for (const p of NPC_POSITIONS) {
        const npc = generateNpc(g, s, p, resMul, fleetMul)
        if (npc) npcs[npcKey({ galaxy: g, system: s, position: p })] = npc
      }
    }
  }
  return npcs
}
