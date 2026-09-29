import { describe, expect, it } from 'vitest'
import { depositEfficiency, depositPercentage, initialDeposits, settleDeposits } from '../oreDeposit'
import { planetProduction, planetProductionForPlanet } from '../objects'

// 矿脉储量系统（CR-2026-09-27-ORE 决策 A 已批，1/50 降参数档）
describe('矿脉储量（决策 A）', () => {
  it('初始储量：位置差异化（内圈晶体富 / 外圈重氢富）+ 确定性（同坐标同结果）', () => {
    const inner = initialDeposits({ galaxy: 1, system: 8, position: 2 })
    const outer = initialDeposits({ galaxy: 1, system: 8, position: 14 })
    const innerAgain = initialDeposits({ galaxy: 1, system: 8, position: 2 })
    expect(inner).toEqual(innerAgain) // 确定性
    // 内圈晶体系数 1.25 vs 外圈 0.75 → 明显更富（浮动 ±20% 内仍成立）
    expect(inner.crystal).toBeGreaterThan(outer.crystal * 1.4)
    expect(outer.deuterium).toBeGreaterThan(inner.deuterium * 1.4)
    // 量级：1 亿基础 × 系数 ± 20%
    expect(inner.metal).toBeGreaterThan(60_000_000)
    expect(inner.metal).toBeLessThan(130_000_000)
  })

  it('效率曲线：≥5% 满效率；耗尽保底 20%；其间线性', () => {
    const init = { metal: 100, crystal: 100, deuterium: 100 }
    expect(depositEfficiency({ metal: 100, crystal: 100, deuterium: 100 }, init, 'metal')).toBe(1)
    expect(depositEfficiency({ metal: 5, crystal: 100, deuterium: 100 }, init, 'metal')).toBe(1)
    expect(depositEfficiency({ metal: 0, crystal: 100, deuterium: 100 }, init, 'metal')).toBeCloseTo(0.2)
    // 2.5%（半程）→ 0.2 + 0.8×0.5 = 0.6
    expect(depositEfficiency({ metal: 2.5, crystal: 100, deuterium: 100 }, init, 'metal')).toBeCloseTo(0.6)
    // 老档/无数据 → 恒满效率
    expect(depositEfficiency(undefined, init, 'metal')).toBe(1)
  })

  it('结算：消耗 + 再生 1%/h，钳制在 [0, 初始]', () => {
    const init = initialDeposits({ galaxy: 1, system: 8, position: 7 })
    // 从半储量起（满储量会被上限钳回，无法观察净变化）
    const deposits = { metal: init.metal / 2, crystal: init.crystal / 2, deuterium: init.deuterium / 2 }
    const after = settleDeposits(deposits, init, { metal: 1000, crystal: 0, deuterium: 0 }, 3600000)
    expect(after.metal).toBeCloseTo(deposits.metal - 1000 + init.metal * 0.01, -3)
    // 空储量仅靠再生回填 1%/h；0 产量时不超初始
    const drained = settleDeposits({ metal: 0, crystal: 0, deuterium: 0 }, init, { metal: 0, crystal: 0, deuterium: 0 }, 3600000)
    expect(drained.metal).toBeCloseTo(init.metal * 0.01, -3)
    const overflow = settleDeposits({ ...init }, init, { metal: 0, crystal: 0, deuterium: 0 }, 3600000)
    expect(overflow.metal).toBeLessThanOrEqual(init.metal)
  })

  it('planetProduction 接入：矿脉低于 5% 后产量打折；不传 oreInitial 保持旧调用兼容', () => {
    const base = { buildings: { 1: 20, 4: 30 } as Record<number, number>, temperatureMax: 25 }
    const init = initialDeposits({ galaxy: 1, system: 8, position: 7 })
    const full = planetProduction({ ...base, oreDeposits: { ...init } }, {}, { oreInitial: init })
    const drained = planetProduction({ ...base, oreDeposits: { metal: 0, crystal: 0, deuterium: 0 } }, {}, { oreInitial: init })
    expect(drained.metal).toBeCloseTo(full.metal * 0.2, -2)
    expect(drained.crystal).toBeCloseTo(full.crystal * 0.2, -2)
    // 不传 oreInitial 的旧调用方：恒满效率
    const compat = planetProduction({ ...base, oreDeposits: { metal: 0, crystal: 0, deuterium: 0 } }, {}, {})
    expect(compat.metal).toBeCloseTo(full.metal, -2)
  })

  it('depositPercentage：UI 比例正确', () => {
    const init = { metal: 200, crystal: 100, deuterium: 100 }
    expect(depositPercentage({ metal: 100, crystal: 50, deuterium: 0 }, init, 'metal')).toBeCloseTo(0.5)
    expect(depositPercentage(undefined, init, 'metal')).toBe(1)
  })

  it('星球界面产量与结算矿脉口径一致，旧档仍兼容', () => {
    const coords = { galaxy: 1, system: 8, position: 7 }
    const base = { coords, buildings: { 1: 20, 4: 30 }, temperatureMax: 25 }
    const depleted = { ...base, oreDeposits: { metal: 0, crystal: 0, deuterium: 0 } }
    const full = planetProduction(base, {})
    const shown = planetProductionForPlanet(depleted, {})
    expect(shown.metal).toBeCloseTo(full.metal * 0.2, -2)
    expect(planetProductionForPlanet(base, {}).metal).toBeCloseTo(full.metal, -2)
  })
})
