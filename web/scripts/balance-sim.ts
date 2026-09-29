import {
  BUILDINGS, SHIPS, TECHS, SPEED, buildingCost, buildingTime, crystalProduction, deuteriumProduction,
  energyConsumption, metalProduction, researchTime, shipBuildTime, solarOutput, techCost, withEnergyDeficit,
} from '../src/game/objects.ts'

interface SimState {
  t: number
  res: { metal: number; crystal: number; deuterium: number }
  b: Record<number, number>
  tech: Record<number, number>
  ships: Record<number, number>
}

const state: SimState = {
  t: 0,
  res: { metal: 6000, crystal: 2500, deuterium: 3000 },
  b: {},
  tech: {},
  ships: {},
}

function rates(s: SimState) {
  const b = s.b
  const energyOut = solarOutput(b[4] ?? 0, s.tech[113] ?? 0)
  const energyIn = energyConsumption(b[1] ?? 0) + energyConsumption(b[2] ?? 0) + energyConsumption(b[3] ?? 0, true)
  const factor = withEnergyDeficit(1, energyOut, energyIn)
  return {
    metal: (metalProduction(b[1] ?? 0) * factor) / 3600,
    crystal: (crystalProduction(b[2] ?? 0) * factor) / 3600,
    deuterium: (deuteriumProduction(b[3] ?? 0, 130) * factor) / 3600,
  }
}

function advance(s: SimState, seconds: number) {
  const r = rates(s)
  const cap = 10000 * Math.pow(2, Math.max(s.b[22] ?? 0, 0))
  const capC = 10000 * Math.pow(2, s.b[23] ?? 0)
  const capD = 10000 * Math.pow(2, s.b[24] ?? 0)
  s.res.metal = Math.min(cap, s.res.metal + r.metal * seconds)
  s.res.crystal = Math.min(capC, s.res.crystal + r.crystal * seconds)
  s.res.deuterium = Math.min(capD, s.res.deuterium + r.deuterium * seconds)
  s.t += seconds
}

function afford(s: SimState, cost: { metal: number; crystal: number; deuterium: number }) {
  return s.res.metal >= cost.metal && s.res.crystal >= cost.crystal && s.res.deuterium >= cost.deuterium
}

function pay(s: SimState, cost: { metal: number; crystal: number; deuterium: number }) {
  s.res.metal -= cost.metal
  s.res.crystal -= cost.crystal
  s.res.deuterium -= cost.deuterium
}

function waitFor(s: SimState, cost: { metal: number; crystal: number; deuterium: number }) {
  const r = rates(s)
  const capM = 10000 * Math.pow(2, s.b[22] ?? 0)
  const capC = 10000 * Math.pow(2, s.b[23] ?? 0)
  const capD = 10000 * Math.pow(2, s.b[24] ?? 0)
  if (cost.metal > capM || cost.crystal > capC || cost.deuterium > capD) {
    throw new Error(`cost exceeds storage cap: ${JSON.stringify(cost)} caps ${capM}/${capC}/${capD}`)
  }
  let wait = 0
  if (cost.metal > s.res.metal) wait = Math.max(wait, (cost.metal - s.res.metal) / r.metal)
  if (cost.crystal > s.res.crystal) wait = Math.max(wait, (cost.crystal - s.res.crystal) / r.crystal)
  if (cost.deuterium > s.res.deuterium) wait = Math.max(wait, (cost.deuterium - s.res.deuterium) / r.deuterium)
  if (!isFinite(wait)) throw new Error(`zero production for ${JSON.stringify(cost)}`)
  advance(s, wait)
}

function build(s: SimState, id: number) {
  const level = s.b[id] ?? 0
  const def = BUILDINGS[id]
  const cost = buildingCost(def, level)
  waitFor(s, cost)
  pay(s, cost)
  const time = buildingTime(def, level, s.b[14] ?? 0)
  advance(s, time)
  s.b[id] = level + 1
}

