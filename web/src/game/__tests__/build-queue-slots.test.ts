import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame, BUILD_SLOTS } from '../state'
import { buildingCost, BUILDINGS } from '../objects'

// 建筑队列固定容量（2026-09-28 试玩发现 + 所有者决定）
//
// 缺陷背景：此前正式槽满 3 个后会转入「等待预约」队列 buildingWaitQueue，
// 该队列没有任何长度上限，只要资源够就能无限追加并预扣资源——界面表现为「队列可以无限」。
// 2026-09-28 所有者决定取消预约机制，只保留 3 个正式槽，满槽即拒绝。
//
// 三条不变量：
//   1. 队列长度恒不超过 BUILD_SLOTS，反复调用不再增长，且无任何附加队列
//   2. 满槽被拒时返回可读中文错误且不扣资源
//   3. 老存档残留的 buildingWaitQueue 在迁移时按原收取等级退款后清空（不吞玩家资源）

const SLOT = 0
const SLOT_KEY = 'ogame-sp-slot-0'
const SESSION = 'session-token'

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

describe('建筑队列固定 3 槽', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    useGame.getState().newGame()
  })

  const homeId = () => useGame.getState().planets.find((p) => p.isHome)!.id

  it('BUILD_SLOTS 恒为 3', () => {
    expect(BUILD_SLOTS).toBe(3)
  })

  it('队列长度不超过 3，且反复调用不再增长', () => {
    const id = homeId()
    let accepted = 0
    for (let i = 0; i < 50; i++) {
      if (useGame.getState().upgradeBuilding(id, 1) === null) accepted++
    }
    const p = useGame.getState().planets.find((p2) => p2.id === id)!
    expect(p.buildingQueue.length).toBe(BUILD_SLOTS)
    expect(accepted).toBe(BUILD_SLOTS)
    // 关键回归：不存在任何形式的附加队列（旧字段已随机制移除）
    expect((p as unknown as Record<string, unknown>).buildingWaitQueue).toBeUndefined()
  })

  it('满槽后返回可读中文错误', () => {
    const id = homeId()
    for (let i = 0; i < BUILD_SLOTS; i++) expect(useGame.getState().upgradeBuilding(id, 1)).toBeNull()
    const err = useGame.getState().upgradeBuilding(id, 1)
    expect(err).not.toBeNull()
    expect(err).toMatch(/队列/)
  })

  it('满槽被拒时不扣任何资源', () => {
    const id = homeId()
    for (let i = 0; i < BUILD_SLOTS; i++) useGame.getState().upgradeBuilding(id, 1)
    const before = { ...useGame.getState().planets.find((p) => p.id === id)!.resources }
    for (let i = 0; i < 10; i++) useGame.getState().upgradeBuilding(id, 1)
    const after = useGame.getState().planets.find((p) => p.id === id)!.resources
    expect(after.metal).toBeCloseTo(before.metal, 6)
    expect(after.crystal).toBeCloseTo(before.crystal, 6)
    expect(after.deuterium).toBeCloseTo(before.deuterium, 6)
  })

  it('取消一个后可以再排入一个（不是累计配额）', () => {
    const id = homeId()
    for (let i = 0; i < BUILD_SLOTS; i++) useGame.getState().upgradeBuilding(id, 1)
    expect(useGame.getState().upgradeBuilding(id, 1)).not.toBeNull()
    useGame.getState().cancelBuildingQueue(id, 0)
    expect(useGame.getState().upgradeBuilding(id, 1)).toBeNull()
  })

  it('队列完成后可继续建造（3 槽是容量不是总量）', () => {
    const id = homeId()
    for (let i = 0; i < BUILD_SLOTS; i++) useGame.getState().upgradeBuilding(id, 1)
    expect(useGame.getState().upgradeBuilding(id, 1)).not.toBeNull()
    useGame.setState({ lastWallTick: Date.now() - 8000, timeScale: 20 })
    useGame.getState().tick()
    const p = useGame.getState().planets.find((p2) => p2.id === id)!
    expect(p.buildingQueue.length).toBeLessThan(BUILD_SLOTS)
    expect(useGame.getState().upgradeBuilding(id, 1)).toBeNull()
  })
})

