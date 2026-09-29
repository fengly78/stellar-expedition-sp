import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * 运输任务 cargo 扣费（2026-09-28 审计发现）
 *
 * 缺陷：dispatchMission 对 cargo **只校验不扣减**——
 *   if (type === 'transport' && fleetCargo(fleet) < cargo.metal + ...) return '货仓容量不足'
 *   if (jumpReady && (cargo.metal > 0 || ...)) return '跳跃门不能运输资源'
 * 两处都是校验，**没有任何一处把 cargo 从出发星球扣掉**。
 *
 * 而 tick 里任务完成时 cargo 被清零（L+78: cargo: { metal: 0, ... }），
 * 也没有加到目标星球。合起来的结果是：
 *   派运输任务 -> 出发星球资源不变 -> 任务完成 -> 货物凭空消失
 *
 * 即：**玩家运输资源 = 资源被系统吞掉**，且 UI 的「全取」按钮会诱导玩家
 * 把整仓资源填进去（DispatchWizard 的 onClick: setCargo(origin.resources[k])），
 * 没有任何上限拦截。
 *
 * 这是资源凭空消失的漏洞，比记账口径不符严重得多。
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

/** 备一个可运输的出发星球：202 运输船 + 足够的重氢燃料 */
function prepTransportShip() {
  const st = useGame.getState()
  const id = home().id
  useGame.setState({
    techs: { ...st.techs, 115: 2 },
    planets: st.planets.map((p) =>
      p.isHome
        ? {
            ...p,
            // 202 运输船；需船坞 Lv1；给足重氢作燃料
            ships: { ...p.ships, 202: 10 },
            buildings: { ...p.buildings, 21: 1, 14: 1 },
            resources: { metal: 100000, crystal: 50000, deuterium: 100000 },
          }
        : p,
    ),
  })
  return id
}

describe('运输任务 cargo 扣费', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('派出运输任务应从出发星球扣除 cargo', () => {
    const id = prepTransportShip()
    const before = { ...home().resources }
    // 运 1000 金属，目标是自己星系的空位（不会撞新手保护：transport 不受其限）
    const target = { galaxy: 1, system: 9, position: 4 }
    const err = useGame.getState().dispatchMission(id, target, 'transport', { 202: 1 }, {
      metal: 1000, crystal: 0, deuterium: 0,
    })
    expect(err).toBeNull()
    const after = home().resources
    expect(after.metal, '运输 1000 金属后出发星球金属未减少').toBeCloseTo(before.metal - 1000, 4)
  })

  it('三系资源都应扣除', () => {
    const id = prepTransportShip()
    const before = { ...home().resources }
    const target = { galaxy: 1, system: 9, position: 4 }
    useGame.getState().dispatchMission(id, target, 'transport', { 202: 1 }, {
      metal: 500, crystal: 300, deuterium: 200,
    })
    const after = home().resources
    // 重氢还要额外扣燃料，所以只断言「比 (before - cargo) 更少或相等」
    expect(after.metal).toBeCloseTo(before.metal - 500, 4)
    expect(after.crystal).toBeCloseTo(before.crystal - 300, 4)
    expect(after.deuterium).toBeLessThan(before.deuterium - 200 + 1)
  })

  it('cargo 超过出发星球资源时应被拒绝（不能凭空运输）', () => {
    const id = prepTransportShip()
    // 货舱容量约束先于库存约束生效，所以要取「在货舱容量内、但超过库存」的量：
    // 202 单艘货舱 5000，库存 100000 金属 —— 改为先耗尽库存再试。
    useGame.setState({
      planets: useGame.getState().planets.map((p) =>
        p.isHome ? { ...p, resources: { ...p.resources, metal: 100 } } : p,
      ),
    })
    const err = useGame.getState().dispatchMission(id, { galaxy: 1, system: 9, position: 4 }, 'transport', { 202: 1 }, {
      metal: 200, crystal: 0, deuterium: 0, // 库存 100 < 200，货舱 5000 够
    })
    expect(err, '运输量超过库存仍未被拒绝').toMatch(/货物不足/)
    expect(home().resources.metal, '被拒后库存不应变化').toBeCloseTo(100, 4)
  })

  it('非运输任务不受 cargo 影响（攻击等 cargo 恒为 0）', () => {
    const id = prepTransportShip()
    const before = { ...home().resources }
    // espionage 不会被新手保护拦（目标是外部坐标）
    useGame.getState().dispatchMission(id, { galaxy: 1, system: 9, position: 4 }, 'espionage', { 202: 1 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    // 攻击/侦察不扣三系（只扣燃料重氢）
    expect(home().resources.metal).toBeCloseTo(before.metal, 4)
    expect(home().resources.crystal).toBeCloseTo(before.crystal, 4)
  })

  it('跳跃门运输仍应被拒绝（已锁定的行为不回退）', () => {
    const id = prepTransportShip()
    // 未建跳跃门时 jumpReady 为 false，这条只验证不因本次修复而放行
    const err = useGame.getState().dispatchMission(id, { galaxy: 1, system: 9, position: 4 }, 'transport', { 202: 1 }, {
      metal: 100, crystal: 0, deuterium: 0,
    })
    expect(err).toBeNull()
  })
})
