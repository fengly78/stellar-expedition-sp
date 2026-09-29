import { describe, it, expect } from 'vitest'
import {
  SPEED,
  BUILDINGS,
  DEFENSE_FIELDS,
  productionFactor,
  metalProduction,
  crystalProduction,
  deuteriumProduction,
  solarOutput,
  satelliteEnergy,
  energyConsumption,
  withEnergyDeficit,
  storageCapacity,
  buildingCost,
  buildingTime,
  fleetSlots,
  colonyCap,
  maxFields,
  distance,
  flightTime,
  fuelConsumption,
  espionageReveal,
} from '../objects'

// objects.ts 经济/飞行/侦察核心公式的「真值」测试：
// 所有期望值均为手工核算（推导过程写在被测注释里），不是从实现抄回来的，
// 因此实现被改坏时这些断言会真实失败，而不是跟着实现一起漂移。
// SPEED 当前为 4；若调整 SPEED，带 SPEED 的期望值需同步重算。

describe('productionFactor — 产量骨架 L×1.1^L', () => {
  it('Lv0/Lv1/Lv2/Lv5 真值', () => {
    expect(productionFactor(0)).toBe(0) // 0 × 1.1^0
    expect(productionFactor(1)).toBeCloseTo(1.1, 10) // 1 × 1.1
    expect(productionFactor(2)).toBeCloseTo(2.42, 10) // 2 × 1.21
    expect(productionFactor(5)).toBeCloseTo(8.05255, 5) // 5 × 1.61051
  })
})

describe('资源产量（乘 SPEED=4）', () => {
  it('金属矿 Lv1 位置系数 1 → 220', () => {
    // 50 × 1.1 × 1 × 4
    expect(metalProduction(1)).toBeCloseTo(220, 10)
  })
  it('金属矿位置系数生效：Lv1 ×0.8 → 176', () => {
    expect(metalProduction(1, 0.8)).toBeCloseTo(176, 10)
  })
  it('晶体矿 Lv1 → 154', () => {
    // 35 × 1.1 × 4
    expect(crystalProduction(1)).toBeCloseTo(154, 10)
  })
  it('重氢 Lv1：温度系数 1.44−0.004·tempMax', () => {
    // tempMax=40 → kt=1.28 → 18×1.1×1.28×4 = 101.376
    expect(deuteriumProduction(1, 40)).toBeCloseTo(101.376, 3)
    // tempMax=0 → kt=1.44 → 18×1.1×1.44×4 = 114.048
    expect(deuteriumProduction(1, 0)).toBeCloseTo(114.048, 3)
    // 冷星球（tempMax 低）产量更高
    expect(deuteriumProduction(5, -20)).toBeGreaterThan(deuteriumProduction(5, 60))
  })
  it('Lv0 产量为 0', () => {
    expect(metalProduction(0)).toBe(0)
    expect(crystalProduction(0)).toBe(0)
    expect(deuteriumProduction(0, 40)).toBe(0)
  })
})

describe('能源（不乘 SPEED，R9-C8 量纲统一）', () => {
  it('太阳能 Lv1 tech0 → 44', () => {
    // 40 × 1.1 × (1+0) = 44，绝不能是 176（乘 SPEED 的旧 bug）
    expect(solarOutput(1, 0)).toBeCloseTo(44, 10)
  })
  it('能量科技每级 +5%：Lv1 tech10 → 66', () => {
    // 40 × 1.1 × 1.5
    expect(solarOutput(1, 10)).toBeCloseTo(66, 10)
  })
  it('太阳能 Lv2 tech0 → 96.8', () => {
    // 40 × 2.42
    expect(solarOutput(2, 0)).toBeCloseTo(96.8, 10)
  })
  it('卫星：count×(15+0.12·tempMax)', () => {
    // 10 × (15+6) = 210
    expect(satelliteEnergy(10, 50)).toBeCloseTo(210, 10)
    expect(satelliteEnergy(0, 50)).toBe(0)
  })
  it('耗电：矿 10×pf，重氢 20×pf', () => {
    expect(energyConsumption(1)).toBeCloseTo(11, 10) // 10×1.1
    expect(energyConsumption(1, true)).toBeCloseTo(22, 10) // 20×1.1
  })
})

describe('withEnergyDeficit — 能源不足减产', () => {
  it('供需比 ≥1 满产', () => {
    expect(withEnergyDeficit(100, 200, 100)).toBe(100)
    expect(withEnergyDeficit(100, 100, 100)).toBe(100)
  })
  it('供需比 0.5 → 产量减半', () => {
    expect(withEnergyDeficit(100, 50, 100)).toBe(50)
  })
  it('下限 0.2：供需比 0.1 → 按 0.2 减产', () => {
    expect(withEnergyDeficit(100, 5, 100)).toBe(20)
    expect(withEnergyDeficit(100, 0, 100)).toBe(20)
  })
  it('无耗电时不受发电影响', () => {
    expect(withEnergyDeficit(100, 0, 0)).toBe(100)
  })
})

