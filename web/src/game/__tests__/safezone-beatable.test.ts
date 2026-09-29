import { describe, expect, it } from 'vitest'
import { generateNpc } from '../npc'
import { runSimulation } from '../battleSim'

// 新手首战可胜性回归（2026-09-25 试玩修复）：
// 教程补给后玩家首支作战小队约为 3 架轻战（自造 1 + 步骤 9 奖励 2）。
// 安全区（系统 1-9，含母星所在系统 8）NPC 必须能被这支小队零损击败，
// 否则教程步骤 12「初战告捷」与成就「首胜」不可达。
// 曾因安全区分档只到系统 5 + NPC 3-10 架轻战，导致第一仗必然全灭。
describe('安全区 NPC 新手可胜性', () => {
  it('系统 1-9 的 NPC 只有 1-2 架轻战（无重战）', () => {
    for (let system = 1; system <= 9; system++) {
      for (const position of [4, 9]) {
        const npc = generateNpc(1, system, position)
        if (!npc) continue
        expect(npc.fleet[204] ?? 0).toBeLessThanOrEqual(2)
        expect(npc.fleet[205] ?? 0).toBe(0)
        expect(npc.fleet[206] ?? 0).toBe(0)
      }
    }
  })

  it('3 架轻战能零损打赢每一个安全区 NPC', () => {
    let checked = 0
    for (let system = 1; system <= 9; system++) {
      for (const position of [4, 9]) {
        const npc = generateNpc(1, system, position)
        if (!npc) continue
        const fleet: Record<number, number> = {}
        for (const [id, n] of Object.entries(npc.fleet)) fleet[+id] = n
        if (Object.keys(fleet).length === 0) continue
        const result = runSimulation({ 204: 3 }, fleet)
        expect(result.outcome).toBe('attacker-win')
        expect(Object.values(result.attackerLosses).reduce((sum, n) => sum + n, 0)).toBe(0)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(5)
  })
})
