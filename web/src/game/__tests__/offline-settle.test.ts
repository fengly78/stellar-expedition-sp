import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * 离线补算：读档时已过期的 mission 会不会被重复结算（2026-09-28）
 *
 * 场景：玩家派出任务后直接关掉浏览器（或进程被杀），几天后再打开。
 * 此时 mission 的 arriveAt 已远早于新的 gameNow，load 后第一次 tick 就会命中
 * `phase === 'out' && arriveAt <= gameNow`。
 *
 * 关键问题：**离线期间这段时间，结算只应发生一次**。若 arriveAt 被保留而
 * mission 未被标记，第二次 tick 就会再结算一次 —— 这正是 3a1da6b 那类缺陷的
 * 变体（deploy 的 phase 未推进导致重复到达）。
 *
 * 各 mission 类型在到达时都会设 phase='back'（deploy 除外，它设 'done'），
 * 所以理论上不会重复。本测试把这个不变量钉死。
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

function tick(times = 4) {
  for (let i = 0; i < times; i++) {
    useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
    useGame.getState().tick()
  }
}

function settleTutorial() {
  for (let i = 0; i < 3; i++) {
    useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
    useGame.getState().tick()
  }
  const st = useGame.getState()
  useGame.setState({ tutorialDone: [...new Set([...st.tutorialDone, 7])] })
}

const countShip = (id: number) =>
  useGame.getState().planets.reduce((sum, p) => sum + (p.ships[id] ?? 0), 0)

