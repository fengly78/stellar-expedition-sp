import { describe, it, expect } from 'vitest'
import { BUILDINGS, solarOutput, researchTime, canResearch } from '../objects'

// R9 回归测试：守住 4 处公式修改，防未来回滚。
// 每个测试都对应一个 R9 fix + 文档注释，注释里有「why」，测试里只有「what」。
// 修改前请先读 R9 commit message + round9-tuning.md §1-§7。

describe('R9 回归 — 建筑/科技公式', () => {
  // C3：晶体矿 factor 从 1.6 软化为 1.5，对齐金属矿/重氢/电站，
  // 缓解「最需要的资源最难深挖」错配。
  it('C3 晶体矿 factor 应为 1.5（与金属矿/重氢/电站一致）', () => {
    expect(BUILDINGS[2].factor).toBe(1.5)
    expect(BUILDINGS[1].factor).toBe(1.5) // 金属
    expect(BUILDINGS[3].factor).toBe(1.5) // 重氢
    expect(BUILDINGS[4].factor).toBe(1.5) // 电站
  })

  // C8：能源量纲统一。发电走 40*prod*(1+0.05*energyTech)，
  // 不乘 SPEED；与耗电走同一骨架（每游戏小时）。
  // 旧实现发电乘 SPEED（×4），会得到 40*1.1*1*4 = 176。新实现 < 50。
  it('C8 太阳能发电不乘 SPEED（Lv1 energyTech=0 应 < 50）', () => {
    const s1 = solarOutput(1, 0)
    expect(s1).toBeGreaterThan(40) // productionFactor(1) > 1
    expect(s1).toBeLessThan(50) // 不乘 SPEED 4
    // 升级应增加
    expect(solarOutput(10, 5)).toBeGreaterThan(s1)
    // energyTech 应有正向影响
    expect(solarOutput(5, 10)).toBeGreaterThan(solarOutput(5, 0))
  })

  // C1：研究时间改用 cost^0.3 软化指数，下限 5 秒，
  // 旧实现高等级科技研究时间近 0（Lv.20 武器技术 ~11 秒）。
  it('C1 研究时间应随 cost^0.3 增长，下限 5 秒', () => {
    // 假想 tech：cost {1000, 500, 0}, factor 2, baseTime 0
    const fakeTech = { id: 999, name: 'fake', nameEn: 'fake', cost: { metal: 1000, crystal: 500, deuterium: 0 }, factor: 2, baseTime: 0, requires: {}, maxLevel: 0 }
    const t0 = researchTime(fakeTech, 0, 1)
    const t10 = researchTime(fakeTech, 10, 1)
    const t20 = researchTime(fakeTech, 20, 1)
    expect(t0).toBeGreaterThanOrEqual(5)
    expect(t10).toBeGreaterThan(t0)
    expect(t20).toBeGreaterThan(t10)
    // 旧 bug 症状：Lv.20 应该数小时级别，不应 < 60 秒
    expect(t20).toBeGreaterThan(60)
  })

  // 守卫 canResearch：实验室等级 > 科技等级。
  it('canResearch 守卫：实验室等级必须 > 科技等级', () => {
    expect(canResearch(3, 4)).toBe(true)
    expect(canResearch(3, 3)).toBe(false)
    expect(canResearch(3, 2)).toBe(false)
  })
})