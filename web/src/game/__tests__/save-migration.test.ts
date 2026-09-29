import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'
import { emptyStats } from '../achievements'

/**
 * 存档迁移链回归（v2 → v11）。
 *
 * 迁移链实现在 state.ts 的 loadFromSlot 里，是 9 级 if (saveVersion === N) 串联，
 * 历史上零测试覆盖。手工造 5 份旧档做一次性 smoke 无法回归，因此这里改成
 * 「拿真实 newGame() 状态反向降级」造档：结构必然合法，且每档都精确对应
 * 某一级的真实字段形态（缺字段 / 旧形态 / 单值未包数组）。
 *
 * 覆盖：
 * - v2..v10 每一档加载后 saveVersion 均升到 11，且该级该补的字段确实补上了
 * - v1 与 v12 被版本区间校验拒绝
 * - v11 存档原样载入，不被任何迁移级改写
 */

const SLOT = 0
const SESSION = 'tester'
const SLOT_KEY = `ogame-sp-save-${SESSION}-${SLOT}`

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

/** 取一份干净的 v11 存档（deep clone，避免测试间串味）。 */
function freshSave() {
  useGame.getState().newGame()
  const s = useGame.getState()
  const file = JSON.parse(
    JSON.stringify({
      meta: {
        savedWallAt: Date.now(),
        label: '自动存档',
        gameTime: s.gameTime,
        difficulty: s.difficulty,
        planetCount: s.planets.length,
      },
      data: s,
    }),
  )
  // newGameData() 的 reports 是空数组，v3/v4 两级对战报的处理会空跑。
  // 塞一条真实结构的战斗战报，让 wallAt / debris / defense 三项迁移真正被覆盖。
  file.data.reports = [
    {
      kind: 'battle',
      id: 90001,
      time: file.data.gameTime,
      wallAt: file.data.createdWallAt,
      coords: { galaxy: 1, system: 8, position: 3 },
      targetName: '测试目标',
      input: { attacker: {}, defender: {} },
      output: { rounds: [] },
      loot: { metal: 100, crystal: 50, deuterium: 0 },
      debris: { metal: 10, crystal: 5 },
      result: 'win',
      defense: false,
    },
  ]
  return file
}

/**
 * 反向降级：把 v11 存档按目标版本「退回」成该版本应有的形态。
 * 每一步都是对应迁移级的逆操作。
 */
function downgradeTo(file: any, target: number) {
  const d = file.data
  // 11 -> 10：researchQueue 在 v10 是单值，v11 才包成数组
  if (target <= 10) d.researchQueue = d.researchQueue?.[0] ?? null
  // 10 -> 9：buildingQueue 同理
  if (target <= 9) d.planets = d.planets.map((p: any) => ({ ...p, buildingQueue: p.buildingQueue?.[0] ?? null }))
  // 9 -> 8：posCoef 是 v9 引入
  if (target <= 8) d.planets = d.planets.map((p: any) => { const c = { ...p }; delete c.posCoef; return c })
  // 8 -> 7：campaignDone 是 v8 引入
  if (target <= 7) delete d.campaignDone
  // 7 -> 6：isMoon 是 v7 引入
  if (target <= 6) d.planets = d.planets.map((p: any) => { const c = { ...p }; delete c.isMoon; return c })
  // 6 -> 5：activeEvent / lastEventRoll 是 v6 引入
  if (target <= 5) { delete d.activeEvent; delete d.lastEventRoll }
  // 5 -> 4：officers / 每日领取三件套是 v5 引入
  if (target <= 4) { delete d.officers; delete d.lastDailyClaimWallAt; delete d.dailyStreak }
  // 4 -> 3：npc 的 lastRegen/respawnAt、battle 战报的 defense 是 v4 引入
  if (target <= 3) {
    d.npcs = Object.fromEntries(
      Object.entries(d.npcs).map(([k, v]: [string, any]) => {
        const c = { ...v }
        delete c.lastRegen
        delete c.respawnAt
        return [k, c]
      }),
    )
    d.reports = (d.reports ?? []).map((r: any) => (r.kind === 'battle' ? { ...r, defense: undefined } : r))
  }
  // 3 -> 2：defenses / wallAt / debris / debrisFields / stats / achievements / tutorial* 都是 v3 引入
  if (target <= 2) {
    d.planets = d.planets.map((p: any) => { const c = { ...p }; delete c.defenses; return c })
    d.npcs = Object.fromEntries(
      Object.entries(d.npcs).map(([k, v]: [string, any]) => { const c = { ...v }; delete c.defenses; return [k, c] }),
    )
    d.reports = (d.reports ?? []).map((r: any) => {
      const c = { ...r }
      delete c.wallAt
      delete c.debris
      return c
    })
    delete d.debrisFields
    delete d.stats
    delete d.achievements
    delete d.tutorialDone
    delete d.tutorialSkipped
  }
  // 11 期内追加字段：始终不带，验证 ?? 兜底
  delete d.campaignEliteDone
  d.planets = d.planets.map((p: any) => { const c = { ...p }; delete c.buildingWaitQueue; return c })

  d.saveVersion = target
  return file
}

function writeAndLoad(file: unknown) {
  localStorage.setItem(SLOT_KEY, JSON.stringify(file))
  return useGame.getState().loadFromSlot(SLOT)
}

