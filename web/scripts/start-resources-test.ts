// 新游戏 1 亿起始资源不被仓库上限夹紧（regression test）。
// 触发条件：state.ts newGameData 把起始资源改成 1e8，但 home.buildings[22/23/24]=0
// 时 produce 第一次 tick 会把全部资源 Math.min 到 storageCapacity(0) = 1e4。
// 修复后默认仓库 = 14，上限 1.64e8，1 亿不会被夹紧。

const _ls: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => _ls[k] ?? null,
  setItem: (k: string, v: string) => { _ls[k] = v },
  removeItem: (k: string) => { delete _ls[k] },
  clear: () => { for (const k in _ls) delete _ls[k] },
  key: (i: number) => Object.keys(_ls)[i] ?? null,
  get length() { return Object.keys(_ls).length },
} as any

import { useGame } from '../src/game/state.ts'
import { generateAllNpcs } from '../src/game/npc.ts'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('FAIL: ' + msg); process.exit(1) }
  console.log('PASS: ' + msg)
}

const ug: any = useGame as any
ug.setState({ npcs: generateAllNpcs(1, 1) })
ug.getState().newGame()

let s = ug.getState()
const home = s.planets[0]
assert(home.resources.metal === 100000000, `新游戏金属 = 1e8 (实际 ${home.resources.metal})`)
assert(home.resources.crystal === 100000000, `新游戏晶体 = 1e8 (实际 ${home.resources.crystal})`)
assert(home.resources.deuterium === 100000000, `新游戏重氢 = 1e8 (实际 ${home.resources.deuterium})`)
assert((home.buildings[22] ?? 0) >= 14, `金属仓库 ≥14 (实际 ${home.buildings[22]})`)
assert((home.buildings[23] ?? 0) >= 14, `晶体仓库 ≥14 (实际 ${home.buildings[23]})`)
assert((home.buildings[24] ?? 0) >= 14, `重氢仓库 ≥14 (实际 ${home.buildings[24]})`)

const capMetal = 10000 * Math.pow(2, home.buildings[22])
const capCrystal = 10000 * Math.pow(2, home.buildings[23])
const capDeut = 10000 * Math.pow(2, home.buildings[24])
assert(capMetal >= 100000000, `金属上限 ≥1e8 (实际 ${capMetal})`)
assert(capCrystal >= 100000000, `晶体上限 ≥1e8 (实际 ${capCrystal})`)
assert(capDeut >= 100000000, `重氢上限 ≥1e8 (实际 ${capDeut})`)

// 模拟 1 分钟后 tick：没有矿，产量=0，资源应仍 ≈ 1e8（不被夹紧到 1e4）。
ug.setState({ lastWallTick: Date.now() - 60_000 })
ug.getState().tick()
s = ug.getState()
const h2 = s.planets[0]
assert(h2.resources.metal >= 100000000, `1 分钟后金属未被夹紧 (实际 ${h2.resources.metal})`)
assert(h2.resources.crystal >= 100000000, `1 分钟后晶体未被夹紧 (实际 ${h2.resources.crystal})`)
assert(h2.resources.deuterium >= 100000000, `1 分钟后重氢未被夹紧 (实际 ${h2.resources.deuterium})`)

console.log('\n全部断言通过：1 亿起始资源不被仓库上限夹紧')