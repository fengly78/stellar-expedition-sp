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

store.set('ogame-sp-session', 'ptest')

const v2Save = {
  meta: { savedWallAt: Date.now(), label: '自动存档', gameTime: 3600000, difficulty: 'normal', planetCount: 1 },
  data: {
    planets: [
      {
        id: 1, name: '母星', coords: { galaxy: 1, system: 8, position: 3 }, isHome: true,
        temperatureMax: 130, resources: { metal: 5000, crystal: 2000, deuterium: 1000 },
        lastTick: 1000, buildings: { 1: 2, 4: 2 }, ships: { 204: 5 },
        buildingQueue: null, shipQueue: [],
      },
    ],
    techs: { 113: 1 },
    researchQueue: null,
    missions: [],
    reports: [{ kind: 'battle', id: 1, time: 100, coords: { galaxy: 1, system: 1, position: 4 }, targetName: '旧战报', input: { attackerFleets: [], defenderFleets: [] }, output: { rounds: [] }, loot: { metal: 0, crystal: 0, deuterium: 0 }, result: 'win' }],
    npcs: {
      '1:1:4': { name: '旧NPC', coords: { galaxy: 1, system: 1, position: 4 }, fleet: { 204: 5 }, resources: { metal: 100, crystal: 50, deuterium: 10 }, activity: 'inactive' },
    },
    nextId: 3,
    saveVersion: 2,
    gameTime: 3600000,
    lastWallTick: Date.now() - 60000,
    timeScale: 1,
    difficulty: 'normal',
    createdWallAt: Date.now() - 86400000,
  },
}
store.set('ogame-sp-save-ptest-0', JSON.stringify(v2Save))

const { useGame } = await import('../src/game/state.ts')

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

const err = useGame.getState().loadFromSlot(0)
assert(err === null, `v2 存档加载成功${err ? ': ' + err : ''}`)

const s = useGame.getState()
assert(s.saveVersion === 11, `版本链式迁移到 v11（实际 v${s.saveVersion}）`)
assert(s.planets[0].defenses !== undefined && typeof s.planets[0].defenses === 'object', 'v2→v3：planets 补 defenses')
assert(s.planets[0].isMoon === false, 'v6→v7：planets 补 isMoon=false')
assert(s.planets[0].posCoef !== undefined && s.planets[0].posCoef.metal === 1, 'v8→v9：planets 补 posCoef')
assert(Array.isArray(s.planets[0].buildingQueue), 'v9→v10：buildingQueue 转数组')
assert(Array.isArray(s.researchQueue), 'v10→v11：researchQueue 转数组')
assert(s.npcs['1:1:4'].defenses !== undefined, 'v2→v3：NPC 补 defenses')
assert(typeof s.npcs['1:1:4'].lastRegen === 'number', 'v3→v4：NPC 补 lastRegen')
assert(s.debrisFields !== undefined, 'v2→v3：补 debrisFields')
assert(s.officers !== undefined, 'v4→v5：补 officers')
assert(s.campaignDone !== undefined && s.campaignDone.length === 0, 'v7→v8：补 campaignDone')
assert(s.stats !== undefined && typeof s.stats.missilesFired === 'number', 'stats 字段合并（含新字段）')
assert(s.reports[0].kind === 'battle' && (s.reports[0] as { wallAt?: number }).wallAt !== undefined, '旧战报补 wallAt')
assert(s.reports[0].kind === 'battle' && (s.reports[0] as { debris?: unknown }).debris !== undefined, '旧战报补 debris')

console.log('---')
console.log('存档迁移链 v2→v8 全部断言通过')
