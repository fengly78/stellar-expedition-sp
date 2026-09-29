import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { zh } from '../locales/zh'
import { en } from '../locales/en'

// 回归：分类名绕过 i18n（2026-09-28 发布前体检 P1）
//
// 症状：Buildings 页的建筑分类名（资源设施/能源设施/…）与 Research 页的五类研究
// 分类名（能源科技/推进科技/…）是中文字面量，渲染点直接 {c.name} / {category.label}，
// 不走 t() —— 切到英文后这些分类名仍然显示中文，EN 模式出现大面积中文残留。
//
// 修复：两处都改为 i18n 键（build.cat.* / research.cat.*），渲染点走 t()。

const SRC = resolve(__dirname, '..', '..')

const buildings = readFileSync(resolve(SRC, 'pages/Buildings.tsx'), 'utf8')
const research = readFileSync(resolve(SRC, 'pages/Research.tsx'), 'utf8')

const BUILD_CATS = ['resource', 'energy', 'space', 'defense', 'command', 'lunar'] as const
const RESEARCH_CATS = ['energy', 'propulsion', 'computing', 'military', 'science'] as const

describe('分类名走 i18n', () => {
  it('Buildings 分类定义用 nameKey 而非中文字面量 name', () => {
    expect(buildings).toMatch(/nameKey: 'build\.cat\./)
    // 不应再有中文字面量的 name 字段
    expect(buildings).not.toMatch(/name: '资源设施'/)
    expect(buildings).not.toMatch(/name: '能源设施'/)
    expect(buildings).not.toMatch(/name: '太空设施'/)
    expect(buildings).not.toMatch(/name: '防御设施'/)
    expect(buildings).not.toMatch(/name: '指挥与其他'/)
    expect(buildings).not.toMatch(/name: '月面设施'/)
  })

  it('Buildings 渲染点走 t(c.nameKey)', () => {
    expect(buildings).toMatch(/\{t\(c\.nameKey\)\}/)
    // 排除注释里的说明文字，只看真实渲染：形如 ><span>{c.name} 的 JSX
    expect(buildings).not.toMatch(/>\s*\{c\.name\}\s*</)
  })

  it('Research 分类定义用 labelKey 而非中文字面量 label', () => {
    expect(research).toMatch(/labelKey: 'research\.cat\./)
    expect(research).not.toMatch(/label: '[\u4e00-\u9fff]/)
  })

  it('Research 渲染点走 t(category.labelKey)', () => {
    expect(research).toMatch(/\{t\(category\.labelKey\)\}/)
    // 排除注释，只看真实 JSX 渲染
    expect(research).not.toMatch(/>\s*\{category\.label\}\s*</)
  })

  it('build.cat.* 六个键双语齐全且英文非中文', () => {
    for (const id of BUILD_CATS) {
      const key = `build.cat.${id}`
      expect(zh[key], `zh 缺 ${key}`).toBeTruthy()
      expect(en[key], `en 缺 ${key}`).toBeTruthy()
      expect(/[\u4e00-\u9fff]/.test(en[key]), `en ${key} 仍是中文`).toBe(false)
    }
  })

  it('research.cat.* 五个键双语齐全且英文非中文', () => {
    for (const id of RESEARCH_CATS) {
      const key = `research.cat.${id}`
      expect(zh[key], `zh 缺 ${key}`).toBeTruthy()
      expect(en[key], `en 缺 ${key}`).toBeTruthy()
      expect(/[\u4e00-\u9fff]/.test(en[key]), `en ${key} 仍是中文`).toBe(false)
    }
  })

  it('中英文取值不同（不是把中文塞进 en 包充数）', () => {
    expect(zh['build.cat.resource']).toBe('资源设施')
    expect(en['build.cat.resource']).toBe('Resource Facilities')
    expect(zh['research.cat.energy']).toBe('能源科技')
    expect(en['research.cat.energy']).toBe('Energy')
  })

  it('两包键集完全对齐（新增键没漏译）', () => {
    const zhKeys = new Set(Object.keys(zh))
    const enKeys = new Set(Object.keys(en))
    // menu.initResource 是唯一有意 zh-only（i18n.test.ts 断言回退行为）
    const INTENTIONAL_ZH_ONLY = new Set(['menu.initResource'])
    const missingEn = [...zhKeys].filter((k) => !enKeys.has(k) && !INTENTIONAL_ZH_ONLY.has(k))
    const missingZh = [...enKeys].filter((k) => !zhKeys.has(k))
    expect(missingEn, 'en 缺键').toEqual([])
    expect(missingZh, 'zh 缺键').toEqual([])
  })

  it('占位符双语一致（新增键不得带占位符错配）', () => {
    const ph = /\{(\w+)\}/g
    for (const key of Object.keys(zh)) {
      if (!en[key]) continue
      const a = (zh[key].match(ph) ?? []).sort().join(',')
      const b = (en[key].match(ph) ?? []).sort().join(',')
      expect(b, `${key} 占位符不匹配：zh=${a} en=${b}`).toBe(a)
    }
  })

  it('两包均可独立导入且规模合理（防止测试导错包）', () => {
    expect(Object.keys(zh).length).toBeGreaterThan(900)
    expect(Object.keys(en).length).toBeGreaterThan(900)
  })
})