describe('老存档预约迁移退款', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    localStorage.setItem('ogame-sp-session', SESSION)
    useGame.getState().newGame()
  })

  it('载入含 buildingWaitQueue 的老存档：按原收取等级退款并清空字段', () => {
    const st = useGame.getState()
    const id = st.planets.find((p) => p.isHome)!.id
    // 两项预约：金属矿 Lv.4（cost@level 3）与 Lv.5（cost@level 4）
    const lvl4 = buildingCost(BUILDINGS[1], 3)
    const lvl5 = buildingCost(BUILDINGS[1], 4)
    const charged = lvl4.metal + lvl5.metal

    const file = {
      ...JSON.parse(JSON.stringify(st)),
      saveVersion: 11,
      planets: st.planets.map((p) =>
        p.id === id
          ? {
              ...p,
              // 模拟"预约时已预扣"：资源少了 charged
              resources: { ...p.resources, metal: p.resources.metal - charged },
              buildingWaitQueue: [
                { objectId: 1, queuedAt: 1 },
                { objectId: 1, queuedAt: 2 },
              ],
            }
          : p,
      ),
    }

    const preMetal = useGame.getState().planets.find((p) => p.id === id)!.resources.metal
    localStorage.setItem(SLOT_KEY, JSON.stringify(file))
    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()

    const after = useGame.getState().planets.find((p) => p.id === id)!
    // 字段被清空
    expect((after as unknown as Record<string, unknown>).buildingWaitQueue).toBeUndefined()
    // 资源完全恢复（金属回到预扣前的水平）
    expect(after.resources.metal).toBeCloseTo(preMetal, 4)
  })

  it('迁移后不再写回预约字段（新存档干净）', () => {
    const st = useGame.getState()
    const id = st.planets.find((p) => p.isHome)!.id
    const file = {
      ...JSON.parse(JSON.stringify(st)),
      saveVersion: 11,
      planets: st.planets.map((p) =>
        p.id === id ? { ...p, buildingWaitQueue: [{ objectId: 1, queuedAt: 1 }] } : p,
      ),
    }
    localStorage.setItem(SLOT_KEY, JSON.stringify(file))
    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()
    const p = useGame.getState().planets.find((p2) => p2.id === id)!
    expect((p as unknown as Record<string, unknown>).buildingWaitQueue).toBeUndefined()
  })

  it('退款口径：Lv.4/Lv.5 两项预约分别退 cost@3 与 cost@4', () => {
    const refundLv4 = buildingCost(BUILDINGS[1], 3)
    const refundLv5 = buildingCost(BUILDINGS[1], 4)
    expect(refundLv4.metal).toBeCloseTo(60 * Math.pow(1.5, 3), 6)
    expect(refundLv5.metal).toBeCloseTo(60 * Math.pow(1.5, 4), 6)
    expect(refundLv5.metal).toBeGreaterThan(refundLv4.metal)
  })

  // —— 以下三条锁死「扣费口径 == 退款口径」这条不变量（2026-09-28 复核追加）——
  //
  // 当初 upgradeBuilding 满槽分支的扣费是：
  //   waitLevels = wait.filter(w => w.objectId === objectId).length  // 追加前的预约数
  //   totalLevel = max(已建成, 正式队列等级) + waitLevels
  //   cost       = buildingCost(def, totalLevel)
  // 即第 i 项预约按 base+i 收费。迁移若按别的口径退款，玩家会凭空多钱或少钱。

  /** 构造一份"预约时已按 base, base+1, … 扣过费"的老存档，返回载入前的金属数 */
  function writeChargedSave(opts: {
    objectIds: number[]
    builtLevel: number
    queuedLevels: number[]
  }) {
    const st = useGame.getState()
    const id = st.planets.find((p) => p.isHome)!.id
    const base = Math.max(opts.builtLevel, ...(opts.queuedLevels.length ? opts.queuedLevels : [0]), 0)

    // 按 objectId 独立分桶，复刻当初的收费序列
    const charged = { metal: 0, crystal: 0, deuterium: 0 }
    const seen = new Map<number, number>()
    for (const oid of opts.objectIds) {
      const def = BUILDINGS[oid]
      if (!def) continue
      const before = seen.get(oid) ?? 0
      const c = buildingCost(def, base + before)
      charged.metal += c.metal
      charged.crystal += c.crystal
      charged.deuterium += c.deuterium
      seen.set(oid, before + 1)
    }

    const file = {
      ...JSON.parse(JSON.stringify(st)),
      saveVersion: 11,
      planets: st.planets.map((p) =>
        p.id === id
          ? {
              ...p,
              buildings: { ...p.buildings, [opts.objectIds[0]]: opts.builtLevel },
              buildingQueue: opts.queuedLevels.map((lv, i) => ({
                objectId: opts.objectIds[0],
                level: lv,
                startAt: i,
                finishAt: i + 1,
              })),
              resources: {
                metal: p.resources.metal - charged.metal,
                crystal: p.resources.crystal - charged.crystal,
                deuterium: p.resources.deuterium - charged.deuterium,
              },
              buildingWaitQueue: opts.objectIds.map((objectId, i) => ({ objectId, queuedAt: i })),
            }
          : p,
      ),
    }
    const pre = { ...useGame.getState().planets.find((p) => p.id === id)!.resources }
    localStorage.setItem(SLOT_KEY, JSON.stringify(file))
    return { id, pre }
  }

  it('有正式队列占用时：退款仍与当初扣费逐项相等（不多不少）', () => {
    // 已建成 Lv.5，正式队列占 Lv.6 → base=6；三项预约按 6/7/8 收费
    const { id, pre } = writeChargedSave({ objectIds: [1, 1, 1], builtLevel: 5, queuedLevels: [6] })
    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()
    const after = useGame.getState().planets.find((p) => p.id === id)!.resources
    expect(after.metal).toBeCloseTo(pre.metal, 4)
    expect(after.crystal).toBeCloseTo(pre.crystal, 4)
  })

  it('多建筑混排：每栋楼独立分桶，互不串级', () => {
    // 金属矿 2 项 + 晶体矿 1 项，两者 base 都是 max(built, queued)
    const { id, pre } = writeChargedSave({ objectIds: [1, 1, 2], builtLevel: 4, queuedLevels: [5] })
    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()
    const after = useGame.getState().planets.find((p) => p.id === id)!.resources
    // 若错误地按全局序号计级，晶体矿那项会按 4 收费、退款时按 5 退，金额不等
    expect(after.metal).toBeCloseTo(pre.metal, 4)
    expect(after.crystal).toBeCloseTo(pre.crystal, 4)
    expect(after.deuterium).toBeCloseTo(pre.deuterium, 4)
  })

  it('正式队列为空时（预约从未转正）：退款与扣费仍相等', () => {
    const { id, pre } = writeChargedSave({ objectIds: [1, 1, 1], builtLevel: 5, queuedLevels: [] })
    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()
    const after = useGame.getState().planets.find((p) => p.id === id)!.resources
    expect(after.metal).toBeCloseTo(pre.metal, 4)
    expect(after.crystal).toBeCloseTo(pre.crystal, 4)
  })
})
