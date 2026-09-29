const store = new Map<string, string>()
// @ts-expect-error minimal stub
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  get length() { return store.size },
}

const { useGame } = await import('../src/game/state.ts')

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

const s = () => useGame.getState()

s().newGame('normal')
useGame.setState((st) => ({
  planets: st.planets.map((p) => (p.isHome ? { ...p, ships: { 204: 1 }, resources: { metal: 99999, crystal: 99999, deuterium: 99999 } } : p)),
}))

const npcs = s().npcs
const strong = Object.values(npcs).sort((a, b) => Object.values(b.fleet).reduce((x, y) => x + y, 0) - Object.values(a.fleet).reduce((x, y) => x + y, 0))[0]
assert(!!strong, '存在 NPC 目标')

const err = s().dispatchMission(1, strong.coords, 'attack', { 204: 1 }, { metal: 0, crystal: 0, deuterium: 0 })
assert(err === null, `攻击派遣成功${err ? ': ' + err : ''}`)
assert(s().missions.length === 1, '任务已入队')

const mission = s().missions[0]
useGame.setState((st) => ({ gameTime: mission.arriveAt + 1 }))
s().tick()

const reportsAfterResolve = s().reports.length
assert(reportsAfterResolve >= 1, '战斗结算产生了战报')

const missionsAfterFirst = s().missions.filter((m) => m.phase === 'out').length
assert(missionsAfterFirst === 0, '全灭任务不再停留在 out 阶段（bug 修复验证）')

useGame.setState((st) => ({ gameTime: st.gameTime + 1000 }))
s().tick()
assert(s().missions.length === 0, '第二 tick 后任务队列已清空')
assert(s().reports.length === reportsAfterResolve, '第二 tick 没有重复刷屏战报')

const battlesTotal = s().stats.battlesTotal
useGame.setState((st) => ({ gameTime: st.gameTime + 5000 }))
s().tick()
assert(s().stats.battlesTotal === battlesTotal, '统计计数没有被重复累加')

console.log('---')
console.log('全部断言通过：空舰队任务终止逻辑正确')
