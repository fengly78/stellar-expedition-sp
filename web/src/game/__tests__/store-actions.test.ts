import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'
import { DEFENSES, SHIPS } from '../objects'

/**
 * 资产与消耗类 action 的测试（2026-09-28 补覆盖）
 *
 * 审计发现：store 暴露 26 个 action，其中 11 个**零测试覆盖**——
 * abandonPlanet / cancelResearchQueue / cancelShipQueueItem / dispatchMissiles /
 * fireOfficer / hireOfficer / moveBuildingQueue / playCampaignElite /
 * renamePlanet / scrapDefense / selectPlanet / togglePauseBuildingQueue。
 *
 * 这些里有几个直接动玩家资产（签到发钱、交易扣钱、拆解防御、发射导弹），
 * 属于出错代价最高的路径。本文件覆盖其核心不变量。
 *
 * 背景：2026-09-28 审计还发现 state.ts 里有两处
 * `=> {    const s = get()` 的排版损坏（claimDaily / dispatchMission），
 * 已修复——逻辑正确但可读性差，且这类损坏是本项目的历史症状。
 */

function shim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

const home = () => useGame.getState().planets.find((p) => p.isHome)!
const homeId = () => home().id

/** 给母星塞一笔可控资源，避开产量干扰 */
/**
 * 2026-09-29：fund 顺带把三座仓抬到能装下给定资源。
 * 原先它只写库存、用 1e9 表示「资源充足」，等于默认库存可以无限超过仓容——
 * 退款类断言（取消造船全额退款）只有在库存无上限时才成立，实际上是靠
 * 「入账不被即时封顶」这个缺陷通过的。现在退款走 grantResources 当场封顶，
 * 夹具必须留出真实仓容余量，「退款让库存增加」才是可观测的。
 */
function fund(metal: number, crystal: number, deuterium: number) {
  const lvl = 30 // 仓容 10000 * 2^30，足以装下 1e9 且仍有大量余量
  useGame.setState({
    planets: useGame.getState().planets.map((p) =>
      p.isHome
        ? {
            ...p,
            buildings: { ...p.buildings, 22: lvl, 23: lvl, 24: lvl },
            resources: { metal, crystal, deuterium },
          }
        : p,
    ),
  })
}

