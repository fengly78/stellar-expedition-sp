import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * espionage / attack / missile 的跨 tick 守恒（2026-09-28）
 *
 * 补齐最后一组 mission 路径的到达侧验证。前序已覆盖：
 *   transport（273fcc1 修）/ deploy（3a1da6b 修）/ colonize / recycle / expedition
 * 本文件覆盖 espionage、attack（含 NPC 与玩家星球两种目标）、missile。
 *
 * 关注点：探测器消耗、舰船战斗损耗、导弹消耗、报告生成、mission 清理。
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

function tick(times = 8) {
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

function give(ships: Record<number, number>, extra: Record<string, unknown> = {}) {
  const st = useGame.getState()
  useGame.setState({
    techs: { ...st.techs, 115: 1, 117: 1, ...(extra.techs as Record<number, number> | undefined) },
    planets: st.planets.map((p) =>
      p.isHome
        ? {
            ...p,
            ships: { ...ships },
            resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 },
            defenses: { ...(extra.defenses as Record<number, number> | undefined) },
            buildings: { ...p.buildings, ...(extra.buildings as Record<number, number> | undefined) },
          }
        : p,
    ),
  })
}

const countShip = (id: number) =>
  useGame.getState().planets.reduce((sum, p) => sum + (p.ships[id] ?? 0), 0)

/** NPC 预生成在 4 / 9 号位（NPC_POSITIONS = [4, 9]），母星在 3 号 */
const NPC_TARGET = { galaxy: 1, system: 8, position: 4 }

