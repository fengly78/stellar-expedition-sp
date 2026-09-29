// node:fs / node:path 的类型由 web/tsconfig.test.json 提供（该测试单独成一个
// TS 项目）。不能用 `/// <reference types="node" />`——类型 reference 是程序级的，
// 会把 node 全局注入整个编译单元，浏览器端写 process.env 也能过类型检查。
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { zh } from '../locales/zh'
import { en } from '../locales/en'

/**
 * 语言包契约测试（计划里的 TEST-005）。
 *
 * translate() 的回退链是「en → zh → 键名本身」，**缺键不报错**，只会静默显示
 * 中文或直接显示 `ns.key` 字面量。键写错、zh/en 不对齐、占位符错配，
 * 都能编译通过、单测全绿、界面照常渲染——只有把这三条契约钉成常驻断言才拦得住。
 *
 * 另两条契约（① 源码里 t('key') 全部可解析 ② 无孤儿键）需要扫描源码文件，
 * 依赖 @types/node（已是 devDependency，只是此前没接进 tsconfig.app.json 的 types）。
 */

/** 有意保留的 zh-only 键，不得随手补 en 或删 zh。 */
const INTENTIONALLY_ZH_ONLY = new Set([
  // i18n.test.ts 明确断言：en 缺此键时回退 zh
  'menu.initResource',
])

const ph = (v: string) => (v.match(/\{(\w+)\}/g) ?? []).sort()

/** 测试文件在 src/game/__tests__/：上溯两级到 src/（要覆盖 pages/components/screens）。 */
const SRC = resolve(import.meta.dirname, '..', '..')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'locales' || name === '__tests__') continue
      sourceFiles(p, acc)
    } else if (/\.tsx?$/.test(name)) acc.push(p)
  }
  return acc
}

/**
 * 「已用键」的稳健口径：抓源码里所有带点的引号字符串。
 * 这样既能覆盖 t('ns.key')，也能覆盖键表里的 label: 'ns.key' / kind: 'ns.key'。
 * （早期版本用「const X = {...} 正则」解析，数组字面量形式的键表解析不到，
 *  会把 nav.research、report.kind.missile 这类在用键误报成孤儿。）
 */
const quotedKey = /'([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)'/g
const namespaces = new Set(Object.keys(zh).map((k) => k.split('.')[0]))

function collectUsed(): Set<string> {
  const used = new Set<string>()
  for (const f of sourceFiles(SRC)) {
    for (const m of readFileSync(f, 'utf-8').matchAll(quotedKey)) {
      if (namespaces.has(m[1].split('.')[0])) used.add(m[1])
    }
  }
  return used
}

describe('语言包契约', () => {
  it('zh/en 键集一致，只允许已登记的 zh-only 键', () => {
    expect(Object.keys(en).filter((k) => !(k in zh)), 'en 包不得有 zh 缺失的键').toEqual([])
    expect(Object.keys(zh).filter((k) => !(k in en) && !INTENTIONALLY_ZH_ONLY.has(k))).toEqual([])
  })

  it('没有空值', () => {
    const empty: string[] = []
    for (const [name, pack] of Object.entries({ zh, en })) {
      for (const [k, v] of Object.entries(pack)) if (!v.trim()) empty.push(`${name}:${k}`)
    }
    expect(empty).toEqual([])
  })

  it('占位符逐键一致（{name} 形式，见 i18n.ts 的插值正则）', () => {
    const mismatched = Object.keys(zh)
      .filter((k) => k in en)
      .filter((k) => JSON.stringify(ph(zh[k])) !== JSON.stringify(ph(en[k])))
    expect(mismatched).toEqual([])
  })

  it('全源码引用的键都能在两侧解析', () => {
    // menu.initResource 例外：i18n.test.ts 明确断言 en 缺此键时回退 zh
    const missing = [...collectUsed()].filter(
      (k) => !(k in zh) || (!(k in en) && !INTENTIONALLY_ZH_ONLY.has(k)),
    )
    expect(missing, '以下键被引用但任一语言包缺失——translate 会静默回退成键名本身').toEqual([])
  })

  it('无孤儿键（定义了却无人引用）', () => {
    const used = collectUsed()
    // 动态取键（t(someVar) / t(row.label)）无法静态枚举，这类键族按前缀豁免。
    const DYNAMIC_KEY_FAMILIES = ['build.stat', 'build.note', 'detail.desc', 'ach.goal', 'research.effect']
    // TAB_GROUPS 的 label 是已登记的死数据，键为其预留。
    const ALLOWED_ORPHANS = new Set(['nav.combat', 'nav.military', 'nav.archives'])
    const orphans = Object.keys(zh).filter(
      (k) => !used.has(k) && !ALLOWED_ORPHANS.has(k) && !DYNAMIC_KEY_FAMILIES.some((pre) => k.startsWith(pre)),
    )
    expect(orphans, '这些键已定义但无任何引用（要么接线漏了，要么该删）').toEqual([])
  })
})
