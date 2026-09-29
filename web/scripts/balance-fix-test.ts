// 数值平衡修复回归测试：
//   R1（轻战晶体出口）/ R4（NPC 资源翻倍）/ R6（教程终步 3 重战）
//   R7（探测器成本抬升）+ R2/R3 队列 caps 锁定
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

const { useGame, BUILD_SLOTS } = await import('../src/game/state.ts')
const { SHIPS } = await import('../src/game/objects.ts')
const { TUTORIAL_STEPS } = await import('../src/game/tutorial.ts')
const { generateNpc, npcRegen } = await import('../src/game/npc.ts')

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

const s = () => useGame.getState()
const home = () => s().planets.find((p) => p.isHome)!

// ====== R1: 204 轻战 cost.crystal = 500 ======
assert(SHIPS[204].cost.crystal === 500, `R1: 轻战晶体成本=500（实际 ${SHIPS[204].cost.crystal}）`)
assert(SHIPS[204].cost.metal === 3000, `R1: 轻战金属=3000 不变（实际 ${SHIPS[204].cost.metal}）`)

// ====== R7: 210 探测器 cost.crystal = 2000 ======
assert(SHIPS[210].cost.crystal === 2000, `R7: 探测器晶体成本=2000（实际 ${SHIPS[210].cost.crystal}）`)

// ====== R6: 教程终步奖励 3 重战 ======
const step12 = TUTORIAL_STEPS.find((st) => st.id === 12)!
assert(step12.reward.ships?.[205] === 3, `R6: 教程终步 12 奖励 3 重战（实际 ${step12.reward.ships?.[205]}）`)

// ====== R2: BUILD_SLOTS 常量 ======
assert(BUILD_SLOTS === 3, `R2: BUILD_SLOTS=3（实际 ${BUILD_SLOTS}）`)

// ====== R2 行为：第 4 个建筑入队被门禁 ======
localStorage.setItem('ogame-sp-session', 'u1')
s().newGame('normal')
useGame.setState((st) => ({
  planets: st.planets.map((p) =>
    p.isHome ? { ...p, resources: { metal: 1e10, crystal: 1e10, deuterium: 1e10 } } : p,
  ),
}))
// 用同建筑（id=4 太阳能电站，无前置、maxLevel=0、初始资源够）连入 4 次
// ——不混搭 id=1/2/3 是因为金属矿/晶体矿/重氢都需 4:1（电站 Lv.1），新档 buildings={} 会被前置门禁挡住
const buildResults = [0, 1, 2, 3].map((_) => s().upgradeBuilding(home().id, 4))
const accepted = buildResults.filter((r) => r === null).length
assert(accepted === BUILD_SLOTS, `R2: 前 ${BUILD_SLOTS} 个建筑入队成功（实际 ${accepted}）`)
assert(buildResults[3] === `建造槽位已满（${BUILD_SLOTS}/${BUILD_SLOTS}）`, `R2: 第 4 个被门禁文案（实际 ${buildResults[3]}）`)

// ====== R3 行为：第 6 艘船入队被门禁 ======
s().newGame('normal')
useGame.setState((st) => ({
  planets: st.planets.map((p) =>
    p.isHome
      ? {
          ...p,
          resources: { metal: 1e10, crystal: 1e10, deuterium: 1e10 },
          buildings: { ...p.buildings, 21: 12 },
        }
      : p,
  ),
  techs: { ...st.techs, 115: 10 },
}))
const shipResults: (string | null)[] = []
for (let i = 0; i < 6; i++) shipResults.push(s().buildShips(home().id, 204, 1))
assert(shipResults[0] === null, `R3: 第 1 艘入队成功（实际 ${shipResults[0]}）`)
assert(shipResults[4] === null, `R3: 第 5 艘入队成功（实际 ${shipResults[4]}）`)
assert(shipResults[5] === '建造队列已满', `R3: 第 6 艘被门禁（实际 ${shipResults[5]}）`)

// ====== R4: NPC 资源翻倍 ======
// rng 可能让 generateNpc 返回 null（30% 概率），遍历合法 system 找一个能生成的
function pickNpc(diff: 0 | 1 | 2) {
  const systems = diff === 0 ? [1, 2, 3, 4, 5] : diff === 1 ? [6, 7, 8, 9, 10, 11, 12] : [13, 14, 15, 16, 17, 18, 19, 20]
  for (const sys of systems) {
    for (const pos of [4, 9]) {
      const npc = generateNpc(1, sys, pos, 1, 1)
      if (npc) return npc
    }
  }
  throw new Error(`无法生成 diff=${diff} NPC`)
}

// diff=0：rate=800/h, cap=120000
const npc0 = pickNpc(0)
npc0.resources = { metal: 0, crystal: 0, deuterium: 0 }
npc0.lastRegen = 0
npcRegen(npc0, 3600 * 1000)
assert(npc0.resources.metal === 800, `R4: diff=0 regen 1h metal=800（实际 ${npc0.resources.metal}）`)
assert(npc0.resources.crystal === 480, `R4: diff=0 regen 1h crystal=480（实际 ${npc0.resources.crystal}）`)
assert(npc0.resources.deuterium === 240, `R4: diff=0 regen 1h deuterium=240（实际 ${npc0.resources.deuterium}）`)

// diff=2：rate=3200/h, cap=360000
const npc2 = pickNpc(2)
npc2.resources = { metal: 100000, crystal: 50000, deuterium: 25000 }
npc2.lastRegen = 0
npcRegen(npc2, 3600 * 1000)
assert(npc2.resources.metal === 103200, `R4: diff=2 regen 1h metal=103200（实际 ${npc2.resources.metal}）`)

// cap 兜底：diff=2 cap metal=360000 / crystal=180000，已满不增
const npcCap = pickNpc(2)
npcCap.resources = { metal: 360000, crystal: 180000, deuterium: 90000 }
npcCap.lastRegen = 0
npcRegen(npcCap, 3600 * 1000)
assert(npcCap.resources.metal === 360000, `R4: diff=2 cap 已满 regen 不增 metal（实际 ${npcCap.resources.metal}）`)
assert(npcCap.resources.crystal === 180000, `R4: diff=2 crystal cap 已满 regen 不增（实际 ${npcCap.resources.crystal}）`)

console.log('---')
console.log('全部断言通过：R1 晶体出口 / R4 NPC 翻倍 / R6 教程终步 / R7 探测器成本 / R2 建筑 cap / R3 造船 cap')