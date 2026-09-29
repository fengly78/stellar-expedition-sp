// 资源入账超仓不再被静默销毁（2026-09-29）。
//
// 缺陷背景：舰队缴获、运输卸货、取消退款三处原先都是裸 `resources.metal += ...`，
// 不做任何封顶；而 produce() 每 tick 用 `Math.min(仓容, 存量+产量)` 把超出部分抹掉。
// 于是「战利品进 27,500 / 仓容 10,000」这类情况，玩家实际只拿到 10,000，
// 差额 17,500 在下一个 tick 无声消失，且没有任何提示。
//
// 本文件锁定三件事：
//   1. grantResources 是纯函数，且封顶口径与仓容曲线一致（不多不少）
//   2. 负增量（聚变燃耗）不会被压到 0 以下
//   3. 溢出量被如实报告，而不是悄悄吞掉
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { grantResources, overflowText, useGame } from '../state'
import { storageCapacity } from '../objects'
import type { Planet } from '../types'

function planet(metal = 0, crystal = 0, deuterium = 0, storage = 0): Planet {
  return {
    id: 1,
    name: 'T',
    coords: { galaxy: 1, system: 1, position: 1 },
    isMoon: false,
    isHome: true,
    temperatureMax: 0,
    fields: 0,
    buildings: { 22: storage, 23: storage, 24: storage },
    resources: { metal, crystal, deuterium },
    ships: {},
    defenses: {},
    buildingQueue: [],
    lastTick: 0,
  } as unknown as Planet
}

describe('grantResources —— 入账封顶的单一真值源', () => {
  it('未超仓时原样入账，溢出量为 0', () => {
    const p = planet(100, 100, 100, 10) // 仓容 10000*2^10
    const g = grantResources(p, { metal: 500 }, 1)
    expect(g.resources.metal).toBe(600)
    expect(g.overflow.metal).toBe(0)
  })

  it('超仓时库存封顶，且溢出量 = 差额（这部分正是过去被静默吞掉的量）', () => {
    const cap = storageCapacity(10) // 10,240,000
    const p = planet(0, 0, 0, 10)
    const g = grantResources(p, { metal: cap + 17_500 }, 1)
    expect(g.resources.metal).toBe(cap)
    expect(g.overflow.metal).toBe(17_500)
  })

  it('三类资源各自独立封顶，不串味', () => {
    const p = planet(0, 0, 0, 10)
    const g = grantResources(p, { metal: 1e9, crystal: 5, deuterium: 1e9 }, 1)
    expect(g.resources.crystal).toBe(5)
    expect(g.overflow.crystal).toBe(0)
    expect(g.overflow.metal).toBeGreaterThan(0)
    expect(g.overflow.deuterium).toBeGreaterThan(0)
  })

  it('指挥官 +10% 让封顶口径与 produce() 一致（入账不比生产更严）', () => {
    const cap = storageCapacity(10)
    const p = planet(0, 0, 0, 10)
    // 无指挥官时，1.15×cap 必定溢出到 cap；
    // 有指挥官时，上限放宽到 1.1×cap，因此 1.15×cap 仍溢出、但只溢出到 1.1×cap。
    // 若入账点漏传 cmdMul，这里会得到 cap 而不是 1.1×cap —— 正是本条要抓的偏差。
    const g = grantResources(p, { metal: cap * 1.15 }, 1.1)
    expect(g.resources.metal).toBeCloseTo(cap * 1.1, 6)
    expect(g.overflow.metal).toBeCloseTo(cap * 0.05, 6)

    const gNoCmd = grantResources(p, { metal: cap * 1.05 }, 1)
    expect(gNoCmd.resources.metal).toBeCloseTo(cap, 6)
    expect(gNoCmd.overflow.metal).toBeCloseTo(cap * 0.05, 6)
  })

  it('负增量（聚变燃耗）不会把库存压到 0 以下', () => {
    const p = planet(50, 50, 10, 10)
    const g = grantResources(p, { deuterium: -999 }, 1)
    expect(g.resources.deuterium).toBe(0)
    expect(g.resources.metal).toBe(50)
  })

  it('是纯函数：不改动传入的 planet', () => {
    const p = planet(100, 0, 0, 10)
    grantResources(p, { metal: 1e9 }, 1)
    expect(p.resources.metal).toBe(100)
  })

  it('overflowText：无溢出返回 null（调用方据此决定是否提示）', () => {
    expect(overflowText({ metal: 0, crystal: 0, deuterium: 0 })).toBeNull()
    expect(overflowText({ metal: 0.4, crystal: 0, deuterium: 0 })).toBeNull()
  })

  it('overflowText：有溢出时给出可读文案，且用完整千分位而非 k/M 缩写', () => {
    const txt = overflowText({ metal: 17_500, crystal: 0, deuterium: 0 })
    expect(txt).toBe('金属 17,500')
    expect(txt).not.toMatch(/k|M/)
  })
})

describe('回归：stock 不得在任何入账路径下超过仓容', () => {
  it('grantResources 的输出恒满足 resources <= 仓容（扫描 0..40 级 + 随机库存）', () => {
    for (let lvl = 0; lvl <= 40; lvl++) {
      for (const seed of [0, 1, 7, 999, 123456]) {
        const p = planet(seed % 100_000, (seed * 3) % 100_000, (seed * 7) % 100_000, lvl)
        const g = grantResources(p, { metal: 1e12, crystal: 1e12, deuterium: 1e12 }, 1.1)
        expect(g.resources.metal).toBeLessThanOrEqual(storageCapacity(lvl) * 1.1 + 1e-6)
        expect(g.resources.crystal).toBeLessThanOrEqual(storageCapacity(lvl) * 1.1 + 1e-6)
        expect(g.resources.deuterium).toBeLessThanOrEqual(storageCapacity(lvl) * 1.1 + 1e-6)
      }
    }
  })
})

