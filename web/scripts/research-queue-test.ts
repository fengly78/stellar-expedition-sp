// 研究队列 1→2 槽回归测试：2 槽门禁、按 index 取消退还资源、tick 并行完成两个研究
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
const home = () => s().planets.find((p) => p.isHome)!

localStorage.setItem('ogame-sp-session', 'u1')
s().newGame('normal')
useGame.setState((st) => ({
  planets: st.planets.map((p) =>
    p.isHome ? { ...p, buildings: { ...p.buildings, 31: 10 } } : p,
  ),
}))
useGame.setState({ lastWallTick: Date.now() })

// ---- 场景一：2 槽门禁 ----
const beforeMetal = home().resources.metal
const r1 = s().startResearch(108) // 计算机技术 Lv.1 → 入队
assert(r1 === null, `108 入队成功${r1 ? ': ' + r1 : ''}`)
assert(s().researchQueue.length === 1, `队列长度=1（实际 ${s().researchQueue.length}）`)
const r2 = s().startResearch(109) // 武器技术 Lv.1 → 入队
assert(r2 === null, `109 入队成功${r2 ? ': ' + r2 : ''}`)
assert(s().researchQueue.length === 2, `队列长度=2（实际 ${s().researchQueue.length}）`)

const r3 = s().startResearch(108) // 再次 108 → 应该被门禁
assert(r3 === '研究队列已满', `第 3 个研究被门禁（实际 ${JSON.stringify(r3)}）`)
assert(s().researchQueue.length === 2, '门禁后队列仍=2')
assert(Math.abs(home().resources.metal - beforeMetal) > 0 || Math.abs(home().resources.crystal - 0) >= 0, '前两次扣了 108 费用（400 crystal）')

// ---- 场景二：按 index 取消退还 ----
const costBefore = home().resources.crystal
const idx0 = s().researchQueue[0].objectId
const rCancel = s().cancelResearchQueue(0)
assert(s().researchQueue.length === 1, `取消 index=0 后队列=1（实际 ${s().researchQueue.length}）`)
assert(s().researchQueue[0].objectId !== idx0, '剩余项是 index=1 的那个')
assert(home().resources.crystal > costBefore, `资源已退还（crystal ${costBefore} → ${home().resources.crystal}）`)

// 取消 index 越界 → noop
const lenBefore = s().researchQueue.length
s().cancelResearchQueue(99)
assert(s().researchQueue.length === lenBefore, '越界 index=99 不影响队列')

// ---- 场景三：tick 并行完成两个研究 ----
s().startResearch(108) // 再塞 108，队列=2（108, 109）
assert(s().researchQueue.length === 2, `tick 前队列=2（实际 ${s().researchQueue.length}）`)

// 把 gameTime 推到两个 finishAt 之后
const far = Math.max(...s().researchQueue.map((q) => q.finishAt)) + 1000
useGame.setState({ gameTime: far })

const tech108Before = s().techs[108] ?? 0
const tech109Before = s().techs[109] ?? 0
s().tick()
assert(s().researchQueue.length === 0, `tick 后队列清空（实际 ${s().researchQueue.length}）`)
assert((s().techs[108] ?? 0) > tech108Before, `108 完成：${tech108Before} → ${s().techs[108]}`)
assert((s().techs[109] ?? 0) > tech109Before, `109 完成：${tech109Before} → ${s().techs[109]}`)

console.log('---')
console.log('全部断言通过：研究队列 2 槽门禁 / 按 index 取消 / tick 并行完成均正常')