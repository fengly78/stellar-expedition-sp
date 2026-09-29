import { describe, expect, it } from 'vitest'
import { generateNpc, npcDynamicGrowth, type NpcPlanet } from '../npc'
import { SHIPS } from '../objects'

// NPC 动态成长（2026-09-27，机制对照 ogame-vue-ts npcGrowthLogic 的分段实力比例）
const shipCostMap: Record<number, { metal: number; crystal: number; deuterium: number }> = {}
for (const sid in SHIPS) shipCostMap[+sid] = SHIPS[+sid].cost

function npcAt(system = 15): NpcPlanet | null {
  return generateNpc(1, system, 4)
}

function fleetValue(fleet: Record<number, number>): number {
  let v = 0
  for (const id in fleet) {
    const c = shipCostMap[+id]
    if (c) v += (c.metal + c.crystal + c.deuterium) * fleet[+id]
  }
  return v / 1000
}

describe('NPC 动态成长（vue-ts 对齐）', () => {
  it('新手期（<1000 分）不成长——教程保护', () => {
    const npc = npcAt()!
    const before = { ...npc.fleet }
    npcDynamicGrowth(npc, 500, 100 * 3600000, shipCostMap)
    expect(npc.fleet).toEqual(before)
  })

  it('中期（5k 分）：时间推进到新档位时获得轻战+重战增援', () => {
    const npc = npcAt()!
    npc.growthStage = 0
    // difficulty=2 → interval 4h；gameNow=9h → stage=2
    npcDynamicGrowth(npc, 5000, 9 * 3600000, shipCostMap)
    expect(npc.growthStage).toBe(2)
    expect((npc.fleet[204] ?? 0)).toBeGreaterThanOrEqual(2)
    expect((npc.fleet[205] ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('后期（≥20k 分）：增援含巡洋舰', () => {
    const npc = npcAt()!
    npc.growthStage = 0
    npcDynamicGrowth(npc, 25000, 5 * 3600000, shipCostMap)
    expect((npc.fleet[204] ?? 0)).toBeGreaterThan(0)
    // 巡洋舰按 rng 概率出现——给足档位数，至少一档出巡洋
    let sawCruiser = false
    for (let stage = 1; stage <= 8 && !sawCruiser; stage++) {
      npcDynamicGrowth(npc, 25000, (stage * 4 + 1) * 3600000, shipCostMap)
      sawCruiser = (npc.fleet[206] ?? 0) > 0
    }
    expect(sawCruiser).toBe(true)
  })

  it('实力封顶：NPC 舰队造价超过玩家积分×档位比例后不再增援', () => {
    const npc = npcAt()!
    // 直接把 NPC 堆到远超 5k 分×0.8 上限
    npc.fleet = { 204: 5000 }
    npc.growthStage = 0
    const before = { ...npc.fleet }
    npcDynamicGrowth(npc, 5000, 99 * 3600000, shipCostMap)
    expect(fleetValue(npc.fleet)).toBeGreaterThan(5000 * 0.8)
    expect(npc.fleet).toEqual(before)
  })

  it('幂等：同一时间档重复调用不叠加', () => {
    const npc = npcAt()!
    npc.growthStage = 0
    npcDynamicGrowth(npc, 5000, 9 * 3600000, shipCostMap)
    const snapshot = { ...npc.fleet }
    npcDynamicGrowth(npc, 5000, 9 * 3600000, shipCostMap)
    expect(npc.fleet).toEqual(snapshot)
  })

  it('被清剿（wiped）的 NPC 不被 growth 回填——24h 重生管线不被架空', () => {
    const npc = npcAt()!
    npc.fleet = {}
    npc.defenses = {}
    npc.respawnAt = 100 * 3600000 // 已在重生等待期
    npcDynamicGrowth(npc, 25000, 99 * 3600000, shipCostMap)
    expect(Object.keys(npc.fleet)).toEqual([])
    expect(npc.respawnAt).toBe(100 * 3600000)
    // stage 已对齐：重生后不会补发等待期的成长档
    expect(npc.growthStage).toBeGreaterThan(0)
  })
})
