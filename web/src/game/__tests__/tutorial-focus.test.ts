import { describe, expect, it } from 'vitest'
import { TUTORIAL_STEPS } from '../tutorial'
import { BUILDINGS, TECHS, SHIPS } from '../objects'

// 回归：教程步骤 focus 字段（2026-09-28 试玩发现 P1）
//
// 缺陷：Overview 页「选中建筑」卡默认选中 14（机器人工厂），而教程第 1 步教的是
// 金属矿。引导条说 A、详情卡默认 B，新手开局第一步就撞上方向割裂。
// 修复：教程步骤带 focus 字段，Overview 未手动选择时跟随当前步骤的 focus 建筑。
//
// 本测试锁住 focus 字段本身的契约——id 有效、不指向未实现对象、覆盖所有
// buildings 类步骤。UI 层依赖由 page-render.test.ts 覆盖。

describe('教程步骤 focus 字段', () => {
  it('第 1 步 focus 指向金属矿（与 hint 一致）', () => {
    const step1 = TUTORIAL_STEPS.find((s) => s.id === 1)!
    expect(step1.focus).toBe(1)
    expect(BUILDINGS[step1.focus!]).toBeDefined()
    // hint 文案提到金属矿，focus 必须与之一致
    expect(step1.hint).toContain('金属矿')
  })

  it('所有 focus 均指向已实现的建筑（无悬空 id）', () => {
    for (const step of TUTORIAL_STEPS) {
      if (step.focus === undefined) continue
      expect(BUILDINGS[step.focus], `step ${step.id} focus=${step.focus} 不在 BUILDINGS 表`).toBeDefined()
    }
  })

  it('所有 buildings 类步骤都有 focus', () => {
    for (const step of TUTORIAL_STEPS) {
      if (step.tab !== 'buildings') continue
      expect(step.focus, `step ${step.id}（${step.title}）是 buildings 步骤但没有 focus`).toBeDefined()
    }
  })

  it('非 buildings 步骤不声明 focus（避免误导 UI 跳建筑页）', () => {
    for (const step of TUTORIAL_STEPS) {
      if (step.tab === 'buildings') continue
      expect(step.focus, `step ${step.id} tab=${step.tab} 不应声明 focus`).toBeUndefined()
    }
  })

  it('focus 覆盖教程前 8 步的建造顺序（矿→电→晶→仓→机器人→实验室→船坞）', () => {
    const byId = new Map(TUTORIAL_STEPS.map((s) => [s.id, s]))
    expect(byId.get(1)!.focus).toBe(1) // 金属矿
    expect(byId.get(2)!.focus).toBe(4) // 太阳能电站
    expect(byId.get(3)!.focus).toBe(2) // 晶体矿
    expect(byId.get(4)!.focus).toBe(22) // 金属仓库
    expect(byId.get(5)!.focus).toBe(14) // 机器人工厂
    expect(byId.get(6)!.focus).toBe(31) // 研究实验室
    expect(byId.get(8)!.focus).toBe(21) // 船坞
  })

  it('focus 不指向科技或舰船（Overview 详情卡只渲染建筑）', () => {
    for (const step of TUTORIAL_STEPS) {
      if (step.focus === undefined) continue
      const inTech = TECHS[step.focus] !== undefined
      const inShip = SHIPS[step.focus] !== undefined
      expect(inTech, `step ${step.id} focus 撞上 TECHS`).toBe(false)
      expect(inShip, `step ${step.id} focus 撞上 SHIPS`).toBe(false)
    }
  })
})
