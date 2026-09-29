import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * deploy 跨 tick 舰队守恒（2026-09-28 审计发现）
 *
 * 缺陷：deploy 成功分支里
 *   targetPlanet.ships[+id] += m.fleet[+id]   // 舰船已转移
 *   m.fleet = {}                               // mission 内清空
 * **但没有设 m.phase = 'back' 或任何终态** —— 只有 `else`（无目标）分支才设。
 *
 * 而 tick 开头 `if (m.phase === 'out' && m.arriveAt <= gameNow)` 会在
 * 下一次 tick 再次命中（phase 仍是 'out'、arriveAt 已过期），
 * 把同一个 mission 反复执行到达分支。实测 3 次 tick 就让目标星球多出 3 艘。
 *
 * 修复：新增 phase='done'（就地结算并终结），tick 末尾的 survivors 过滤一并移除。
 */

function shim() {
  const mem = new Map<string, string>()
  mem.set('ogame-sp-session', 'test-session')
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

const home = () => useGame.getState().planets.find((p) => p.isHome)!

/**
 * 造一个可 deploy 的起点：母星 5 艘 202 + 一个空殖民地。
 * 殖民地必须独立构造（对齐 newPlanet 的空船配置）——用 {...home()} 展开会
 * 连母星的 ships 一起复制，使守恒基线本身就多算。
 */
function prepDeploy() {
  const st = useGame.getState()
  const id = home().id
  const colonyId = 90
  const colony = {
    id: colonyId,
    name: '测试殖民地',
    isHome: false,
    isMoon: false,
    coords: { galaxy: 1, system: 9, position: 4 },
    temperatureMax: 160,
    posCoef: { metal: 1, crystal: 1, deuterium: 1 },
    resources: { metal: 0, crystal: 0, deuterium: 0 },
    lastTick: 0,
    buildings: { 4: 1 },
    ships: {},
    defenses: {},
    buildingQueue: [],
    shipQueue: [],
  }
  useGame.setState({
    techs: { ...st.techs, 115: 2 },
    planets: [
      ...st.planets.map((p) =>
        p.isHome
          ? { ...p, ships: { ...p.ships, 202: 5 }, resources: { ...p.resources, deuterium: 100000 } }
          : p,
      ),
      colony as never,
    ],
  })
  return { originId: id, colonyId, target: { galaxy: 1, system: 9, position: 4 } }
}

/**
 * 推进一次 tick，让教程奖励先结清。
 *
 * 关键：prepDeploy 把 techs[115]（燃烧引擎）设到 2，而教程第 7 步的判定是
 * 「燃烧引擎 >= 1」，奖励 ships:{202:3}。所以推进时钟会往母星加 3 艘 202——
 * 这是正常玩法，不是泄漏。守恒基线必须在这之后再取，否则差值里混着这 3 艘。
 */
function settleTutorialRewards() {
  for (let i = 0; i < 3; i++) {
    useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
    useGame.getState().tick()
  }
  // 教程奖励发完后把 202 归位，得到干净基线
  const st = useGame.getState()
  // 教程奖励已结清，但 techs[115]=2 仍满足第 7 步判定；若 tutorialDone 未记录会重复发放。
  const home = st.planets.find((p) => p.isHome)!
  useGame.setState({
    tutorialDone: [...new Set([...st.tutorialDone, 7])],
    planets: st.planets.map((p) => (p.isHome ? { ...p, ships: { 202: 5 } } : p)),
  })
  void home
}

function tick() {
  useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
  useGame.getState().tick()
}

const countShips202 = () =>
  useGame.getState().planets.reduce((sum, p) => sum + (p.ships[202] ?? 0), 0)

describe('deploy 跨 tick 舰队守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('deploy 成功后 mission 应被移除，不得永久滞留', () => {
    const { originId, target } = prepDeploy()
    settleTutorialRewards()
    expect(useGame.getState().dispatchMission(originId, target, 'deploy', { 202: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })).toBeNull()
    expect(useGame.getState().missions[0].phase).toBe('out')

    tick()
    // 关键：到达后 mission 不应留在列表里（否则每次 tick 重复触发到达分支）。
    // 只断言「舰船数不变」是不够的——若实现误用 phase='back' + fleet={}，
    // 舰船数同样不变但 mission 语义错了（会被当作返航任务处理）。
    expect(
      useGame.getState().missions.length,
      `deploy 到达后仍有 ${useGame.getState().missions.length} 个 mission 滞留，会在每次 tick 重复触发到达分支`,
    ).toBe(0)
  })

  it('deploy 到达后不得把舰船退回出发星球（驻扎是终态，不返航）', () => {
    const { originId, colonyId, target } = prepDeploy()
    settleTutorialRewards()
    useGame.getState().dispatchMission(originId, target, 'deploy', { 202: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    tick()
    tick() // 若实现误设为 phase='back'，第二次 tick 会执行返航把舰船搬回母星
    const colony = useGame.getState().planets.find((p) => p.id === colonyId)!
    expect(colony.ships[202] ?? 0, '驻扎后舰船被错误退回母星（应留在目标星球）').toBe(2)
  })

  it('连续多次 tick 舰船数不增长（回归：曾每次 tick 多一艘）', () => {
    const { originId, target } = prepDeploy()
    settleTutorialRewards()
    useGame.getState().dispatchMission(originId, target, 'deploy', { 202: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    tick()
    const afterFirst = countShips202()
    for (let i = 0; i < 5; i++) tick()
    expect(countShips202(), '连续 tick 后 202 型舰船数发生变化').toBe(afterFirst)
  })

  it('deploy 舰船守恒：出发 -2、到达后目标 +2、总数不变', () => {
    const { originId, colonyId, target } = prepDeploy()
    settleTutorialRewards()
    const before = countShips202()

    useGame.getState().dispatchMission(originId, target, 'deploy', { 202: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    expect(countShips202(), '派出后母星未扣减').toBe(before - 2)

    tick()
    const colony = useGame.getState().planets.find((p) => p.id === colonyId)!
    expect(colony.ships[202] ?? 0, '目标殖民地未收到舰船').toBe(2)
    expect(countShips202(), 'deploy 前后 202 型舰船总数不守恒').toBe(before)
  })

  it('无目标的 deploy 仍正常返航（该分支原有 phase=back 行为不回退）', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({
      techs: { ...st.techs, 115: 2 },
      planets: st.planets.map((p) =>
        p.isHome
          ? { ...p, ships: { ...p.ships, 202: 5 }, resources: { ...p.resources, deuterium: 100000 } }
          : p,
      ),
    })
    settleTutorialRewards()
    const before = countShips202()
    // 目标是不存在的坐标 -> 走 else 返航分支。
    // 用同星系远处（1:8:12）：distance=4005，flightTime=60*4005/5000≈48 秒，
    // 20x 下每次 tick 推进 20 分钟 → 3 次 tick 足够往返。
    // （跨星系 distance 上百万，需上百次 tick，不适合放进单测）
    expect(
      useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 12 }, 'deploy', { 202: 2 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toBeNull()
    for (let i = 0; i < 4; i++) tick()
    expect(countShips202(), '无目标 deploy 返航后舰船未回母星').toBe(before)
    expect(useGame.getState().missions.length).toBe(0)
  })
})
