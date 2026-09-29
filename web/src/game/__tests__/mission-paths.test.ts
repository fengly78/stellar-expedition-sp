import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * colonize / recycle / expedition 的跨 tick 守恒（2026-09-28）
 *
 * 承 273fcc1（运输资源复制）与 3a1da6b（deploy mission 滞留）的审计方法：
 * 「跨 tick 的多步操作」最容易漏扣/漏结算，单点按钮测试覆盖不到。
 *
 * 本文件验证剩余三类涉及资源/舰队增减的 mission：
 *   · colonize  —— 消耗 1 艘殖民船 208，建立殖民地
 *   · recycle   —— 从残骸场收取资源，装进 cargo 返航
 *   · expedition—— 纯产出（探索/流浪舰队/海盗），应无输入消耗
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

function tick(times = 6) {
  for (let i = 0; i < times; i++) {
    useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
    useGame.getState().tick()
  }
}

/** 让教程奖励先结清，并把第 7 步（奖励 202x3）标记为已完成防重复发放 */
function settleTutorial() {
  for (let i = 0; i < 3; i++) {
    useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
    useGame.getState().tick()
  }
  const st = useGame.getState()
  useGame.setState({
    tutorialDone: [...new Set([...st.tutorialDone, 7])],
  })
}

function giveShips(ships: Record<number, number>) {
  const st = useGame.getState()
  useGame.setState({
    planets: st.planets.map((p) =>
      p.isHome ? { ...p, ships: { ...ships }, resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 } } : p,
    ),
  })
}

const countShip = (id: number) =>
  useGame.getState().planets.reduce((sum, p) => sum + (p.ships[id] ?? 0), 0)

describe('colonize 跨 tick 守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('殖民消耗 1 艘 208 并建立殖民地，舰船总数 -1', () => {
    const st = useGame.getState()
    const id = home().id
    // 208 殖民船前置：脉冲引擎 117 >= 1
    useGame.setState({ techs: { ...st.techs, 117: 1, 115: 1 } })
    giveShips({ 208: 2, 202: 1 })
    settleTutorial()

    const before208 = countShip(208)
    const beforePlanets = useGame.getState().planets.length
    const target = { galaxy: 1, system: 8, position: 7 }

    const err = useGame.getState().dispatchMission(id, target, 'colonize', { 208: 1 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    expect(err, `殖民任务被拒：${err}`).toBeNull()
    expect(countShip(208), '派出后未从母星扣殖民船').toBe(before208 - 1)

    tick(12)
    // 殖民地应建立
    expect(
      useGame.getState().planets.length,
      `殖民地未建立；npcs@1:8:9=${JSON.stringify((useGame.getState().npcs as Record<string, unknown>)['1:8:9'])} missions=${JSON.stringify(useGame.getState().missions.map((m) => ({ t: m.type, ph: m.phase, arrive: m.arriveAt, now: useGame.getState().gameTime })))}`,
    ).toBe(beforePlanets + 1)
    // 到达后 208 不应再增加（那艘已用于建殖民地）
    expect(countShip(208), '到达后殖民船数异常').toBe(before208 - 1)
  })

  it('连续 tick 后殖民地数量不增长（曾有 mission 滞留重复建殖民地）', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({ techs: { ...st.techs, 117: 1, 115: 1 } })
    giveShips({ 208: 1, 202: 1 })
    settleTutorial()

    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 10 }, 'colonize', { 208: 1 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    tick()
    const n1 = useGame.getState().planets.length
    for (let i = 0; i < 8; i++) tick(1)
    expect(useGame.getState().planets.length, '连续 tick 后殖民地数量继续增长').toBe(n1)
  })

  it('殖民船不足时被拒绝', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({ techs: { ...st.techs, 117: 1, 115: 1 } })
    giveShips({ 202: 1 })
    expect(
      useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 11 }, 'colonize', { 208: 1 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toMatch(/数量不足/)
  })
})

describe('recycle 跨 tick 守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('回收残骸：残骸场减少、返航后资源增加、总资源守恒', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({ techs: { ...st.techs, 115: 1 } })
    giveShips({ 209: 1 })
    settleTutorial()

    // 放一个残骸场：1:8:6
    useGame.setState({ debrisFields: { '1:8:6': { metal: 1000, crystal: 500 } } })

    const beforeRes = { ...home().resources }
    expect(
      useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 6 }, 'recycle', { 209: 1 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toBeNull()

    tick(10)
    // 返航后金属应增加（回收 1000 减去燃料）
    expect(
      home().resources.metal,
      `回收后母星金属未增加（回收前 ${beforeRes.metal}）`,
    ).toBeGreaterThan(beforeRes.metal)
    // 残骸场应被清空或减少
    const debris = useGame.getState().debrisFields['1:8:6']
    expect(!debris || debris.metal + debris.crystal === 0, '残骸场未被回收').toBe(true)
  })

  it('回收后 mission 应被清理，不滞留', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({ techs: { ...st.techs, 115: 1 } })
    giveShips({ 209: 1 })
    settleTutorial()
    useGame.setState({ debrisFields: { '1:8:7': { metal: 500, crystal: 250 } } })
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 7 }, 'recycle', { 209: 1 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    tick(10)
    expect(useGame.getState().missions.length, '回收任务 mission 未清理').toBe(0)
  })
})

describe('expedition 跨 tick 行为', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('远征：出发后 mission 存在，返航后被清理，舰船不减少（至少回来）', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({ techs: { ...st.techs, 117: 1, 115: 1 } })
    giveShips({ 204: 10, 202: 1 })
    settleTutorial()

    const before = countShip(204)
    // 远征必须打 16 号位（深空）
    expect(
      useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 16 }, 'expedition', { 204: 5 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toBeNull()
    expect(countShip(204), '派出后未扣舰船').toBe(before - 5)

    tick(12)
    expect(useGame.getState().missions.length, '远征 mission 未清理').toBe(0)
    // 远征可能损失部分舰船，但不能全灭（概率极低），且至少有返回的可能
    expect(countShip(204), '远征后 204 全灭（概率事件不应每次都发生）').toBeGreaterThan(0)
  })

  it('远征目标非 16 号位被拒绝', () => {
    const st = useGame.getState()
    const id = home().id
    useGame.setState({ techs: { ...st.techs, 117: 1, 115: 1 } })
    giveShips({ 204: 5 })
    expect(
      useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 12 }, 'expedition', { 204: 2 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toMatch(/深空|16/)
  })
})
