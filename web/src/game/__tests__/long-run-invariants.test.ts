import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame, BUILD_SLOTS, SHIP_SLOTS, RESEARCH_SLOTS } from '../state'
import { BUILDINGS, SHIPS, DEFENSES } from '../objects'

/**
 * 长时运行不变量审计（2026-09-28）
 *
 * 动机：现有测试都是单点断言——「造一栋楼会扣钱」「队列满了会拒绝」。
 * 没有任何测试回答「连续跑 200 个游戏小时，这套系统会不会漏钱、卡队列、
 * 或把资源算成负数」。这类缺陷只在长时间游玩后才暴露，而单机游戏恰恰
 * 鼓励长时间挂机。
 *
 * 本文件用伪造时钟推进 tick，检查三类守恒量：
 *   A. 资源非负 + 无凭空增长（除明确的生产/奖励来源）
 *   B. 队列收敛（长期无人干预时队列应清空，不会永久卡死）
 *   C. 存档往返一致（tick 一万次后存取档，资源/建筑应一致）
 *
 * tick 依赖 Date.now()，故必须用 vi.setSystemTime 伪造时钟。
 */

function shim() {
  const mem = new Map<string, string>()
  // 预置 session——saveToSlot/loadFromSlot 依赖 SESSION_KEY 推导槽位 key，
  // 缺它会返回「未登录」。建档走 createProfile，这里直接种一个有效 session id。
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

/** 伪造时钟并推进 n 个游戏小时（按 timeScale 折算墙钟） */
function advanceHours(hours: number, scale = 20) {
  const stepMs = 60 * 1000 // 每步 1 分钟墙钟
  const steps = Math.ceil((hours * 3600 * 1000) / (stepMs * scale))
  for (let i = 0; i < steps; i++) {
    vi.setSystemTime(Date.now() + stepMs)
    useGame.getState().tick()
  }
}

function allResources() {
  return useGame.getState().planets.flatMap((p) => [
    p.resources.metal, p.resources.crystal, p.resources.deuterium,
  ])
}

describe('长时运行不变量', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T00:00:00Z'))
    useGame.getState().newGame()
    useGame.setState({ timeScale: 20, lastWallTick: Date.now() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('A. 资源守恒', () => {
    it('空转 200 游戏小时：资源始终非负', () => {
      advanceHours(200)
      for (const v of allResources()) {
        expect(Number.isFinite(v), `资源出现 NaN/Infinity: ${v}`).toBe(true)
        expect(v, `资源为负: ${v}`).toBeGreaterThanOrEqual(0)
      }
    })

    it('持续建造 200 游戏小时：资源不因反复扣费而变负', () => {
      // 反复排满建筑队列，模拟玩家长时间挂机建造
      for (let round = 0; round < 60; round++) {
        const id = home().id
        for (let i = 0; i < BUILD_SLOTS; i++) {
          useGame.getState().upgradeBuilding(id, 1) // 金属矿，成本最低
        }
        advanceHours(3)
      }
      for (const v of allResources()) {
        expect(v, `反复建造后资源为负: ${v}`).toBeGreaterThanOrEqual(0)
      }
    })

    it('无任何操作时资源收敛到仓容上限而非持续增长', () => {
      // newGameData 把三系仓库预置 Lv.10（storageCapacity = 10000*2^10 = 1024 万），
      // 用来兜住 1000 万起始资源（见 newGameData 的注释）。所以上限是 1024 万不是 1 万。
      // 初始 1000 万 < 1024 万，因此空转会缓慢增长直到封顶。
      const cap = 10000 * 2 ** 10
      expect(cap).toBe(10240000)
      const before = { ...home().resources }
      advanceHours(200)
      const after = home().resources
      // 产量为正 → 资源增长但不超过仓容
      expect(after.metal).toBeGreaterThanOrEqual(before.metal)
      expect(after.metal).toBeLessThanOrEqual(cap + 1e-6)
    })

    it('资源永远不超过仓容上限（封顶生效）', () => {
      advanceHours(30)
      const cap = 10000 * 2 ** 10 // 仓库预置 Lv.10
      for (const v of allResources()) {
        expect(v, `资源超过仓容上限: ${v} > ${cap}`).toBeLessThanOrEqual(cap + 1e-6)
      }
    })

    it('反复取消建造队列后资源不会超过基准（无凭空生钱）', () => {
      // 若 cancelBuildingQueue 的退款算错（多退/重复退），反复造退会累积出超额资源。
      // 基准必须在 tick 之后取：首次 tick 会按仓容封顶，初始 1000 万 → 封顶 1024 万内。
      advanceHours(1)
      const baseline = home().resources.metal
      for (let i = 0; i < 40; i++) {
        const id = home().id
        if (useGame.getState().upgradeBuilding(id, 1) === null) {
          useGame.getState().cancelBuildingQueue(id, 0)
        }
      }
      // 造+退一轮净变化为 0（期间可能有产量），但绝不该显著增加
      expect(home().resources.metal).toBeLessThanOrEqual(baseline + 1e-6)
    })
  })

  describe('B. 队列收敛', () => {
    it('建筑队列在 200 游戏小时后应清空（不永久卡死）', () => {
      const id = home().id
      for (let i = 0; i < BUILD_SLOTS; i++) useGame.getState().upgradeBuilding(id, 1)
      expect(home().buildingQueue.length).toBe(BUILD_SLOTS)
      advanceHours(200)
      expect(home().buildingQueue.length, '建筑队列 200 小时后仍未清空').toBe(0)
    })

    it('建筑完成后等级确实提升（队列不是假清空）', () => {
      const id = home().id
      const before = home().buildings[1] ?? 0
      for (let i = 0; i < BUILD_SLOTS; i++) useGame.getState().upgradeBuilding(id, 1)
      advanceHours(200)
      expect(home().buildings[1] ?? 0, '队列清了但等级没涨').toBeGreaterThan(before)
    })

    it('研究队列在 200 游戏小时后应清空', () => {
      const h = home()
      useGame.setState({
        techs: {},
        researchQueue: [],
        planets: [{ ...h, buildings: { ...h.buildings, 31: 12 }, resources: { metal: 1e12, crystal: 1e12, deuterium: 1e12 } }],
      })
      useGame.getState().startResearch(113) // 能源技术，前置为空
      expect(useGame.getState().researchQueue.length).toBe(1)
      advanceHours(300)
      expect(useGame.getState().researchQueue.length, '研究队列 300 小时后仍未清空').toBe(0)
      expect(useGame.getState().techs[113] ?? 0, '研究完成但科技等级未提升').toBeGreaterThan(0)
    })

    it('造船队列在 200 游戏小时后应清空并产出舰船', () => {
      useGame.setState({
        techs: { ...useGame.getState().techs, 115: 1 },
        planets: useGame.getState().planets.map((p) =>
          p.isHome
            ? { ...p, buildings: { ...p.buildings, 21: 1, 14: 1 }, resources: { metal: 1e12, crystal: 1e12, deuterium: 1e12 } }
            : p,
        ),
      })
      const id = home().id
      const before = Object.values(home().ships).reduce((a, b) => a + b, 0)
      for (let i = 0; i < SHIP_SLOTS; i++) useGame.getState().buildShips(id, 204, 1)
      expect(home().shipQueue.length).toBe(SHIP_SLOTS)
      advanceHours(200)
      expect(home().shipQueue.length, '造船队列 200 小时后仍未清空').toBe(0)
      const after = Object.values(home().ships).reduce((a, b) => a + b, 0)
      expect(after, '造船完成但舰船数没涨').toBeGreaterThan(before)
    })
  })

  describe('C. 存档往返一致', () => {
    it('长时间运行后存取档，资源与建筑等级一致', () => {
      const id = home().id
      for (let i = 0; i < BUILD_SLOTS; i++) useGame.getState().upgradeBuilding(id, 1)
      advanceHours(100)

      const beforeRes = { ...home().resources }
      const beforeLv = home().buildings[1] ?? 0

      // 用 slot 1：newGame() 会 writeSlot(0) 覆盖自动存档槽，不能用 0
      useGame.getState().saveToSlot(1, 'test')
      useGame.getState().newGame()
      expect(home().buildings[1] ?? 0, '新档应为空').toBe(0)

      expect(useGame.getState().loadFromSlot(1)).toBeNull()
      const after = home()
      expect(after.resources.metal).toBeCloseTo(beforeRes.metal, 3)
      expect(after.resources.crystal).toBeCloseTo(beforeRes.crystal, 3)
      expect(after.resources.deuterium).toBeCloseTo(beforeRes.deuterium, 3)
      expect(after.buildings[1] ?? 0).toBe(beforeLv)
    })

    it('反复读档不产生资源漂移（读 10 次结果相同）', () => {
      advanceHours(20)
      useGame.getState().saveToSlot(1, 'stable')
      useGame.getState().loadFromSlot(1)
      const first = { ...home().resources }
      for (let i = 0; i < 10; i++) {
        expect(useGame.getState().loadFromSlot(1)).toBeNull()
        const r = home().resources
        expect(r.metal).toBeCloseTo(first.metal, 3)
        expect(r.crystal).toBeCloseTo(first.crystal, 3)
        expect(r.deuterium).toBeCloseTo(first.deuterium, 3)
      }
    })
  })

  describe('D. 数值表自洽（长时运行的输入前提）', () => {
    it('所有建筑都有正的 baseTime 与 factor', () => {
      for (const [id, b] of Object.entries(BUILDINGS)) {
        expect(b.baseTime, `建筑 ${id} baseTime 非法`).toBeGreaterThan(0)
        expect(b.factor, `建筑 ${id} factor 非法`).toBeGreaterThan(1)
      }
    })

    it('所有舰船/防御造价为正', () => {
      for (const [id, s] of Object.entries(SHIPS)) {
        const total = s.cost.metal + s.cost.crystal + s.cost.deuterium
        expect(total, `舰船 ${id} 总造价为 0`).toBeGreaterThan(0)
      }
      for (const [id, d] of Object.entries(DEFENSES)) {
        const total = d.cost.metal + d.cost.crystal + d.cost.deuterium
        expect(total, `防御 ${id} 总造价为 0`).toBeGreaterThan(0)
      }
    })

    it('三槽常量取值固定（防止有人改一个不改另一个）', () => {
      expect(BUILD_SLOTS).toBe(3)
      expect(SHIP_SLOTS).toBe(3)
      expect(RESEARCH_SLOTS).toBe(2)
    })
  })
})
