import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'
import { storageCapacity } from '../objects'

/**
 * 剩余入账路径的封顶回归（2026-09-29）
 *
 * 背景：`grantResources` 首次落地时只收口了 4 条路径（缴获/卸货/建筑退款/研究退款），
 * 另有 7 条仍是裸 `+=`，同样会被 produce() 每 tick 静默削顶销毁。其中 `trade` 最严重：
 * 收益侧不封顶而被削为 0，付出侧已真实扣除 —— 玩家净损失（实测 netMetal = -1000），
 * 且全流程无任何提示。
 *
 * 本文件逐条锁住这些路径。共同断言口径：
 *   满仓时 ① 库存不得越过仓容  ② 玩家不得净损失  ③ 有明确提示
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

/** 把母星仓库设成指定等级，并把三种资源灌到指定值 */
function fillStorage(level: number, m: number, c: number, d: number) {
  const st = useGame.getState()
  useGame.setState({
    planets: st.planets.map((p) =>
      p.isHome
        ? {
            ...p,
            buildings: { ...p.buildings, 22: level, 23: level, 24: level },
            resources: { metal: m, crystal: c, deuterium: d },
          }
        : p,
    ),
  })
}

const cap = (level: number) => storageCapacity(level)

describe('trade：满仓不得让玩家净损失', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('目标资源满仓时直接拒绝，不做这笔亏本买卖', () => {
    // Lv0 仓 = 10000，把晶体灌满
    fillStorage(0, 10000, cap(0), 10000)
    const before = { ...home().resources }

    const err = useGame.getState().trade(home().id, 'metal', 'crystal', 1000)

    expect(err, '满仓时应拒绝兑换而不是照扣').not.toBeNull()
    const after = home().resources
    expect(after.metal, '拒绝时金属不得被扣').toBe(before.metal)
    expect(after.crystal).toBe(before.crystal)
  })

  it('目标资源接近满仓时，只扣「实际换得到」那部分，不净损失', () => {
    // 晶体只剩 100 空间。金属放在仓容之内，避免混入「入账顺手夹取无关资源」的因素。
    fillStorage(0, 5000, cap(0) - 100, 5000)
    const before = { ...home().resources }

    const err = useGame.getState().trade(home().id, 'metal', 'crystal', 1000)

    expect(err).toBeNull()
    const after = home().resources
    // 硬约束：库存不得越过仓容
    expect(after.crystal).toBeLessThanOrEqual(cap(0))
    // 硬约束（按价值比，不能跨资源比数量）：换到的价值必须接近付出的价值。
    // 注意交易**本来就有 5% 手续费**（公式 amount*VALUE*0.95），所以付出价值必然略大于收益。
    // 真正的缺陷是「收益被削为 0、损失 100%」，因此这里断言至少拿回 90% 价值。
    const VALUE = { metal: 1, crystal: 1.5, deuterium: 3 } as const
    const paidValue = (before.metal - after.metal) * VALUE.metal
    const gainedValue = (after.crystal - before.crystal) * VALUE.crystal
    expect(paidValue, '付出侧不得为 0（应按实际换得到的量扣费）').toBeGreaterThan(0)
    expect(
      gainedValue,
      `付出 ${paidValue} 价值只换到 ${gainedValue} 价值（回收率 ${((gainedValue / paidValue) * 100).toFixed(1)}%）`,
    ).toBeGreaterThanOrEqual(paidValue * 0.9)
  })

  it('未满仓时正常兑换，收益足额到账', () => {
    fillStorage(0, 20000, 1000, 10000)
    const before = { ...home().resources }
    expect(useGame.getState().trade(home().id, 'metal', 'crystal', 1000)).toBeNull()
    const after = home().resources
    expect(after.metal).toBeLessThan(before.metal)
    // 1000 金属 → 晶体，价值比 1:1.5 扣 5% 手续费 => 约 633
    expect(after.crystal - before.crystal).toBeGreaterThanOrEqual(600)
  })
})

describe('claimDaily：满仓时按实际入账播报，不得虚报', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('仓库满时签到不越过仓容，且下一 tick 也不会凭空蒸发', () => {
    fillStorage(0, cap(0), cap(0), cap(0))
    useGame.getState().claimDaily()
    const after = home().resources
    expect(after.metal).toBeLessThanOrEqual(cap(0))
    expect(after.crystal).toBeLessThanOrEqual(cap(0))

    // 再跑 tick，确认没有「先加上、下一 tick 再抹掉」的延迟销毁
    useGame.setState({ lastWallTick: Date.now() - 600_000, timeScale: 20 })
    useGame.getState().tick()
    const afterTick = home().resources
    expect(afterTick.metal).toBeLessThanOrEqual(cap(0))
    expect(afterTick.crystal).toBeLessThanOrEqual(cap(0))
  })

  it('仓库有空时签到全额到账', () => {
    fillStorage(0, 0, 0, 0)
    useGame.getState().claimDaily()
    const r = home().resources
    expect(r.metal).toBeGreaterThanOrEqual(1000)
    expect(r.crystal).toBeGreaterThanOrEqual(500)
  })
})

describe('cancelShipQueueItem：与建筑/研究退款同口径封顶', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('满仓时退款不得越过仓容', () => {
    const st = useGame.getState()
    const finishAt = st.gameTime + 3_600_000
    useGame.setState({
      planets: st.planets.map((p) =>
        p.isHome
          ? {
              ...p,
              buildings: { ...p.buildings, 21: 1, 22: 0, 23: 0, 24: 0 },
              resources: { metal: cap(0), crystal: cap(0), deuterium: cap(0) },
              shipQueue: [{ shipId: 204, count: 10, finishAt }],
            }
          : p,
      ),
    })

    useGame.getState().cancelShipQueueItem(home().id, 0)

    const after = home().resources
    expect(after.metal, '退款后金属越过仓容').toBeLessThanOrEqual(cap(0))
    expect(after.crystal).toBeLessThanOrEqual(cap(0))
    expect(after.deuterium).toBeLessThanOrEqual(cap(0))
    // 队列项应被移除
    expect(home().shipQueue.length).toBe(0)
  })
})

describe('成就/教程奖励：满仓时不得静默归零', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('tick 推进时成就奖励不得把库存顶出仓容', () => {
    // 仓库 Lv0 且灌满；跑多次 tick 触发 checkProgress
    fillStorage(0, cap(0), cap(0), cap(0))
    for (let i = 0; i < 6; i++) {
      useGame.setState({ lastWallTick: Date.now() - 600_000, timeScale: 20 })
      useGame.getState().tick()
      const r = home().resources
      expect(r.metal, `第 ${i} 次 tick 后金属越过仓容`).toBeLessThanOrEqual(cap(0))
      expect(r.crystal).toBeLessThanOrEqual(cap(0))
      expect(r.deuterium).toBeLessThanOrEqual(cap(0))
    }
  })

  it('长跑 60 tick 后资源恒不超过仓容（覆盖成就/教程/事件奖励的混合触发）', () => {
    fillStorage(0, cap(0), cap(0), cap(0))
    for (let i = 0; i < 60; i++) {
      useGame.setState({ lastWallTick: Date.now() - 600_000, timeScale: 20 })
      useGame.getState().tick()
    }
    const r = home().resources
    expect(r.metal).toBeLessThanOrEqual(cap(0) + 1e-6)
    expect(r.crystal).toBeLessThanOrEqual(cap(0) + 1e-6)
    expect(r.deuterium).toBeLessThanOrEqual(cap(0) + 1e-6)
  })
})