function research(s: SimState, id: number) {
  const level = s.tech[id] ?? 0
  const lab = s.b[31] ?? 0
  if (lab <= level) throw new Error(`lab too low for tech ${id} lv${level + 1}`)
  const def = TECHS[id]
  const cost = techCost(def, level)
  waitFor(s, cost)
  pay(s, cost)
  const time = researchTime(def, lab)
  advance(s, time)
  s.tech[id] = level + 1
}

function buildShip(s: SimState, id: number, n: number) {
  const def = SHIPS[id]
  const cost = { metal: def.cost.metal * n, crystal: def.cost.crystal * n, deuterium: def.cost.deuterium * n }
  waitFor(s, cost)
  pay(s, cost)
  const time = shipBuildTime(id, s.b[21] ?? 0) * n
  advance(s, time)
  s.ships[id] = (s.ships[id] ?? 0) + n
}

function stamp(label: string) {
  const h = state.t / 3600
  const when = h < 1 ? `${(state.t / 60).toFixed(1)} 分钟` : h < 48 ? `${h.toFixed(1)} 小时` : `${(h / 24).toFixed(2)} 天`
  console.log(`${label.padEnd(14)} T+${when}`)
}

const seq: Array<['b' | 'r' | 's', number, number?]> = [
  ['b', 4], ['b', 1], ['b', 2], ['b', 4], ['b', 1], ['b', 2], ['b', 3], ['b', 4],
  ['b', 14], ['b', 14], ['b', 31], ['r', 113], ['r', 115], ['b', 21],
  ['s', 204, 1],
  ['b', 1], ['b', 4], ['b', 2], ['b', 3], ['b', 22],
  ['b', 31], ['r', 117],
  ['b', 23], ['b', 31], ['r', 117],
  ['b', 21], ['b', 21], ['r', 117],
  ['b', 4], ['b', 4], ['s', 208, 1],
  ['b', 21], ['b', 21],
  ['b', 23], ['b', 22],
  ['b', 31], ['r', 117], ['b', 31], ['r', 117],
  ['r', 113], ['r', 113], ['r', 113],
  ['r', 120], ['r', 120], ['r', 120], ['r', 120], ['r', 120],
  ['r', 121], ['r', 121],
  ['b', 21], ['b', 21],
  ['b', 22], ['b', 22],
  ['b', 1], ['b', 1], ['b', 1], ['b', 2], ['b', 2], ['b', 2], ['b', 3], ['b', 3], ['b', 3], ['b', 4], ['b', 4],
  ['b', 1], ['b', 1], ['b', 1], ['b', 2], ['b', 2], ['b', 2], ['b', 3], ['b', 3], ['b', 4], ['b', 4],
  ['s', 207, 1],
]

for (const [kind, id, n] of seq) {
  const before = state.t
  if (kind === 'b') build(state, id)
  else if (kind === 'r') research(state, id)
  else buildShip(state, id, n ?? 1)
  const label = kind === 'b' ? `建筑${id}→L${state.b[id]}` : kind === 'r' ? `科技${id}→L${state.tech[id]}` : `船${id}×${n ?? 1}`
  console.log(`${label.padEnd(12)} 耗时 ${((state.t - before) / 3600).toFixed(2)}h  累计 T+${(state.t / 86400).toFixed(2)}d`)
  if (kind === 's' && id === 204) stamp('首轻战')
  if (kind === 's' && id === 208) stamp('首殖民船')
  if (kind === 's' && id === 207) stamp('首战列舰')
}

console.log('---')
console.log(`SPEED=${SPEED}  结束资源: 金属 ${Math.floor(state.res.metal)} 晶体 ${Math.floor(state.res.crystal)} 重氢 ${Math.floor(state.res.deuterium)}`)
console.log(`建筑: ${JSON.stringify(state.b)}`)
console.log(`科技: ${JSON.stringify(state.tech)}`)
console.log('锚点对照: 首轻战 ≤15分钟 | 首殖民地 T+8~12h | 首战列 T+3~3.5天')