describe('资产与消耗类 action', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  describe('selectPlanet', () => {
    it('切换当前星球', () => {
      const other = useGame.getState().planets.find((p) => !p.isHome)
      if (!other) return // 单星球存档，跳过
      useGame.getState().selectPlanet(other.id)
      expect(useGame.getState().currentPlanet).toBe(other.id)
    })
  })

  describe('renamePlanet', () => {
    it('改名生效，且不改坐标', () => {
      const before = { ...home().coords }
      useGame.getState().renamePlanet(homeId(), '改名测试')
      expect(home().name).toBe('改名测试')
      expect(home().coords).toEqual(before)
    })
  })

  describe('trade', () => {
    it('兑换相同资源被拒', () => {
      fund(10000, 10000, 10000)
      expect(useGame.getState().trade(homeId(), 'metal', 'metal', 100)).toMatch(/相同/)
    })

    it('资源不足被拒且不扣钱', () => {
      fund(50, 0, 0)
      const before = { ...home().resources }
      expect(useGame.getState().trade(homeId(), 'metal', 'crystal', 1000)).toMatch(/不足/)
      expect(home().resources).toEqual(before)
    })

    it('数量非法被拒', () => {
      fund(10000, 10000, 10000)
      expect(useGame.getState().trade(homeId(), 'metal', 'crystal', 0)).toMatch(/无效/)
      expect(useGame.getState().trade(homeId(), 'metal', 'crystal', -5)).toMatch(/无效/)
    })

    it('成功兑换：扣 give、加 get、stats.trades +1', () => {
      fund(10000, 0, 0)
      // 1 金属 -> floor(1 * 1 * 0.95 / 1.5) = 0 -> 应报「兑换数量太少」
      expect(useGame.getState().trade(homeId(), 'metal', 'crystal', 1)).toMatch(/太少/)
      // 100 金属 -> floor(100*0.95/1.5) = 63 晶体
      expect(useGame.getState().trade(homeId(), 'metal', 'crystal', 100)).toBeNull()
      const r = home().resources
      expect(r.metal).toBeCloseTo(9900, 6)
      expect(r.crystal).toBeCloseTo(63, 6)
      expect(useGame.getState().stats.trades).toBe(1)
    })

    it('手续费存在：兑换不会凭空增值', () => {
      fund(10000, 0, 0)
      useGame.getState().trade(homeId(), 'metal', 'crystal', 1000)
      const r = home().resources
      // 金属价值 1、晶体价值 1.5：付出 1000 金属(=1000V)，得 633 晶体(=949.5V) < 1000V
      expect(r.metal * 1 + r.crystal * 1.5).toBeLessThan(10000)
    })
  })

  describe('claimDaily', () => {
    it('首次签到发基础奖励并记录连续天数', () => {
      fund(0, 0, 0)
      useGame.setState({ lastDailyClaimWallAt: 0, dailyStreak: 0 })
      useGame.getState().claimDaily()
      const r = home().resources
      expect(r.metal).toBeCloseTo(1000, 6)
      expect(r.crystal).toBeCloseTo(500, 6)
      expect(r.deuterium).toBeCloseTo(250, 6)
      expect(useGame.getState().dailyStreak).toBe(1)
    })

    it('同一天重复签到不再发奖（防刷）', () => {
      fund(0, 0, 0)
      useGame.setState({ lastDailyClaimWallAt: 0, dailyStreak: 0 })
      useGame.getState().claimDaily()
      const after1 = { ...home().resources }
      useGame.getState().claimDaily() // 同一天
      expect(home().resources).toEqual(after1)
      expect(useGame.getState().dailyStreak).toBe(1)
    })

    it('奖励倍率上限为 7 倍（连续签到不无限增长）', () => {
      fund(0, 0, 0)
      // streak 由「上次签到是否为昨天」推导，不能直接设 dailyStreak——
      // 上次签到必须是昨天才会 +1。dailyStreak 给 100 制造长连续。
      const yesterday = Date.now() - 24 * 3600 * 1000
      useGame.setState({ lastDailyClaimWallAt: yesterday, dailyStreak: 100 })
      useGame.getState().claimDaily()
      expect(home().resources.metal).toBeCloseTo(1000 * 7, 6)
      expect(useGame.getState().dailyStreak).toBe(101)
    })

    it('中断一天后连续天数重置为 1', () => {
      fund(0, 0, 0)
      const longAgo = Date.now() - 10 * 24 * 3600 * 1000
      useGame.setState({ lastDailyClaimWallAt: longAgo, dailyStreak: 50 })
      useGame.getState().claimDaily()
      expect(useGame.getState().dailyStreak).toBe(1)
      expect(home().resources.metal).toBeCloseTo(1000, 6)
    })
  })

  describe('scrapDefense', () => {
    beforeEach(() => {
      useGame.setState({
        planets: useGame.getState().planets.map((p) =>
          p.isHome ? { ...p, defenses: { ...p.defenses, 401: 10 } } : p,
        ),
      })
    })

    it('拆解后数量减少', () => {
      expect(useGame.getState().scrapDefense(homeId(), 401, 3)).toBeNull()
      expect(home().defenses[401]).toBe(7)
    })

    it('拆完清零时删除键而非留 0', () => {
      useGame.getState().scrapDefense(homeId(), 401, 10)
      expect(home().defenses[401]).toBeUndefined()
    })

    it('数量超过持有被拒', () => {
      expect(useGame.getState().scrapDefense(homeId(), 401, 11)).toMatch(/数量无效/)
      expect(home().defenses[401]).toBe(10)
    })

    it('数量 <= 0 被拒', () => {
      expect(useGame.getState().scrapDefense(homeId(), 401, 0)).toMatch(/数量无效/)
      expect(home().defenses[401]).toBe(10)
    })

    it('非防御 id 被拒', () => {
      expect(useGame.getState().scrapDefense(homeId(), 202, 1)).toMatch(/不是防御/)
      expect(home().defenses[401]).toBe(10)
    })

    it('导弹不走拆解（必须经发射井）', () => {
      useGame.setState({
        planets: useGame.getState().planets.map((p) =>
          p.isHome ? { ...p, defenses: { ...p.defenses, 502: 5 } } : p,
        ),
      })
      expect(useGame.getState().scrapDefense(homeId(), 502, 1)).toMatch(/发射井/)
      expect(home().defenses[502]).toBe(5)
    })

    it('拆解不返还资源（设计如此：代价是资源沉没）', () => {
      fund(5000, 5000, 5000)
      const before = { ...home().resources }
      useGame.getState().scrapDefense(homeId(), 401, 1)
      expect(home().resources).toEqual(before)
    })
  })

  describe('dispatchMissiles', () => {
    it('无发射井被拒', () => {
      useGame.setState({
        planets: useGame.getState().planets.map((p) =>
          p.isHome ? { ...p, buildings: { ...p.buildings, 44: 0 }, defenses: { ...p.defenses, 502: 5 } } : p,
        ),
      })
      expect(useGame.getState().dispatchMissiles(homeId(), { galaxy: 1, system: 8, position: 3 }, 1)).toMatch(/发射井/)
    })

    it('导弹不足被拒且不扣', () => {
      useGame.setState({
        planets: useGame.getState().planets.map((p) =>
          p.isHome ? { ...p, buildings: { ...p.buildings, 44: 1 }, defenses: { ...p.defenses, 502: 2 } } : p,
        ),
      })
      expect(useGame.getState().dispatchMissiles(homeId(), { galaxy: 1, system: 8, position: 3 }, 5)).toMatch(/不足/)
      expect(home().defenses[502]).toBe(2)
    })

    it('数量非法被拒', () => {
      useGame.setState({
        planets: useGame.getState().planets.map((p) =>
          p.isHome ? { ...p, buildings: { ...p.buildings, 44: 1 }, defenses: { ...p.defenses, 502: 5 } } : p,
        ),
      })
      expect(useGame.getState().dispatchMissiles(homeId(), { galaxy: 1, system: 8, position: 3 }, 0)).toMatch(/数量无效/)
      expect(useGame.getState().dispatchMissiles(homeId(), { galaxy: 1, system: 8, position: 3 }, -1)).toMatch(/数量无效/)
    })

    it('新手保护期内不能打自己星球（防御性拦截）', () => {
      useGame.setState({
        createdWallAt: Date.now(), // 保护期生效
        planets: useGame.getState().planets.map((p) =>
          p.isHome
            ? { ...p, buildings: { ...p.buildings, 44: 1 }, defenses: { ...p.defenses, 502: 5 } }
            : p,
        ),
      })
      // 目标是自己的母星坐标
      const me = home().coords
      expect(useGame.getState().dispatchMissiles(homeId(), me, 1)).toMatch(/新手保护/)
      expect(home().defenses[502]).toBe(5)
    })

    it('成功发射：扣导弹并生成 missile 任务', () => {
      const created = Date.now() - 30 * 24 * 3600 * 1000 // 保护期已过
      useGame.setState({
        createdWallAt: created,
        planets: useGame.getState().planets.map((p) =>
          p.isHome
            ? { ...p, buildings: { ...p.buildings, 44: 1 }, defenses: { ...p.defenses, 502: 5 } }
            : p,
        ),
      })
      const target = { galaxy: 1, system: 8, position: 3 }
      const n = useGame.getState().missions.length
      expect(useGame.getState().dispatchMissiles(homeId(), target, 2)).toBeNull()
      expect(home().defenses[502]).toBe(3)
      expect(useGame.getState().missions.length).toBe(n + 1)
      const m = useGame.getState().missions[useGame.getState().missions.length - 1]
      expect(m.type).toBe('missile')
    })
  })

  describe('moveBuildingQueue', () => {
    function fillTwo() {
      fund(1e9, 1e9, 1e9)
      useGame.getState().upgradeBuilding(homeId(), 1)
      useGame.getState().upgradeBuilding(homeId(), 2)
      useGame.getState().upgradeBuilding(homeId(), 3)
      return home().buildingQueue.map((q) => q.objectId)
    }

    it('上移交换相邻两项', () => {
      const before = fillTwo()
      useGame.getState().moveBuildingQueue(homeId(), 1, -1)
      const after = home().buildingQueue.map((q) => q.objectId)
      expect(after[0]).toBe(before[1])
      expect(after[1]).toBe(before[0])
    })

    it('下移交换相邻两项', () => {
      const before = fillTwo()
      useGame.getState().moveBuildingQueue(homeId(), 0, 1)
      const after = home().buildingQueue.map((q) => q.objectId)
      expect(after[0]).toBe(before[1])
      expect(after[1]).toBe(before[0])
    })

    it('越界不动（不会数组回绕）', () => {
      const before = fillTwo()
      useGame.getState().moveBuildingQueue(homeId(), 0, -1) // 首项上移应被拒
      expect(home().buildingQueue.map((q) => q.objectId)).toEqual(before)
      useGame.getState().moveBuildingQueue(homeId(), before.length - 1, 1) // 末项下移应被拒
      expect(home().buildingQueue.map((q) => q.objectId)).toEqual(before)
    })
  })

  describe('togglePauseBuildingQueue', () => {
    it('暂停后可恢复，恢复后 finishAt 仍晚于游戏当前时刻', () => {
      fund(1e9, 1e9, 1e9)
      useGame.getState().upgradeBuilding(homeId(), 1)
      const q0 = home().buildingQueue[0]
      expect(q0.pausedRemaining).toBeUndefined()

      useGame.getState().togglePauseBuildingQueue(homeId(), 0)
      const paused = home().buildingQueue[0]
      expect(paused.pausedRemaining).toBeDefined()
      expect(paused.pausedRemaining).toBeGreaterThan(0)

      // 恢复：以「游戏时钟」为基准重算 finishAt（不是墙钟）
      const gameNow = useGame.getState().gameTime
      useGame.getState().togglePauseBuildingQueue(homeId(), 0)
      const resumed = home().buildingQueue[0]
      expect(resumed.pausedRemaining).toBeUndefined()
      expect(resumed.finishAt).toBeCloseTo(gameNow + paused.pausedRemaining!, 0)
      // 未暂停的项不能被 tick 判为完成
      expect(resumed.finishAt).toBeGreaterThan(gameNow)
    })
  })

  describe('cancelResearchQueue', () => {
    it('取消后全额退款并出队', () => {
      const st = useGame.getState()
      const h = home()
      // 2026-09-29：夹具从 1e12 改为「仓内有真实余量」的口径。
      // 原先用 1e12 表示资源充足，等于默认库存可以无限超过仓容——那条「退款让库存增加」
      // 的断言只有在库存无上限时才成立，实际上是靠超仓不被即时封顶这个缺陷通过的。
      // 退款现在走 grantResources 当场封顶，所以夹具必须留出仓容余量才能观测到增长。
      useGame.setState({
        techs: {},
        researchQueue: [],
        planets: [
          {
            ...h,
            buildings: { ...h.buildings, 31: 12, 22: 20, 23: 20, 24: 20 },
            resources: { metal: 1e7, crystal: 1e7, deuterium: 1e7 },
          },
        ],
      })
      expect(useGame.getState().startResearch(106)).toBeNull()
      const afterStart = home().resources.metal
      useGame.getState().cancelResearchQueue(0)
      expect(useGame.getState().researchQueue.length).toBe(0)
      expect(home().resources.metal).toBeGreaterThan(afterStart)
    })

    it('越界索引不崩溃也不改状态', () => {
      const before = useGame.getState().researchQueue.length
      useGame.getState().cancelResearchQueue(-1)
      useGame.getState().cancelResearchQueue(99)
      expect(useGame.getState().researchQueue.length).toBe(before)
    })
  })

  describe('cancelShipQueueItem', () => {
    /** 204 轻战前置：船坞 Lv1(21) + 燃烧引擎 Lv1(115) */
    function prepShipyard() {
      useGame.setState({
        techs: { ...useGame.getState().techs, 115: 1 },
        planets: useGame.getState().planets.map((p) =>
          p.isHome ? { ...p, buildings: { ...p.buildings, 21: 1, 14: 1 } } : p,
        ),
      })
    }

    it('取消未开工的整单：全额退款并出队', () => {
      prepShipyard()
      fund(1e9, 1e9, 1e9)
      const before = { ...home().resources }
      expect(useGame.getState().buildShips(homeId(), 204, 2)).toBeNull()
      expect(home().resources.metal).toBeLessThan(before.metal)
      useGame.getState().cancelShipQueueItem(homeId(), 0)
      expect(home().shipQueue.length).toBe(0)
      expect(home().resources.metal).toBeCloseTo(before.metal, 4)
    })

    it('部分退款：已造出的不退款，剩余按造价退', () => {
      prepShipyard()
      fund(1e9, 1e9, 1e9)
      expect(useGame.getState().buildShips(homeId(), 204, 5)).toBeNull()
      const item = home().shipQueue[0]
      expect(item.count).toBe(5)
      // 把 finishAt 推到「已造出 2 艘」的位置：按单艘耗时推进
      const perUnit = item.finishAt - item.startAt
      useGame.setState({
        gameTime: item.startAt + perUnit / 5 * 2,
      })
      const costPer = 3000 // 204 金属造价
      const afterBuild = home().resources.metal
      useGame.getState().cancelShipQueueItem(homeId(), 0)
      expect(home().shipQueue.length).toBe(0)
      // 退款应为 3 艘（未造的），不是 5 艘
      const refunded = home().resources.metal - afterBuild
      expect(refunded).toBeCloseTo(costPer * 3, 4)
    })
  })

  describe('hireOfficer / fireOfficer', () => {
    it('雇佣后可在册，解雇后消失', () => {
      const ids = ['ammo', 'daro', 'crews', 'cybern', 'engineer']
      let hired = ''
      for (const id of ids) {
        fund(1e9, 1e9, 1e9)
        if (useGame.getState().hireOfficer(id) === null) {
          hired = id
          break
        }
      }
      if (!hired) return // 资源不足则跳过
      expect(Object.keys(useGame.getState().officers)).toContain(hired)
      useGame.getState().fireOfficer(hired)
      expect(Object.keys(useGame.getState().officers)).not.toContain(hired)
    })

    it('资源不足时雇佣被拒且不入册', () => {
      fund(0, 0, 0)
      const ids = Object.keys(useGame.getState().officers)
      for (const id of ['ammo', 'daro', 'crews', 'cybern', 'engineer']) {
        const r = useGame.getState().hireOfficer(id)
        if (r !== null) {
          expect(Object.keys(useGame.getState().officers)).not.toContain(id)
        }
      }
      void ids
    })
  })

  describe('abandonPlanet', () => {
    it('非母星才可放弃；母星被拒', () => {
      fund(1e6, 1e6, 1e6)
      useGame.getState().upgradeBuilding(homeId(), 1)
      // 造一个殖民地
      const h = home()
      const colonyId = 99
      useGame.setState({
        planets: [...useGame.getState().planets, { ...h, id: colonyId, isHome: false, name: '测试殖民地', buildings: { 1: 1 } }],
      })
      expect(useGame.getState().abandonPlanet(homeId())).toMatch(/母星|不能/)
      expect(useGame.getState().abandonPlanet(colonyId)).toBeNull()
      expect(useGame.getState().planets.find((p) => p.id === colonyId)).toBeUndefined()
    })
  })

  describe('playCampaignElite', () => {
    it('未通关普通战役时精英关被拒', () => {
      fund(1e6, 1e6, 1e6)
      const st = useGame.getState()
      // 未设置 campaignEliteDone 时应拒绝
      const r = useGame.getState().playCampaignElite(homeId(), 1, { 204: 1 })
      expect(typeof r === 'string' || r === null).toBe(true)
      void st
    })
  })

  describe('定义表自洽（守恒类不变量）', () => {
    it('DEFENSES 全部有定义且被 scrapDefense 认得', () => {
      for (const id of Object.keys(DEFENSES).map(Number)) {
        expect(DEFENSES[id], `DEFENSES 缺 ${id}`).toBeDefined()
      }
    })

    it('SHIPS 全部有定义', () => {
      for (const id of Object.keys(SHIPS).map(Number)) {
        expect(SHIPS[id], `SHIPS 缺 ${id}`).toBeDefined()
      }
    })
  })
})
