import { describe, it, expect } from 'vitest'
import { counterattackFleet, npcRegen, pirateFleet, type NpcPlanet } from '../npc'

// R9 回归测试 — C4 NPC 资源再生速率。
// R9 fix：再生速率从 400/1000/1600 翻倍到 800/2000/3200 每游戏小时。
// 旧速率下掠夺收益 12h 后只占矿产的 3.8%，整条掠夺循环失去动机。

function mockNpc(system: number, lastRegen: number): NpcPlanet {
  return {
    name: 'test-npc',
    coords: { galaxy: 1, system, position: 1 },
    fleet: {},
    defenses: {},
    resources: { metal: 0, crystal: 0, deuterium: 0 },
    activity: 'inactive',
    lastRegen,
  }
}

describe('R9 回归 — C4 NPC 资源再生', () => {
  // sanity：12h 再生量应 > 旧速率下同期再生量 ×2
  it('C4 12h 再生量 ≥ 旧速率 2×', () => {
    const npc = mockNpc(8, 0) // system 8 → difficulty 1
    npcRegen(npc, 12 * 3600 * 1000) // 12 小时
    // 难度 1: rate = (800 + 1*1200) / 3600000 per ms
    //        12h 应再生 ~2000 每资源
    expect(npc.resources.metal).toBeGreaterThanOrEqual(2000 * 0.95) // 容差 5%
    expect(npc.resources.crystal).toBeGreaterThanOrEqual(2000 * 0.95)
  })

  // 三难度档位：800 / 2000 / 3200
  it('C4 三难度再生速率分别为 800/2000/3200 每小时', () => {
    const easy = mockNpc(3, 0) // system <= 7 → difficulty 0
    const mid = mockNpc(10, 0) // system 8-12 → difficulty 1
    const hard = mockNpc(15, 0) // system > 12 → difficulty 2
    npcRegen(easy, 3600 * 1000) // 1 小时
    npcRegen(mid, 3600 * 1000)
    npcRegen(hard, 3600 * 1000)
    // 容差 5%
    expect(easy.resources.metal).toBeGreaterThanOrEqual(800 * 0.95)
    expect(mid.resources.metal).toBeGreaterThanOrEqual(2000 * 0.95)
    expect(hard.resources.metal).toBeGreaterThanOrEqual(3200 * 0.95)
  })

  // lastRegen 更新：每次调用后必须推进到 gameNow
  it('C4 lastRegen 应推进到 gameNow', () => {
    const npc = mockNpc(10, 0)
    npcRegen(npc, 5000)
    expect(npc.lastRegen).toBe(5000)
    npcRegen(npc, 10000)
    expect(npc.lastRegen).toBe(10000)
  })
})

// R10 回归 — C8 PRNG seed 化（half-seeded bug fix）
// ponytail: 仅修复 npc.ts:166/180，剩余 17 callsites（battle.ts:3 + BattleReplay.tsx:2 + state.ts:11 + 2 cosmetic 跳过）
//          推到下轮 R10 实施 commit。lint rule（no-restricted-syntax 禁 Math.random in game/）同步推。

describe('R10 回归 — PRNG seed 化 (half-seeded bug fix)', () => {
  it('counterattackFleet 同 coords → 同 fleet（replay determinism）', () => {
    const c = { galaxy: 1, system: 5, position: 3 }
    const f1 = counterattackFleet(c, 1)
    const f2 = counterattackFleet(c, 1)
    expect(f1).toEqual(f2)
  })

  it('counterattackFleet 不同 coords → 不同 fleet（仍随机）', () => {
    // 同档坐标种子可能合法碰撞（舍入后同规模），跨档采样只要有一对不同即可
    const fleets = new Set(
      [3, 5, 8, 11, 15, 18].map((system) => JSON.stringify(counterattackFleet({ galaxy: 1, system, position: 3 }, 1))),
    )
    expect(fleets.size).toBeGreaterThan(1)
  })

  it('counterattackFleet 同 coords + 同 mul → 同 fleet', () => {
    const c = { galaxy: 1, system: 8, position: 1 }
    const f1 = counterattackFleet(c, 2)
    const f2 = counterattackFleet(c, 2)
    expect(f1).toEqual(f2)
  })

  it('pirateFleet 同 strength → 同 fleet（fresh-seed fix）', () => {
    const f1 = pirateFleet(5)
    const f2 = pirateFleet(5)
    expect(f1).toEqual(f2)
  })

  it('pirateFleet 不同 strength → 不同 fleet（仍随机）', () => {
    const a = pirateFleet(5)
    const b = pirateFleet(10)
    expect(a).not.toEqual(b)
  })
})