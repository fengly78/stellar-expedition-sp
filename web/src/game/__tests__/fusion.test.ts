import { describe, expect, it } from 'vitest'
import { fusionFuelBurn, fusionOutput, planetProduction } from '../objects'

// 聚变电站（2026-09-25 内容缺口补齐）：电力重器 + 持续重氢燃耗。
// 断言三件事：发电计入 energyOut、燃耗从重氢净额扣除、无聚变时产出与旧口径一致。
const base = {
  // 太阳能 Lv3 保证满产（factor=1），使聚变的净效果可精确断言
  buildings: { 1: 0, 2: 0, 3: 3, 4: 3 } as Record<number, number>,
  temperatureMax: 25,
}

describe('聚变电站', () => {
  it('fusionOutput/fusionFuelBurn 基数与能源科技加成', () => {
    expect(fusionOutput(1, 0)).toBeCloseTo(66) // 60 × 1.1
    expect(fusionOutput(1, 5)).toBeCloseTo(66 * 1.25)
    expect(fusionFuelBurn(1)).toBeCloseTo(22) // 20 × 1.1
  })

  it('无聚变时 deuterium 为毛产量（燃耗 0）', () => {
    const p = planetProduction(base, {}, {})
    const withFusionOff = planetProduction({ ...base, buildings: { ...base.buildings, 12: 0 } }, {}, {})
    expect(p.deuterium).toBe(withFusionOff.deuterium)
  })

  it('聚变 Lv1：energyOut 增加 66，重氢净额扣减 22 燃耗', () => {
    const before = planetProduction(base, {}, {})
    const after = planetProduction({ ...base, buildings: { ...base.buildings, 12: 1 } }, {}, {})
    expect(after.energyOut - before.energyOut).toBeCloseTo(66)
    expect(before.deuterium - after.deuterium).toBeCloseTo(22)
  })
})