describe('espionage 跨 tick 守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('侦察：派出扣探测器、到达后 mission 清理、生成侦察报告', () => {
    const id = home().id
    give({ 210: 5 })
    settleTutorial()
    const before = countShip(210)
    const beforeReports = useGame.getState().reports.length

    expect(
      useGame.getState().dispatchMission(id, NPC_TARGET, 'espionage', { 210: 2 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toBeNull()
    expect(countShip(210), '派出后未扣探测器').toBe(before - 2)

    tick(12)
    expect(useGame.getState().missions.length, '侦察 mission 未清理').toBe(0)
    // 探测器可能因反侦察损失，但不能全灭（目标驻军规模有限）
    expect(countShip(210), '侦察后探测器全灭').toBeGreaterThan(0)
    expect(
      useGame.getState().reports.length,
      '侦察任务未生成报告',
    ).toBeGreaterThan(beforeReports)
  })

  it('侦察任务必须带探测器（210）', () => {
    const id = home().id
    give({ 204: 5 })
    expect(
      useGame.getState().dispatchMission(id, NPC_TARGET, 'espionage', { 204: 1 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toMatch(/探测器/)
  })
})

describe('attack 跨 tick 守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('攻击 NPC：产生战斗、mission 清理、舰船只减不增', () => {
    const id = home().id
    // 新手保护期内不能打玩家星球，但可以打 NPC（NPC 不在 s.planets 里）
    give({ 204: 20 })
    settleTutorial()
    const before = countShip(204)
    const beforeBattles = useGame.getState().stats.battlesTotal

    expect(
      useGame.getState().dispatchMission(id, NPC_TARGET, 'attack', { 204: 10 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toBeNull()
    expect(countShip(204), '派出后未扣舰船').toBe(before - 10)

    tick(14)
    expect(useGame.getState().missions.length, '攻击 mission 未清理').toBe(0)
    // 战损守恒：母星最终 = 出击前 - 损失。幸存舰会随返航回到母星，
    // 所以母星数可以高于「出击前 - 10」，但**不可能超过出击前的总数**。
    const after = countShip(204)
    expect(after, '攻击后 204 总数超过出击前（凭空生舰）').toBeLessThanOrEqual(before)
    expect(after, '攻击后 204 总数低于 0').toBeGreaterThanOrEqual(0)
    const s = useGame.getState()
    expect(
      s.stats.battlesTotal,
      '攻击未计入战斗统计',
    ).toBeGreaterThan(beforeBattles)
  })

  it('攻击产生战斗报告', () => {
    const id = home().id
    give({ 204: 20 })
    settleTutorial()
    const beforeReports = useGame.getState().reports.filter((r) => r.kind === 'battle').length
    useGame.getState().dispatchMission(id, NPC_TARGET, 'attack', { 204: 10 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    tick(14)
    expect(
      useGame.getState().reports.filter((r) => r.kind === 'battle').length,
      '攻击未生成战斗报告',
    ).toBeGreaterThan(beforeReports)
  })

  it('新手保护期内不能攻击玩家星球', () => {
    const id = home().id
    give({ 204: 5 })
    // createdWallAt = 现在 -> 保护期生效；目标是自己的母星坐标
    const me = home().coords
    expect(
      useGame.getState().dispatchMission(id, me, 'attack', { 204: 1 }, {
        metal: 0, crystal: 0, deuterium: 0,
      }),
    ).toMatch(/新手保护/)
  })

  /**
   * NPC 反击舰队的新手保护（2026-09-28 修复，state.ts 反击分支）
   *
   * 玩家在保护期内打 NPC 是允许的（保护只约束「打玩家星球」）。但打赢之后
   * 有 25% 概率触发 NPC 反击，原先该分支不查保护，于是新开局玩家会被自己
   * 刚打赢的战斗反手打母星——与 isNewbieShieldActive 声明的
   * 「期间任何一方都不能攻击或探测玩家的星球」直接矛盾。
   *
   * 为什么用源码守卫而不是「打一场仗然后断言没有反击舰队」：
   * 反击是 25% 概率（mulberry32(hash32(gameNow, m.id, 0x5000))() < 0.25），
   * 且 gameNow 由 tick 步长余数决定、战斗胜负本身也随机。实测：固定到达
   * 时刻后同一断言仍在漏洞版本上 8/8 全绿——那是一条会骗人的门禁。
   * 概率路径无法给出确定性门禁，故改为断言守卫本身（与 slot-constants
   * 等既有门禁同一手法）：npcOwned 是有且仅有这两个产出点，二者都必须查保护。
   */
  it('所有产出 npcOwned 任务的分支都必须受新手保护约束', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/game/state.ts'), 'utf8').split('\n')
    // grep originId: -1 -> 仅两处能产出 npcOwned 任务
    const sites: number[] = []
    src.forEach((line, i) => {
      if (line.includes('originId: -1')) sites.push(i)
    })
    expect(sites.length, 'npcOwned 产出点数量变化，请同步本门禁').toBe(2)
    // 每处向上回溯 18 行，找该分支的条件判断，必须含新手保护判断
    for (const site of sites) {
      const window = src.slice(Math.max(0, site - 18), site + 1).join('\n')
      expect(
        window,
        `state.ts:${site + 1} 的 npcOwned 产出点缺少新手保护判断（isNewbieShieldActive）`,
      ).toMatch(/isNewbieShieldActive/)
    }
  })

  it('保护期外反击舰队目标仍是玩家星球（守住既有语义）', () => {
    const id = home().id
    give({ 204: 60, 205: 40, 206: 20 })
    settleTutorial()
    // 保护期已过
    useGame.setState({ createdWallAt: Date.now() - 30 * 24 * 3600 * 1000 })
    useGame.getState().dispatchMission(id, NPC_TARGET, 'attack', { 204: 40, 205: 20 }, {
      metal: 0, crystal: 0, deuterium: 0,
    })
    tick(14)
    const s = useGame.getState()
    for (const m of s.missions.filter((x) => x.npcOwned)) {
      const isPlayer = s.planets.some(
        (p) => p.coords.galaxy === m.to.galaxy && p.coords.system === m.to.system && p.coords.position === m.to.position,
      )
      expect(isPlayer, '保护期外的 NPC 反击目标不是玩家星球（路径语义已变）').toBe(true)
    }
  })
})

describe('missile 跨 tick 守恒', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('发射导弹：消耗 502、mission 清理、统计累加', () => {
    const id = home().id
    const created = Date.now() - 30 * 24 * 3600 * 1000 // 保护期已过
    const st = useGame.getState()
    useGame.setState({
      createdWallAt: created,
      techs: { ...st.techs, 117: 1 },
      planets: st.planets.map((p) =>
        p.isHome
          ? {
              ...p,
              buildings: { ...p.buildings, 44: 4, 21: 1, 14: 1 },
              defenses: { 502: 10 },
              resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 },
            }
          : p,
      ),
    })
    settleTutorial()
    const beforeFired = useGame.getState().stats.missilesFired

    expect(
      useGame.getState().dispatchMissiles(id, NPC_TARGET, 3),
    ).toBeNull()
    expect(home().defenses[502] ?? 0, '发射后未扣导弹').toBe(7)

    tick(12)
    expect(useGame.getState().missions.length, '导弹 mission 未清理').toBe(0)
    expect(
      useGame.getState().stats.missilesFired,
      '导弹统计未累加',
    ).toBeGreaterThan(beforeFired)
  })

  it('连续 tick 后导弹数不继续减少（防重复消耗）', () => {
    const id = home().id
    const created = Date.now() - 30 * 24 * 3600 * 1000
    const st = useGame.getState()
    useGame.setState({
      createdWallAt: created,
      techs: { ...st.techs, 117: 1 },
      planets: st.planets.map((p) =>
        p.isHome
          ? {
              ...p,
              buildings: { ...p.buildings, 44: 4 },
              defenses: { 502: 10 },
              resources: { metal: 1e6, crystal: 1e6, deuterium: 1e6 },
            }
          : p,
      ),
    })
    settleTutorial()
    useGame.getState().dispatchMissiles(id, NPC_TARGET, 3)
    tick(12)
    const afterFirst = home().defenses[502] ?? 0
    for (let i = 0; i < 6; i++) tick(1)
    expect(home().defenses[502] ?? 0, '导弹数在后续 tick 中继续减少').toBe(afterFirst)
  })
})
