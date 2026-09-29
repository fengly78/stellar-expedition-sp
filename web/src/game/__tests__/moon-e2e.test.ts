import { describe, expect, it, beforeEach } from 'vitest'
import { moonAt, useGame } from '../state'
import { npcKey } from '../npc'

// node 测试环境无 localStorage：newGame 会写自动存档，垫一个内存实现
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  }
}

// 月球端到端回归（2026-09-25）：真实 store + 真实战斗引擎走完整链路
// 派遣攻击 → tick 结算 → 双方损失沉淀残骸 ≥10 万 → 经典概率（10 万=1%，上限 20%）
// 凝聚月球 → planets 新增 isMoon 星球（名"XX之月"、同坐标）。
// 概率分支用"多尝试"收敛：每轮换 gameTime 改变 roll 种子，150 次全失败概率 <1e-10。
function hardNpcCoord(): { galaxy: number; system: number; position: number } {
  const s = useGame.getState()
  for (const key of Object.keys(s.npcs)) {
    const n = s.npcs[key]
    if (n.coords.galaxy === 1 && n.coords.system >= 13) {
      // 高危档 + 数千敌军：单场残骸冲到 2M+，使月球概率顶到经典上限 20%
      n.fleet = { 204: 5000 }
      n.defenses = { 401: 5 }
      return n.coords
    }
  }
  throw new Error('no difficulty-2 npc generated')
}

describe('月球端到端（真实引擎链路）', () => {
  beforeEach(() => {
    useGame.getState().newGame()
  })

  it('残骸 ≥10 万的战斗按经典概率凝聚月球，moonAt/切换器数据同步', () => {
    const coord = hardNpcCoord()
    const key = npcKey(coord)
    let moonCreated = false
    let lastDebris = 0
    for (let attempt = 0; attempt < 150 && !moonCreated; attempt++) {
      const s = useGame.getState()
      // 每轮换 gameTime → hash32(gameNow, totalDebris) 种子变化 → 概率独立采样
      useGame.setState({ gameTime: s.gameTime + 1000, lastWallTick: Date.now(), currentPlanet: s.planets[0].id })
      const st = useGame.getState()
      const home = st.planets.find((p) => p.isHome)!
      useGame.setState({ planets: st.planets.map((p) => (p.id === home.id ? { ...p, ships: { 204: 600 } } : p)) })
      const err = useGame.getState().dispatchMission(home.id, coord, 'attack', { 204: 600 }, { metal: 0, crystal: 0, deuterium: 0 })
      expect(err).toBeNull()
      // 回拨 lastWallTick → 单次 tick 把 gameNow 推进 200 游戏秒，覆盖 30 秒航程完成结算
      useGame.setState({ lastWallTick: Date.now() - 10_000, timeScale: 20 })
      useGame.getState().tick()
      const after = useGame.getState()
      const debris = after.debrisFields[key]
      lastDebris = debris ? Math.round(debris.metal + debris.crystal) : 0
      moonCreated = after.planets.some((p) => p.isMoon && p.coords.galaxy === coord.galaxy && p.coords.system === coord.system && p.coords.position === coord.position)
    }
    expect(lastDebris).toBeGreaterThanOrEqual(100000)
    expect(moonCreated).toBe(true)
    const final = useGame.getState()
    const moon = final.planets.find((p) => p.isMoon)!
    expect(moon.name).toContain('之月')
    // 月直径（经典口径）：3476-8944 km 区间
    expect(moon.moonDiameter).toBeGreaterThanOrEqual(3476)
    expect(moon.moonDiameter).toBeLessThanOrEqual(8944)
    // moonAt 查询（星系页月球信号/基地切换器共用）能找到它
    expect(moonAt(final.planets, coord)).toBeTruthy()
    // 残骸场保留（月球不吸走残骸）
    expect(final.debrisFields[key]).toBeTruthy()
  })
})
