// 新手保护期回归测试：7 天内玩家与 NPC 都不能攻击/探测玩家星球。
// 测试不需要 DOM。直接走 state.ts 的真实 store API。
const _store = new Map<string, string>()
// @ts-expect-error minimal stub
globalThis.localStorage = {
  getItem: (k: string) => _store.get(k) ?? null,
  setItem: (k: string, v: string) => void _store.set(k, v),
  removeItem: (k: string) => void _store.delete(k),
  clear: () => _store.clear(),
  key: () => null,
  get length() { return _store.size },
}
import { useGame } from '../src/game/state'

// 直连 localStorage 写入需要去掉 —— store 自己处理 saveToSlot 内部。
// 关键：用 store API（newGame / dispatchMission / dispatchMissiles）验证守卫。
// 通过 _runTick_ 触发任一 action 后断言返回值与 missions 数。

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  } else {
    console.log('PASS:', msg)
  }
}

const g = useGame.getState()

// 1. 重置为新档 —— createdWallAt = Date.now()（此刻），home resources = 1e8
g.newGame()
const s0 = useGame.getState()
assert(s0.difficulty === 'normal', '单难度：normal')
assert(s0.createdWallAt > 0, 'createdWallAt 已设')
assert(s0.planets[0].resources.metal === 100000000, '初始金属 = 1 亿')
assert(s0.planets[0].resources.crystal === 100000000, '初始晶体 = 1 亿')
assert(s0.planets[0].resources.deuterium === 100000000, '初始重氢 = 1 亿')

// 2. 构造一艘目标 NPC 坐标（[2:5:4]），玩家不能攻击它 —— 但 s.planets 里没这个坐标，
//    所以 isPlayerPlanetTarget 应该是 false，新手保护不该拦这条。
//    这里直接试一个 "坐标是玩家自己的母星" 的攻击，应当被拦。
const home = s0.planets[0]
const homeCoord = home.coords
// 给玩家造船（绕开资源检查）—— 直接写 state（测试特权）
useGame.setState({
  planets: [{ ...home, ships: { ...home.ships, 204: 100, 210: 10 }, defenses: { ...home.defenses, 502: 5 }, buildings: { ...home.buildings, 44: 1 } }],
})

// 3. 攻击自己的母星 —— isPlayerPlanetTarget=true + 护盾期内，应该被拦
const atkSelfErr = useGame.getState().dispatchMission(
  home.id,
  homeCoord,
  'attack',
  { 204: 10 },
  { metal: 0, crystal: 0, deuterium: 0 },
)
assert(typeof atkSelfErr === 'string' && atkSelfErr.includes('新手保护'), '护盾期内攻击玩家母星被拦截')
const miss = useGame.getState().missions.length
assert(miss === 0, '未生成攻击任务')

// 4. 探测自己的母星 —— 同样应该被拦
const spySelfErr = useGame.getState().dispatchMission(
  home.id,
  homeCoord,
  'espionage',
  { 210: 1 },
  { metal: 0, crystal: 0, deuterium: 0 },
)
assert(typeof spySelfErr === 'string' && spySelfErr.includes('新手保护'), '护盾期内探测玩家母星被拦截')
assert(useGame.getState().missions.length === 0, '未生成探测任务')

// 5. 导弹打击自己的母星 —— 同样应该被拦
const missErr = useGame.getState().dispatchMissiles(home.id, homeCoord, 1)
assert(typeof missErr === 'string' && missErr.includes('新手保护'), '护盾期内导弹打玩家母星被拦截')

// 6. 把 createdWallAt 拨到 8 天前 —— 护盾失效，攻击自己的母星应当放行
const eightDaysAgo = Date.now() - 8 * 24 * 3600 * 1000
useGame.setState({ createdWallAt: eightDaysAgo })
// 再造船（上面的 setState 没保留 ships，因为没合并），确保舰队数够
const p2 = useGame.getState().planets[0]
useGame.setState({ planets: [{ ...p2, ships: { ...p2.ships, 204: 100, 210: 10 } }] })
// 重氢给够避免 fuel 失败
useGame.setState({ planets: [{ ...useGame.getState().planets[0], resources: { metal: 1e8, crystal: 1e8, deuterium: 1e8 } }] })

const atkAfterErr = useGame.getState().dispatchMission(
  useGame.getState().planets[0].id,
  homeCoord,
  'attack',
  { 204: 5 },
  { metal: 0, crystal: 0, deuterium: 0 },
)
assert(atkAfterErr === null, '护盾期外攻击自身母星被放行（自残但合法，测试仅验证拦截逻辑）')

// 7. 拨到 6.5 天前（仍在护盾内）—— 攻击 NPC 坐标（玩家没占的坐标）应当放行
//    因为 isPlayerPlanetTarget=false，新手保护不拦
const sixHalfDaysAgo = Date.now() - 6.5 * 24 * 3600 * 1000
useGame.setState({ createdWallAt: sixHalfDaysAgo, missions: [] })
const p3 = useGame.getState().planets[0]
useGame.setState({ planets: [{ ...p3, ships: { ...p3.ships, 204: 100, 210: 10 } }] })
const npcCoord = { galaxy: 1, system: 5, position: 4 } // 已知 NPC 位置
const atkNpcErr = useGame.getState().dispatchMission(
  p3.id,
  npcCoord,
  'attack',
  { 204: 5 },
  { metal: 0, crystal: 0, deuterium: 0 },
)
assert(atkNpcErr === null, '护盾期内攻击 NPC（非玩家星球）放行')

// 8. 护盾期边界（恰好 7 天差 1ms —— 应当生效）
const boundaryIn = Date.now() - (7 * 24 * 3600 * 1000 - 1000)
useGame.setState({ createdWallAt: boundaryIn })
// 清理上一步的 missions
useGame.setState({ missions: [] })
const p4 = useGame.getState().planets[0]
useGame.setState({ planets: [{ ...p4, ships: { ...p4.ships, 204: 100, 210: 10 } }] })
const atkBoundaryErr = useGame.getState().dispatchMission(
  p4.id,
  homeCoord,
  'attack',
  { 204: 1 },
  { metal: 0, crystal: 0, deuterium: 0 },
)
assert(typeof atkBoundaryErr === 'string' && atkBoundaryErr.includes('新手保护'), '7 天前 1s 处仍在护盾内')

console.log('全部断言通过：新手保护期守卫正确')