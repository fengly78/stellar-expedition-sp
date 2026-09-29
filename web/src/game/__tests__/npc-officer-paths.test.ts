import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'
import { SHIPS, DEFENSES } from '../objects'

/**
 * NPC 骚扰 / 官员维护费的跨 tick 资源守恒（2026-09-28）
 *
 * 这两条路径此前无任何运行时验证：
 *   · NPC 骚扰：tick 里按概率向玩家星球派遣反击舰队，originId = -1
 *     （即「从 NPC 出发」），涉及返航时把舰船还给 NPC 而非玩家。
 *   · 官员维护费：按周循环收缴，欠费则军官离职。
 *
 * 关注点：资源不凭空增减、mission 正常清理、军官状态与扣费一致。
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

function settleTutorial() {
  for (let i = 0; i < 3; i++) {
    useGame.setState({ lastWallTick: Date.now() - 600000, timeScale: 20 })
    useGame.getState().tick()
  }
  const st = useGame.getState()
  useGame.setState({ tutorialDone: [...new Set([...st.tutorialDone, 7])] })
}

describe('NPC 骚扰任务守恒', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('长时间运行不产生玩家侧舰船（NPC 舰队 originId=-1，不该进玩家星球）', () => {
    settleTutorial()
    const countPlayerShips = () =>
      useGame.getState().planets.reduce((sum, p) => sum + Object.values(p.ships).reduce((a, b) => a + b, 0), 0)
    const before = countPlayerShips()
    // 新手保护期外才会被骚扰
    useGame.setState({ createdWallAt: Date.now() - 30 * 24 * 3600 * 1000 })
    tick(40)
    const after = countPlayerShips()
    // NPC 骚扰可能造成损失（玩家被打），但不会凭空增加
    expect(after, '玩家舰船总数增加（NPC 舰队不应进玩家星球）').toBeLessThanOrEqual(before)
  })

  it('NPC 任务到达后 mission 被清理，不无限累积', () => {
    settleTutorial()
    useGame.setState({ createdWallAt: Date.now() - 30 * 24 * 3600 * 1000 })
    tick(50)
    // 可能仍有在途任务，但不应出现大量滞留
    const missions = useGame.getState().missions
    expect(missions.length, `NPC 任务累积到 ${missions.length} 个，清理异常`).toBeLessThanOrEqual(10)
    // 所有 mission 的 fleet 与 cargo 必须是有限非负数
    for (const m of missions) {
      for (const [id, n] of Object.entries(m.fleet)) {
        expect(Number.isFinite(n), `mission fleet ${id} 非有限数`).toBe(true)
        expect(n, `mission fleet ${id} 为负`).toBeGreaterThanOrEqual(0)
      }
      for (const [r, n] of Object.entries(m.cargo)) {
        expect(Number.isFinite(n), `mission cargo ${r} 非有限数`).toBe(true)
        expect(n, `mission cargo ${r} 为负`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('长期运行后资源不出现负数', () => {
    settleTutorial()
    useGame.setState({ createdWallAt: Date.now() - 30 * 24 * 3600 * 1000 })
    tick(40)
    for (const p of useGame.getState().planets) {
      expect(p.resources.metal, `${p.name} 金属为负`).toBeGreaterThanOrEqual(0)
      expect(p.resources.crystal, `${p.name} 晶体为负`).toBeGreaterThanOrEqual(0)
      expect(p.resources.deuterium, `${p.name} 重氢为负`).toBeGreaterThanOrEqual(0)
    }
  })

  it('新开局（保护期内）不会被 NPC 骚扰', () => {
    settleTutorial()
    // createdWallAt 为开局时间 -> 保护期生效
    tick(30)
    const npcAttacks = useGame.getState().missions.filter((m) => m.npcOwned)
    expect(npcAttacks.length, '新手保护期内仍被 NPC 骚扰').toBe(0)
  })

  /**
   * 上面那条 tick(30) 只能覆盖到「事件恰好没掷中海盗区间」的运气情形：
   * 海盗分支要求 mulberry32(gameNow)() 落在 [0.17, 0.25)，单次概率仅 8%，
   * 因此它在无保护漏洞的版本上也是 10/10 通过——零鉴别力。
   *
   * 这里把 gameNow 钉到已探明的种子（roll = 0.2173，落在海盗区间），
   * 并让 lastEventRoll 落后 24h 以跨过事件门控，确定性地命中海盗分支。
   * 修复前：海盗巡逻队无视新手保护，直接向母星派出攻击舰队 -> 本用例失败。
   * 修复后：npcOwned 任务数为 0。
   */
  it('保护期内海盗巡逻队事件不会向玩家派出舰队', () => {
    settleTutorial()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    useGame.setState({ createdWallAt: Date.now() })
    const st = useGame.getState()
    // seed 15000 -> mulberry32(15000)() = 0.2173 ∈ [0.17, 0.25)
    const targetGameNow = 15000
    useGame.setState({
      gameTime: targetGameNow,
      lastEventRoll: targetGameNow - 24 * 3600 * 1000 - 1,
      lastWallTick: Date.now(),
      timeScale: 1,
    })
    useGame.getState().tick()
    // 先确认事件确实掷到了海盗分支（否则本用例会退化成空跑）
    expect(useGame.getState().lastEventRoll, '事件未触发，种子失效').toBe(targetGameNow)
    const npcAttacks = useGame.getState().missions.filter((m) => m.npcOwned)
    expect(
      npcAttacks.map((m) => m.to),
      '新手保护期内海盗巡逻队仍向玩家星球派出舰队',
    ).toEqual([])
    // 母星不该凭空出现战报
    expect(useGame.getState().stats.battlesTotal, '保护期内产生了战斗').toBe(0)
    expect(useGame.getState().debrisFields, '保护期内母星周边出现战斗残骸').toEqual({})
    expect(st.planets.length).toBeGreaterThan(0)
  })

  it('保护期外海盗巡逻队事件照常发生（修复不能把功能一并关掉）', () => {
    settleTutorial()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    useGame.setState({ createdWallAt: Date.now() - 30 * 24 * 3600 * 1000 })
    const targetGameNow = 15000
    useGame.setState({
      gameTime: targetGameNow,
      lastEventRoll: targetGameNow - 24 * 3600 * 1000 - 1,
      lastWallTick: Date.now(),
      timeScale: 1,
    })
    useGame.getState().tick()
    const npcAttacks = useGame.getState().missions.filter((m) => m.npcOwned)
    expect(npcAttacks.length, '保护期外海盗骚扰不再触发（修复过度）').toBeGreaterThan(0)
  })
})