describe('仓储/造价/建造时间', () => {
  it('storageCapacity = 10000×2^L', () => {
    expect(storageCapacity(0)).toBe(10000)
    expect(storageCapacity(1)).toBe(20000)
    expect(storageCapacity(5)).toBe(320000)
  })
  it('buildingCost = base×factor^currentLevel（金属矿 60/15/0, factor 1.5）', () => {
    const lv0 = buildingCost(BUILDINGS[1], 0)
    expect(lv0).toEqual({ metal: 60, crystal: 15, deuterium: 0 })
    const lv2 = buildingCost(BUILDINGS[1], 2)
    // 1.5^2 = 2.25 → 135 / 33.75 / 0
    expect(lv2.metal).toBeCloseTo(135, 10)
    expect(lv2.crystal).toBeCloseTo(33.75, 10)
    expect(lv2.deuterium).toBe(0)
  })
  it('buildingTime = base×factor^L / SPEED / (1+robotics)', () => {
    // 金属矿 baseTime 60：60/4 = 15
    expect(buildingTime(BUILDINGS[1], 0, 0)).toBeCloseTo(15, 10)
    // Lv2：60×1.5/4 = 22.5
    expect(buildingTime(BUILDINGS[1], 1, 0)).toBeCloseTo(22.5, 10)
    // 机器人 1 级再减半：60/4/2 = 7.5
    expect(buildingTime(BUILDINGS[1], 0, 1)).toBeCloseTo(7.5, 10)
  })
})

describe('舰队槽位与殖民上限（科技 108 天体物理学）', () => {
  it('fleetSlots = min(1+tech108, 5)', () => {
    expect(fleetSlots({})).toBe(1)
    expect(fleetSlots({ 108: 3 })).toBe(4)
    expect(fleetSlots({ 108: 99 })).toBe(5) // 封顶 5
  })
  it('colonyCap = 3+tech108（不封顶）', () => {
    expect(colonyCap({})).toBe(3)
    expect(colonyCap({ 108: 2 })).toBe(5)
  })
})

describe('星球格子', () => {
  it('行星：200 + 地形改造器(33)×15', () => {
    expect(maxFields({}, false)).toBe(200)
    expect(maxFields({ 33: 2 }, false)).toBe(230)
  })
  it('月球：1 + 月球基地(41)×30', () => {
    expect(maxFields({}, true)).toBe(1)
    expect(maxFields({ 41: 2 }, true)).toBe(61)
  })
  it('DEFENSE_FIELDS 八项占位（C2 按座占格）', () => {
    expect(Object.keys(DEFENSE_FIELDS).map(Number).sort((a, b) => a - b))
      .toEqual([401, 402, 403, 404, 405, 406, 407, 408])
    expect(DEFENSE_FIELDS[401]).toBe(1) // 火箭
    expect(DEFENSE_FIELDS[405]).toBe(3) // 高斯炮
    expect(DEFENSE_FIELDS[408]).toBe(10) // 大护盾罩
  })
})

describe('距离/航时/燃料', () => {
  const c = (galaxy: number, system: number, position: number) => ({ galaxy, system, position })

  it('distance 四档', () => {
    expect(distance(c(1, 1, 4), c(1, 1, 4))).toBe(5) // 同坐标
    expect(distance(c(1, 1, 4), c(1, 1, 7))).toBe(3005) // 同系 Δpos×1000+5
    expect(distance(c(1, 100, 4), c(1, 102, 4))).toBe(27190) // 同银河 27000+Δsys×95
    expect(distance(c(1, 1, 4), c(3, 1, 4))).toBe(2000000) // 跨银河 Δgal×10^6
  })
  it('flightTime = max(30, 60×dist/speed)', () => {
    expect(flightTime(5, 100)).toBe(30) // 下限 30 秒
    // 60×27190/5000 = 326.28
    expect(flightTime(27190, 5000)).toBeCloseTo(326.28, 2)
  })
  it('fuelConsumption = ceil(count×baseFuel×dist/35000)', () => {
    // ceil(10×20×3500/35000) = ceil(20) = 20
    expect(fuelConsumption(20, 10, 3500)).toBe(20)
    // 向上取整：ceil(1×1×1/35000) = 1
    expect(fuelConsumption(1, 1, 1)).toBe(1)
    // 整除不放大：ceil(1×100×350/35000) = ceil(1) = 1
    expect(fuelConsumption(100, 1, 350)).toBe(1)
  })
})

describe('espionageReveal — 侦察四档双轨（探针数 或 科技等级差）', () => {
  it('同级科技、探针数定档：2/3/5/7', () => {
    const r0 = espionageReveal(5, 5, 0)
    expect(r0).toEqual({ effective: 0, fleet: false, defense: false, resources: false, composition: false })
    const r2 = espionageReveal(5, 5, 2)
    expect(r2.fleet).toBe(true)
    expect(r2.defense).toBe(false)
    const r5 = espionageReveal(5, 5, 5)
    expect(r5.resources).toBe(true)
    expect(r5.composition).toBe(false)
    expect(espionageReveal(5, 5, 7).composition).toBe(true)
  })
  it('防守科技领先时探针被 gap² 抵扣', () => {
    // atk3 vs def5：gap=2，11 探针 → effective = 11−4 = 7 → 全档可见
    const r = espionageReveal(3, 5, 11)
    expect(r.effective).toBe(7)
    expect(r.composition).toBe(true)
    // atk3 vs def6：gap=3，9 探针 → effective = 9−9 = 0 → 全盲
    const blind = espionageReveal(3, 6, 9)
    expect(blind.effective).toBe(0)
    expect(blind.fleet).toBe(false)
  })
  it('攻击科技领先走等级轨：领先 1/2/3/4 级对应四档', () => {
    // atk6 vs def5：atk−1=5 ≥ def → fleet 可见；atk−2=4 < 5 → defense 不可见
    const r = espionageReveal(6, 5, 0)
    expect(r.fleet).toBe(true)
    expect(r.defense).toBe(false)
    // 领先 4 级全开
    const full = espionageReveal(9, 5, 0)
    expect(full.composition).toBe(true)
  })
})

describe('SPEED 常量锚点', () => {
  it('SPEED=4（改动须同步重算本文件全部带 SPEED 的期望值）', () => {
    expect(SPEED).toBe(4)
  })
})
