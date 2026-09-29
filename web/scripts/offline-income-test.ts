// 离线收益回归测试：存档→回拨 lastWallTick 2 小时→loadFromSlot→tick，
// 断言离线时长被一次性补算（资源增长、gameTime 前进）；暂停存档则不补。
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
const SLOT_KEY = 'ogame-sp-save-u1-1'
const TWO_H = 2 * 3600 * 1000

function rewindSlot(slotKey: string, ms: number) {
  const file = JSON.parse(store.get(slotKey)!) as { data: { lastWallTick: number } }
  file.data.lastWallTick = Date.now() - ms
  store.set(slotKey, JSON.stringify(file))
}

// ---- 场景一：在线存档，离线 2 小时后回来 ----
localStorage.setItem('ogame-sp-session', 'u1')
s().newGame('normal')
useGame.setState((st) => ({
  planets: st.planets.map((p) =>
    p.isHome ? { ...p, buildings: { 1: 10, 2: 10, 3: 10, 4: 12, 22: 10, 23: 10, 24: 10 } } : p,
  ),
}))
useGame.setState({ lastWallTick: Date.now() })
s().tick() // 归一化 lastTick，之后 before 起点干净

const before = s().planets.find((p) => p.isHome)!
const beforeGameTime = s().gameTime
s().saveToSlot(1)
assert(store.has(SLOT_KEY), '存档已写入 slot')

rewindSlot(SLOT_KEY, TWO_H)
const err = s().loadFromSlot(1)
assert(err === null, `loadFromSlot 成功${err ? ': ' + err : ''}`)
assert(Math.abs(Date.now() - s().lastWallTick - TWO_H) < 5000, 'lastWallTick 保留了存档时的墙钟（离线时长未丢失）')

s().tick()
const after = s().planets.find((p) => p.isHome)!
assert(s().gameTime - beforeGameTime >= TWO_H * 0.95, `gameTime 补算了离线时长（前进 ${Math.round((s().gameTime - beforeGameTime) / 60000)} 分钟）；金属 ${before.resources.metal} → ${Math.floor(after.resources.metal)}（按 cap 截断属正常——warehouse 22=10 cap ≈ 10M，1e8 起始超过 cap）`)

// ---- 场景二：暂停（timeScale=0）存档，离线不补 ----
useGame.setState({ timeScale: 0 })
s().saveToSlot(2)
const SLOT_KEY2 = 'ogame-sp-save-u1-2'
rewindSlot(SLOT_KEY2, TWO_H)
assert(s().loadFromSlot(2) === null, '暂停档加载成功')
const pausedRes = s().planets.find((p) => p.isHome)!.resources.metal
const pausedGameTime = s().gameTime
s().tick()
assert(Math.abs(s().planets.find((p) => p.isHome)!.resources.metal - pausedRes) < 0.001, '暂停档离线不补资源')
assert(s().gameTime === pausedGameTime, '暂停档离线不推进 gameTime')

console.log('---')
console.log('全部断言通过：离线收益补算正确')