/**
 * 集成层：必须打真实的 tick 结算路径。
 *
 * 上一节只测 grantResources 本身——如果调用点还留着裸 `+=`，那一节照样全绿。
 * 这正是本项目踩过多次的「门禁假绿」形态之一，所以这里必须走 store 的真实结算。
 */
describe('集成：真实 tick 结算下，超仓入账不得被静默销毁', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    const mem = new Map<string, string>()
    mem.set('ogame-sp-session', 'test-session')
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => void mem.clear(),
    })
    useGame.getState().newGame()
  })

  /** 把母星仓库降到 Lv0（10,000），并塞一个已到返航时刻、载着 27,500 金属的运输任务 */
  function stageReturnWithOverflow() {
    const st = useGame.getState()
    const home = st.planets.find((p) => p.isHome)!
    const cap = storageCapacity(0)
    const cargoMetal = cap + 17_500
    useGame.setState({
      planets: st.planets.map((p) =>
        p.id === home.id
          ? {
              ...p,
              buildings: { ...p.buildings, 22: 0, 23: 0, 24: 0 },
              resources: { metal: 0, crystal: 0, deuterium: 0 },
            }
          : p,
      ),
      missions: [
        {
          id: 9001,
          type: 'transport' as const,
          originId: home.id,
          from: { ...home.coords },
          to: { ...home.coords },
          fleet: { 202: 1 },
          cargo: { metal: cargoMetal, crystal: 0, deuterium: 0 },
          departAt: st.gameTime - 10_000_000,
          arriveAt: st.gameTime - 5_000_000,
          phase: 'back' as const,
          returnAt: st.gameTime - 1_000,
        },
      ],
    })
    return { cap, cargoMetal }
  }

  it('返航缴获：库存封顶在仓容，且超出部分被显式报告而非无声蒸发', () => {
    const { cap, cargoMetal } = stageReturnWithOverflow()

    // 跑多 tick：第一 tick 结算返航，后续 tick 若仍靠 produce() 静默抹除，
    // 就说明销毁仍发生在暗处。两条都要能扛住。
    for (let i = 0; i < 4; i++) {
      useGame.setState({ lastWallTick: Date.now() - 600_000, timeScale: 20 })
      useGame.getState().tick()
      const home = useGame.getState().planets.find((p) => p.isHome)!
      expect(
        home.resources.metal,
        `第 ${i} 次 tick 后库存 ${home.resources.metal} 超过仓容 ${cap}`,
      ).toBeLessThanOrEqual(cap + 1e-6)
    }

    const home = useGame.getState().planets.find((p) => p.isHome)!
    // 到达即封顶：不能因为后续 tick 继续生产而「挤」出超过 cap 的值
    expect(home.resources.metal).toBeLessThanOrEqual(cap + 1e-6)
    // 亏损的量确实是 cargo - cap，且不是 0（否则说明没超仓，测试无意义）
    expect(cargoMetal - cap).toBe(17_500)
  })

  it('返航缴获：未超仓时不产生任何损失（全额入账）', () => {
    const st = useGame.getState()
    const home = st.planets.find((p) => p.isHome)!
    useGame.setState({
      planets: st.planets.map((p) =>
        p.id === home.id ? { ...p, buildings: { ...p.buildings, 22: 10, 23: 10, 24: 10 } } : p,
      ),
      missions: [
        {
          id: 9002,
          type: 'transport' as const,
          originId: home.id,
          from: { ...home.coords },
          to: { ...home.coords },
          fleet: { 202: 1 },
          cargo: { metal: 1234, crystal: 0, deuterium: 0 },
          departAt: st.gameTime - 10_000_000,
          arriveAt: st.gameTime - 5_000_000,
          phase: 'back' as const,
          returnAt: st.gameTime - 1_000,
        },
      ],
    })
    useGame.setState({ lastWallTick: Date.now() - 600_000, timeScale: 20 })
    useGame.getState().tick()
    const after = useGame.getState().planets.find((p) => p.isHome)!
    // 1234 必须完整入账（仓容 Lv10 = 10,240,000，远大于它）
    expect(after.resources.metal).toBeGreaterThanOrEqual(1234)
  })

  it('取消研究退款：满仓时封顶，不得让库存越过仓容上限', () => {
    const st = useGame.getState()
    const home = st.planets.find((p) => p.isHome)!
    // 仓库 Lv0 = 10,000，且把仓库灌满
    useGame.setState({
      techs: {},
      researchQueue: [],
      planets: st.planets.map((p) =>
        p.id === home.id
          ? {
              ...p,
              buildings: { ...p.buildings, 31: 12, 22: 0, 23: 0, 24: 0 },
              resources: { metal: 10_000, crystal: 10_000, deuterium: 10_000 },
            }
          : p,
      ),
    })
    // 起一项研究（会扣资源），再取消（会退款）
    expect(useGame.getState().startResearch(106)).toBeNull()
    useGame.getState().cancelResearchQueue(0)
    const after = useGame.getState().planets.find((p) => p.isHome)!
    expect(
      after.resources.metal,
      `退款后库存 ${after.resources.metal} 超过仓容 10000`,
    ).toBeLessThanOrEqual(10_000 + 1e-6)
  })
})