describe('存档迁移链 v2 → v11', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    localStorage.setItem('ogame-sp-session', SESSION)
  })

  it('v2 旧档：9 级全链贯通，saveVersion 升到 11', () => {
    const file = downgradeTo(freshSave(), 2)
    expect(writeAndLoad(file)).toBeNull()
    const s = useGame.getState()
    expect(s.saveVersion).toBe(11)
    // v3 补的
    expect(s.planets.every((p) => p.defenses !== undefined)).toBe(true)
    expect(s.debrisFields).toBeDefined()
    expect(s.stats).toBeDefined()
    expect(Array.isArray(s.achievements)).toBe(true)
    // v3 对战报：wallAt 与 debris 必须补齐（v2 档里被剥掉了）
    const battle = s.reports.find((r) => r.kind === 'battle') as any
    expect(battle).toBeDefined()
    expect(battle.wallAt).toBe(file.data.createdWallAt)
    expect(battle.debris).toEqual({ metal: 0, crystal: 0 })
    // v4 补的
    expect(Object.values(s.npcs).every((n) => 'lastRegen' in n && 'respawnAt' in n)).toBe(true)
    expect((s.reports.find((r) => r.kind === 'battle') as any).defense).toBe(false)
    // v5 补的
    expect(s.officers).toBeDefined()
    expect(typeof s.lastDailyClaimWallAt).toBe('number')
    expect(typeof s.dailyStreak).toBe('number')
    // v6 补的
    expect(typeof s.lastEventRoll).toBe('number')
    // v7 补的
    expect(s.planets.every((p) => typeof p.isMoon === 'boolean')).toBe(true)
    // v8 补的
    expect(Array.isArray(s.campaignDone)).toBe(true)
    // v9 补的
    expect(s.planets.every((p) => p.posCoef !== undefined)).toBe(true)
    // v10 补的：单值包成数组
    expect(Array.isArray(s.planets[0].buildingQueue)).toBe(true)
    // v11 补的
    expect(Array.isArray(s.researchQueue)).toBe(true)
    // v11 期内追加字段的 ?? 兜底
    expect(Array.isArray(s.campaignEliteDone)).toBe(true)
    // buildingWaitQueue 于 2026-09-28 整体移除：迁移后该字段必须不存在（预约已退款）
    expect(s.planets.every((p) => (p as unknown as Record<string, unknown>).buildingWaitQueue === undefined)).toBe(true)
  })

  const midCases: Array<[number, (s: ReturnType<typeof useGame.getState>) => void]> = [
    [10, (s) => { expect(Array.isArray(s.researchQueue)).toBe(true) }],
    [9, (s) => { expect(Array.isArray(s.planets[0].buildingQueue)).toBe(true) }],
    [8, (s) => { expect(s.planets.every((p) => p.posCoef !== undefined)).toBe(true) }],
    [7, (s) => { expect(Array.isArray(s.campaignDone)).toBe(true) }],
    [6, (s) => { expect(s.planets.every((p) => typeof p.isMoon === 'boolean')).toBe(true) }],
    [5, (s) => { expect(typeof s.lastEventRoll).toBe('number') }],
    [4, (s) => { expect(typeof s.dailyStreak).toBe('number') }],
    [3, (s) => { expect(Object.values(s.npcs).every((n) => 'lastRegen' in n)).toBe(true) }],
    [2, (s) => { expect(s.planets.every((p) => p.defenses !== undefined)).toBe(true) }],
  ]

  for (const [version, assert] of midCases) {
    it(`v${version} 旧档：升到 11 且该级字段补齐`, () => {
      const file = downgradeTo(freshSave(), version)
      expect(file.data.saveVersion).toBe(version)
      expect(writeAndLoad(file)).toBeNull()
      const s = useGame.getState()
      expect(s.saveVersion).toBe(11)
      assert(s)
      // 每一档都必须带上后续所有级的结果
      expect(Array.isArray(s.researchQueue)).toBe(true)
      expect(s.planets.every((p) => (p as unknown as Record<string, unknown>).buildingWaitQueue === undefined)).toBe(true)
    })
  }

  it('v11 存档：原样载入，不被迁移链改写', () => {
    const file = freshSave()
    file.data.saveVersion = 11
    const before = JSON.stringify(file.data.planets[0].buildings)
    expect(writeAndLoad(file)).toBeNull()
    const s = useGame.getState()
    expect(s.saveVersion).toBe(11)
    expect(JSON.stringify(s.planets[0].buildings)).toBe(before)
  })

  it('v1 与 v12 被版本区间校验拒绝', () => {
    for (const bad of [1, 12, 0, 99]) {
      localStorage.clear()
      localStorage.setItem('ogame-sp-session', SESSION)
      const file = freshSave()
      file.data.saveVersion = bad
      expect(writeAndLoad(file)).toBe('存档版本不兼容')
    }
  })

  it('缺 localStorage 存档时返回「存档不存在」，未登录时返回「未登录」', () => {
    expect(useGame.getState().loadFromSlot(SLOT)).toBe('存档不存在')
    localStorage.removeItem('ogame-sp-session')
    expect(useGame.getState().loadFromSlot(SLOT)).toBe('未登录')
  })

  it('结构损坏的 JSON 返回「存档已损坏」而非抛异常', () => {
    localStorage.setItem(SLOT_KEY, '{ not json')
    expect(useGame.getState().loadFromSlot(SLOT)).toBe('存档已损坏')
  })

  it('emptyStats() 补齐 stats 时不丢已有计数（v5→v6 的合并语义）', () => {
    const file = downgradeTo(freshSave(), 5)
    file.data.stats = { ...emptyStats(), battlesWon: 7, totalLoot: 1234 }
    expect(writeAndLoad(file)).toBeNull()
    const s = useGame.getState()
    expect(s.stats.battlesWon).toBe(7)
    expect(s.stats.totalLoot).toBe(1234)
  })
})
