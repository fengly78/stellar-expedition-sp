import { describe, expect, it } from 'vitest'
import { SHIPS, TECHS, shipSpec, shipSpeed } from '../objects'

// 2026-09-27 上游对齐批次回归：新增三舰（215 战列巡航舰/213 毁灭者/218 收割者，
// 数值 1:1 取自 ogamex MilitaryShipObjects）+ 超空间科技 114 + 超空间引擎 118。
describe('上游对齐：超空间舰船与科技', () => {
  it('三艘新舰数值与 ogamex 一致（造价/四维/引擎/货舱）', () => {
    expect(SHIPS[215]).toMatchObject({ name: '战列巡航舰', attack: 700, shield: 400, hull: 7000, speed: 10000, cargo: 750, fuel: 250, engine: 'hyper', cost: { metal: 30000, crystal: 40000, deuterium: 15000 } })
    expect(SHIPS[213]).toMatchObject({ name: '毁灭者', attack: 2000, shield: 500, hull: 11000, speed: 5000, cargo: 2000, fuel: 1000, engine: 'hyper', cost: { metal: 60000, crystal: 50000, deuterium: 15000 } })
    expect(SHIPS[218]).toMatchObject({ name: '收割者', attack: 2800, shield: 700, hull: 14000, speed: 7000, cargo: 10000, fuel: 1100, engine: 'hyper', cost: { metal: 85000, crystal: 55000, deuterium: 20000 } })
  })

  it('速射表对齐：战列巡航舰克制战列舰×7、毁灭者克轻激光×10、收割者克轻战×4', () => {
    expect(SHIPS[215].rapidfire[207]).toBe(7)
    expect(SHIPS[213].rapidfire[402]).toBe(10)
    expect(SHIPS[218].rapidfire[204]).toBe(4)
    expect(SHIPS[213].rapidfire[215]).toBe(2)
  })

  it('前置链：超空间引擎需 超空间技术3+实验室7；战列巡航舰需 引擎5+超空5+激光12', () => {
    expect(TECHS[118].requires).toEqual({ 31: 7, 114: 3 })
    expect(TECHS[114].requires).toEqual({ 31: 7, 113: 5, 110: 5 })
    expect(SHIPS[215].requires).toMatchObject({ 21: 8, 118: 5, 114: 5, 120: 12 })
  })

  it('超空间引擎舰速 +30%/级（经典三档：燃烧10/脉冲20/超空30）', () => {
    expect(shipSpeed(215, {})).toBe(10000)
    expect(shipSpeed(215, { 118: 3 })).toBe(10000 * 1.9)
    // 老舰不受超空引擎影响
    expect(shipSpeed(204, { 118: 5 })).toBe(12500)
  })

  it('战斗属性接入：武器/护盾/装甲科技对三新舰同样生效', () => {
    const base = shipSpec(213, {})
    const boosted = shipSpec(213, { 109: 5, 110: 5, 111: 5 })
    expect(boosted.attack).toBeCloseTo(base.attack * 1.5)
    expect(boosted.shield).toBeCloseTo(base.shield * 1.5)
    expect(boosted.hull).toBeCloseTo(base.hull * 1.5)
  })
})