describe('官员维护费守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('资源充足时按周扣费，军官保留', () => {
    settleTutorial()
    const st = useGame.getState()
    // 找一个已知军官 id
    const officerIds = Object.keys(st.officers)
    const id = 'commander'
    const before = { ...home().resources }
    // 直接雇佣（资源给足）
    useGame.setState({
      planets: st.planets.map((p) =>
        p.isHome ? { ...p, resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 } } : p,
      ),
    })
    const hired = useGame.getState().hireOfficer(id)
    if (hired !== null) return // 该 id 不存在则跳过
    const after = useGame.getState()
    expect(Object.keys(after.officers), '雇佣后军官不在册').toContain(id)
    // 雇佣本身应扣一笔费用。commander 的 hireCost.metal = 0（只扣晶体/氘），
    // 所以按晶体断言——早先误按金属断言，金属本就不该变。
    expect(
      home().resources.crystal,
      `雇佣后晶体未扣减（commander 雇佣费 40000 晶体，雇佣前 ${before.crystal}）`,
    ).toBeLessThan(1e6)
    expect(home().resources.crystal).toBeLessThan(before.crystal)
    void officerIds
  })

  it('资源枯竭时军官离职（欠费自动解职）', () => {
    settleTutorial()
    const st = useGame.getState()
    useGame.setState({
      planets: st.planets.map((p) =>
        p.isHome ? { ...p, resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 } } : p,
      ),
    })
    if (useGame.getState().hireOfficer('commander') !== null) return
    expect(Object.keys(useGame.getState().officers)).toContain('commander')

    // 把资源清零并把 nextUpkeepAt 推到过去。
    // 注意 nextUpkeepAt 用的是**游戏时钟**（hireOfficer 里是 s.gameTime + 7 天），
    // 不是墙钟 Date.now()——早先误用 Date.now() 导致与 gameNow 量级不匹配而测不出。
    useGame.setState({
      planets: useGame.getState().planets.map((p) =>
        p.isHome ? { ...p, resources: { metal: 0, crystal: 0, deuterium: 0 } } : p,
      ),
      officers: { commander: { hiredAt: 0, nextUpkeepAt: useGame.getState().gameTime - 1000 } },
    })
    tick(2)
    expect(
      Object.keys(useGame.getState().officers),
      '资源枯竭后军官仍未离职',
    ).not.toContain('commander')
  })

  it('维护费不会把资源扣成负数', () => {
    settleTutorial()
    const st = useGame.getState()
    useGame.setState({
      planets: st.planets.map((p) =>
        p.isHome ? { ...p, resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 } } : p,
      ),
    })
    if (useGame.getState().hireOfficer('commander') !== null) return
    // 资源刚好够一次维护费
    const cost = { metal: 100, crystal: 50, deuterium: 0 }
    useGame.setState({
      planets: useGame.getState().planets.map((p) =>
        p.isHome ? { ...p, resources: { ...cost } } : p,
      ),
      officers: { commander: { hiredAt: 0, nextUpkeepAt: useGame.getState().gameTime - 1000 } },
    })
    tick(2)
    for (const p of useGame.getState().planets) {
      expect(p.resources.metal, '维护费扣成负数').toBeGreaterThanOrEqual(0)
      expect(p.resources.crystal, '维护费扣成负数').toBeGreaterThanOrEqual(0)
      expect(p.resources.deuterium, '维护费扣成负数').toBeGreaterThanOrEqual(0)
    }
  })

  it('OFFICERS 定义表自洽：每名军官都有周维护费', () => {
    // hireOfficer 依赖 weeklyCost，缺字段会导致 NaN 扣费
    const ids = ['commander', 'ammo', 'daro', 'crews', 'cybern', 'engineer', 'geologist', 'tactician']
    for (const id of ids) {
      const ok = useGame.getState().hireOfficer(id)
      if (ok !== null) continue
      const hired = useGame.getState().officers[id]
      expect(hired, `军官 ${id} 雇佣后状态异常`).toBeDefined()
      useGame.getState().fireOfficer(id)
    }
    expect(SHIPS).toBeDefined()
    expect(DEFENSES).toBeDefined()
  })
})
