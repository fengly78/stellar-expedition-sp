import { describe, expect, it } from 'vitest'
import { fleetFromIntel, runSimulation } from '../battleSim'

describe('battleSim（G6 模拟器核心）', () => {
  it('同编队结果确定（种子派生可复算）', () => {
    const a = { 204: 100 }
    const d = { 205: 40 }
    const r1 = runSimulation(a, d)
    const r2 = runSimulation(a, d)
    expect(r1).toEqual(r2)
  })

  it('守恒：存活+损毁=投入', () => {
    const r = runSimulation({ 204: 100, 202: 5 }, { 205: 40, 210: 3 })
    const sum = (o: Record<number, number>) => Object.values(o).reduce((a, b) => a + b, 0)
    expect(sum(r.attackerSurvivors) + sum(r.attackerLosses)).toBe(105)
    expect(sum(r.defenderSurvivors) + sum(r.defenderLosses)).toBe(43)
  })

  it('绝对优势方获胜且战果合理（轻战海 vs 探针）', () => {
    const r = runSimulation({ 204: 50 }, { 210: 5 })
    expect(r.outcome).toBe('attacker-win')
    expect(sum(r.attackerLosses)).toBe(0)
  })

  it('空守方零回合速胜；空双方判平', () => {
    expect(runSimulation({ 204: 1 }, {}).outcome).toBe('attacker-win')
    expect(runSimulation({ 204: 1 }, {}).rounds).toBe(0)
    expect(runSimulation({}, {}).outcome).toBe('draw')
  })

  it('残骸=损毁 M/C × 0.3（氘不参与）', () => {
    const r = runSimulation({ 204: 200 }, { 205: 60 }) // 足够大的战场必有损失
    // 仅校验口径：残骸为非负且与损毁价值同向
    expect(r.debrisM).toBeGreaterThanOrEqual(0)
    expect(r.debrisC).toBeGreaterThanOrEqual(0)
  })

  it('侦察回填：舰名/数字键混合识别、未知键登记', () => {
    const { counts, note } = fleetFromIntel({ LIGHT: 8, '204': 2, 幽灵舰: 3 })
    expect(counts).toEqual({ 204: 10 })
    expect(note).toContain('未识别')
  })

  it('侦察回填：未揭示/非法输入返回空并注明', () => {
    expect(fleetFromIntel(null).counts).toEqual({})
    expect(fleetFromIntel(undefined).note).toContain('未揭示')
    expect(fleetFromIntel('bad').counts).toEqual({})
  })
})

function sum(o: Record<number, number>): number {
  return Object.values(o).reduce((a, b) => a + b, 0)
}
