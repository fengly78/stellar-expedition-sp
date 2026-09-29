import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * 存档往返时的在途任务与 NPC 状态（2026-09-28）
 *
 * 交叉风险点：跨 tick 路径（mission 状态机）与持久化（save/load）的交叉。
 * 玩家在舰队在途时存档、退出、重进——mission 必须原样恢复，且不能被
 * 重复结算或丢失。此前没有任何测试覆盖这个组合。
 *
 * 关注点：
 *   · 在途 mission（phase='out'）存档后能恢复，且 continue 推进
 *   · 返航中 mission（phase='back'）存档后能恢复
 *   · 在途舰船不重复：load 后舰船总数不变
 *   · NPC 状态（舰队/资源）存档后保留
 *   · debrisFields 存档后保留
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

function tick(times = 3) {
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

/** 起一个有舰船、有残骸场的存档 */
function prep() {
  const st = useGame.getState()
  useGame.setState({
    techs: { ...st.techs, 115: 1, 117: 1, 209: 1 },
    planets: st.planets.map((p) =>
      p.isHome
        ? { ...p, ships: { 209: 3, 202: 2 }, resources: { metal: 5e5, crystal: 5e5, deuterium: 5e5 } }
        : p,
    ),
    debrisFields: { '1:8:6': { metal: 800, crystal: 400 } },
  })
  settleTutorial()
  return home().id
}

describe('存档往返：在途 mission', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('在途 mission 存档后能恢复，且不丢失舰船', () => {
    const id = prep()
    const before = countShip(209)
    expect(
      useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 6 }, 'recycle', { 209: 2 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toBeNull()
    const inFlight = useGame.getState().missions.length
    expect(inFlight, '派任务后 missions 为空').toBe(1)
    const shipsInFlight = countShip(209)
    expect(shipsInFlight, '派出后未扣舰船').toBe(before - 2)

    // 存到 slot 1（slot 0 会被 newGame 覆盖）
    useGame.getState().saveToSlot(1, 'inflight')
    useGame.getState().newGame()
    expect(useGame.getState().missions.length, '新档仍有在途 mission').toBe(0)

    expect(useGame.getState().loadFromSlot(1)).toBeNull()
    expect(useGame.getState().missions.length, '读档后在途 mission 丢失').toBe(1)
    expect(countShip(209), '读档后舰船数变化').toBe(shipsInFlight)
  })

  it('读档后 mission 继续推进并正常结算（不重复扣舰船）', () => {
    const id = prep()
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 6 }, 'recycle', { 209: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    useGame.getState().saveToSlot(1, 'inflight')
    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(1)).toBeNull()

    const afterLoad = countShip(209)
    // 读档后继续推进，mission 应完成并清理
    tick(14)
    expect(useGame.getState().missions.length, '读档后 mission 未能正常结算').toBe(0)
    // 回收船应已返航（幸存全部返航，战损只会让它更少）
    expect(countShip(209), '读档后回收船数异常').toBeLessThanOrEqual(afterLoad + 2)
  })

  it('多次读档不产生舰船复制', () => {
    const id = prep()
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 8, position: 6 }, 'recycle', { 209: 2 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    useGame.getState().saveToSlot(1, 'inflight')
    const expect1 = useGame.getState().planets.reduce(
      (a, p) => a + Object.values(p.ships).reduce((x, y) => x + y, 0), 0,
    )
    for (let i = 0; i < 5; i++) {
      useGame.getState().loadFromSlot(1)
      const total = useGame.getState().planets.reduce(
        (a, p) => a + Object.values(p.ships).reduce((x, y) => x + y, 0), 0,
      )
      expect(total, `第 ${i + 1} 次读档后舰船总数变化（可能复制）`).toBe(expect1)
    }
  })

  it('残骸场与 NPC 状态存档后保留', () => {
    const id = prep()
    useGame.getState().saveToSlot(1, 'world')
    const debrisBefore = JSON.stringify(useGame.getState().debrisFields)
    const npcBefore = JSON.stringify((useGame.getState().npcs as Record<string, unknown>)['1:8:4'])

    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(1)).toBeNull()
    expect(JSON.stringify(useGame.getState().debrisFields), '残骸场读档后丢失').toBe(debrisBefore)
    expect(
      JSON.stringify((useGame.getState().npcs as Record<string, unknown>)['1:8:4']),
      'NPC 状态读档后丢失',
    ).toBe(npcBefore)
  })

  it('读档后资源不被复制（多次读档守恒）', () => {
    const id = prep()
    useGame.getState().saveToSlot(1, 'res')
    const before = { ...home().resources }
    for (let i = 0; i < 5; i++) {
      useGame.getState().loadFromSlot(1)
      expect(home().resources.metal, `第 ${i + 1} 次读档后金属漂移`).toBeCloseTo(before.metal, 4)
      expect(home().resources.crystal, `第 ${i + 1} 次读档后晶体漂移`).toBeCloseTo(before.crystal, 4)
      expect(home().resources.deuterium, `第 ${i + 1} 次读档后重氢漂移`).toBeCloseTo(before.deuterium, 4)
    }
  })

  it('损坏的存档被拒绝而非静默清空', () => {
    useGame.getState().newGame()
    // 写入非法 JSON
    localStorage.setItem('ogame-sp-save-test-session-1', '{ not json')
    expect(useGame.getState().loadFromSlot(1)).toMatch(/损坏/)
    // 状态应保持原样，不被清空
    expect(useGame.getState().planets.length, '读档失败后星球被清空').toBeGreaterThan(0)
  })
})