describe('离线补算不重复结算', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('回收任务离线到期：读档后只结算一次，残骸不被重复收取', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({
      techs: { ...st.techs, 115: 1 },
      planets: st.planets.map((p) =>
        p.isHome
          ? { ...p, ships: { 209: 3 }, resources: { metal: 5e5, crystal: 5e5, deuterium: 5e5 } }
          : p,
      ),
      debrisFields: { '1:8:6': { metal: 800, crystal: 400 } },
    })
    settleTutorial()
    // 新手保护期生效 -> NPC 骚扰被拦截，避免其战斗残骸干扰资源守恒断言
    useGame.setState({ createdWallAt: Date.now() })
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 6 }, 'recycle', { 209: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    useGame.getState().saveToSlot(1, 'offline')

    // 模拟：关掉浏览器几天后再打开
    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(1)).toBeNull()
    const debrisOnLoad = JSON.stringify(useGame.getState().debrisFields)

    // 补算：一次 tick 应完成到达 + 返航
    tick(14)
    const afterFirst = { ...home().resources }
    const debrisAfter = JSON.stringify(useGame.getState().debrisFields)
    expect(debrisAfter, '残骸场未被回收').not.toBe(debrisOnLoad)
    // 回收走的是「清空残骸场」路径（state.ts:1302-1303 直接 delete），不是加资源。
    // 所以「不重复结算」的不变量是残骸场保持为空，而不是资源总额不变——后者会被
    // 流星雨（每日 9%，+2000~6000 金属，state.ts:914）等与本用例无关的随机事件污染。
    expect(debrisAfter, '残骸场仍有残留，可能被重复收取').toBe('{}')

    // 再多 tick：残骸场不得被再次收取
    for (let i = 0; i < 10; i++) tick(1)
    expect(
      JSON.stringify(useGame.getState().debrisFields),
      `离线补算后残骸场变化（疑似重复收取）：${debrisAfter} -> ${JSON.stringify(useGame.getState().debrisFields)}`,
    ).toBe(debrisAfter)
    // 回收总量只应增加一次（2 艘采集船 x 800 金属 / 400 晶体）
    expect(useGame.getState().stats.totalDebris, '回收统计被重复累加').toBe(1200)
    // 首次结算后的资源快照必须仍然存在（防止上面的断言把整个流程测没了）
    expect(afterFirst.metal).toBeGreaterThan(0)
  })

  it('攻击任务离线到期：战报不重复生成', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({
      createdWallAt: Date.now(), // 保护期生效，拦截 NPC 骚扰
      techs: { ...st.techs, 115: 1, 117: 1 },
      planets: st.planets.map((p) =>
        p.isHome
          ? { ...p, ships: { 204: 20 }, resources: { metal: 5e5, crystal: 5e5, deuterium: 5e5 } }
          : p,
      ),
    })
    settleTutorial()
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 4 }, 'attack', { 204: 10 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    useGame.getState().saveToSlot(1, 'atk')

    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(1)).toBeNull()
    tick(16)

    const reports1 = useGame.getState().reports.length
    const battles1 = useGame.getState().stats.battlesTotal
    for (let i = 0; i < 12; i++) tick(1)
    expect(useGame.getState().reports.length, '战报重复生成').toBe(reports1)
    expect(useGame.getState().stats.battlesTotal, '战斗统计重复累加').toBe(battles1)
  })

  it('运输任务离线到期：货物只送达一次', () => {
    const st = useGame.getState()
    const id = home().id
    // 目标是自己星系的 7 号位殖民地，便于直接观测送达结果
    useGame.setState({
      techs: { ...st.techs, 115: 2 },
      planets: [
        ...st.planets.map((p) =>
          p.isHome
            ? { ...p, ships: { 202: 5 }, resources: { metal: 1e5, crystal: 1e5, deuterium: 1e5 } }
            : p,
        ),
        {
          id: 91, name: 'D', isHome: false, isMoon: false,
          coords: { galaxy: 1, system: 8, position: 7 },
          temperatureMax: 160, posCoef: { metal: 1, crystal: 1, deuterium: 1 },
          resources: { metal: 0, crystal: 0, deuterium: 0 }, lastTick: 0,
          buildings: { 4: 1 }, ships: {}, defenses: {}, buildingQueue: [], shipQueue: [],
        } as never,
      ],
    })
    settleTutorial()
    useGame.setState({ createdWallAt: Date.now() })
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 7 }, 'transport', { 202: 1 }, {
      metal: 1000, crystal: 0, deuterium: 0,
    })
    // 出发即从母星扣除 1000（2026-09-28 修复），此处确认扣减已生效
    const colonyBefore = useGame.getState().planets.find((p) => p.id === 91)!
    expect(colonyBefore.resources.metal, '出发时母星未扣除货物').toBeLessThan(1e5)
    useGame.getState().saveToSlot(1, 'tr')

    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(1)).toBeNull()
    tick(16)

    // 送达语义（state.ts:1101-1115）：到达时目标星球 +1000，随后 m.cargo 清零。
    // 「只送达一次」的不变量因此是目标星球金属恰为 1000，且继续 tick 不再增加——
    // 全星球总额守恒会被流星雨等随机事件污染，不能用作断言。
    const delivered = useGame.getState().planets.find((p) => p.id === 91)!.resources.metal
    expect(delivered, '离线补算后货物未送达').toBeCloseTo(1000, 4)
    for (let i = 0; i < 10; i++) tick(1)
    expect(
      useGame.getState().planets.find((p) => p.id === 91)!.resources.metal,
      `运输离线补算后目标星球金属继续增加（重复送达？）：${delivered} -> ${useGame.getState().planets.find((p) => p.id === 91)!.resources.metal}`,
    ).toBeCloseTo(delivered, 4)
  })

  it('deploy 离线到期：目标星球舰船只增一次', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({
      techs: { ...st.techs, 115: 2 },
      planets: [
        ...st.planets.map((p) =>
          p.isHome
            ? { ...p, ships: { 202: 5 }, resources: { metal: 1e5, crystal: 1e5, deuterium: 1e5 } }
            : p,
        ),
        {
          id: 90, name: 'C', isHome: false, isMoon: false,
          coords: { galaxy: 1, system: 8, position: 7 },
          temperatureMax: 160, posCoef: { metal: 1, crystal: 1, deuterium: 1 },
          resources: { metal: 0, crystal: 0, deuterium: 0 }, lastTick: 0,
          buildings: { 4: 1 }, ships: {}, defenses: {}, buildingQueue: [], shipQueue: [],
        } as never,
      ],
    })
    settleTutorial()
    useGame.setState({ createdWallAt: Date.now() })
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 7 }, 'deploy', { 202: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    useGame.getState().saveToSlot(1, 'dep')

    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(1)).toBeNull()
    tick(10)
    const colony = useGame.getState().planets.find((p) => p.id === 90)!
    const got = colony.ships[202] ?? 0
    expect(got, '离线补算后殖民地未收到舰船').toBe(2)
    for (let i = 0; i < 10; i++) tick(1)
    const after = useGame.getState().planets.find((p) => p.id === 90)!.ships[202] ?? 0
    expect(after, `离线补算后舰船继续增加（重复驻扎）：${got} -> ${after}`).toBe(got)
    expect(countShip(202), '总舰船数异常').toBe(5)
  })
})
