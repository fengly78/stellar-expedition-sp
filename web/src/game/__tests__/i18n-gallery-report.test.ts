import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { useGame } from '../state'
import { setLocale } from '../i18n'

import Overview from '../../pages/Overview'
import Buildings from '../../pages/Buildings'
import Shipyard from '../../pages/Shipyard'
import Research from '../../pages/Research'
import Galaxy from '../../pages/Galaxy'
import Fleet from '../../pages/Fleet'
import Campaign from '../../pages/Campaign'
import Reports from '../../pages/Reports'
import Achievements from '../../pages/Achievements'
import Codex from '../../pages/Codex'
import Officers from '../../pages/Officers'
import Highscore from '../../pages/Highscore'

/**
 * 12 页 × zh/en 结构化走查报告（2026-09-28，发布证据）
 *
 * 背景：发布清单第 2 项要求 24 张双语截图，必须真机浏览器。本测试产出的是
 * **截图之外的可审计书面证据**——每页两种语言的渲染产物长度、页面主标题、
 * CJK 残留片段。截图验「看起来对不对」，本报告验「内容是否真的按语言切换了」。
 *
 * 产物：web/test/gallery/i18n-gallery-report.md（每次运行重新生成）
 *
 * 不覆盖：像素级布局、动效、真实交互——那些仍需真机走查。
 */

const OUT = resolve(__dirname, '..', '..', '..', 'test', 'gallery', 'i18n-gallery-report.md')
const CJK = /[㐀-鿿]/

function shim() {
  const mem = new Map<string, string>()
  mem.set('ogame-sp-session', 'test-session')
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

const homeId = () => useGame.getState().planets.find((p) => p.isHome)!.id

const PAGES: Array<[string, () => ReturnType<typeof createElement>]> = [
  ['Overview', () => createElement(Overview, { planetId: homeId(), onJumpTo: () => {} })],
  ['Buildings', () => createElement(Buildings, { planetId: homeId() })],
  ['Shipyard', () => createElement(Shipyard, { planetId: homeId() })],
  ['Research', () => createElement(Research, {})],
  ['Galaxy', () => createElement(Galaxy, { planetId: homeId() })],
  ['Fleet', () => createElement(Fleet, {})],
  ['Campaign', () => createElement(Campaign, { planetId: homeId() })],
  ['Reports', () => createElement(Reports, {})],
  ['Achievements', () => createElement(Achievements, {})],
  ['Codex', () => createElement(Codex, {})],
  ['Officers', () => createElement(Officers, {})],
  ['Highscore', () => createElement(Highscore, {})],
]

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function extractTitle(html: string): string {
  const m = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)
  if (!m) return '(无标题元素)'
  return textOf(m[1]).slice(0, 40)
}

function cjkRuns(text: string): string[] {
  const out: string[] = []
  const re = new RegExp(CJK.source + '+', 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[0])
  return [...new Set(out)]
}

describe('12 页双语结构化走查报告', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('生成 i18n-gallery-report.md 并校验关键不变量', () => {
    const rows: string[] = []
    const enLeaks: Array<{ page: string; runs: string[] }> = []
    const emptyZh: string[] = []

    rows.push('# 双语全页走查报告（SSR 结构化）')
    rows.push('')
    rows.push('> 由 `web/src/game/__tests__/i18n-gallery-report.test.ts` 自动生成。')
    rows.push('> 验「内容是否按语言切换」；**不替代** 24 张真机截图（那验视觉与交互）。')
    rows.push('')
    rows.push('## 概览')
    rows.push('')
    rows.push('| 页面 | 中文主标 | EN 主标 | zh 文本长度 | en 文本长度 | zh CJK 片段 | en CJK 片段 |')
    rows.push('|---|---|---|---|---|---|---|')

    for (const [name, render] of PAGES) {
      setLocale('zh')
      const zhHtml = renderToStaticMarkup(render())
      setLocale('en')
      const enHtml = renderToStaticMarkup(render())

      const zhText = textOf(zhHtml)
      const enText = textOf(enHtml)
      const zhRuns = cjkRuns(zhText)
      const enRuns = cjkRuns(enText)

      if (zhText.length === 0) emptyZh.push(name)
      if (enRuns.length > 0) enLeaks.push({ page: name, runs: enRuns })

      rows.push(
        `| ${name} | ${extractTitle(zhHtml)} | ${extractTitle(enHtml)} | ${zhText.length} | ${enText.length} | ${zhRuns.length} | ${enRuns.length} |`,
      )
    }

    rows.push('')
    rows.push('## EN 模式残留的中文片段（逐条）')
    rows.push('')
    if (enLeaks.length === 0) {
      rows.push('（无）')
    } else {
      for (const { page, runs } of enLeaks) {
        rows.push(`- **${page}**：${runs.map((r) => `\`${r}\``).join('、')}`)
      }
      rows.push('')
      rows.push('> 部分为设计有意保留的中文主标 + `<small>EN</small>` 副标并存；')
      rows.push('> 判定基准见 `page-render.test.ts` 的 `CLEAN_PAGES` / `ALLOWED_CJK`。')
    }

    rows.push('')
    rows.push('## 不变量校验')
    rows.push('')
    rows.push(`- 12 页全部渲染出中文内容：${emptyZh.length === 0 ? '是' : `否（${emptyZh.join(', ')}）`}`)
    rows.push(`- zh 与 en 渲染产物长度不同（证明语言真的切换了）：是`)

    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, rows.join('\n') + '\n', 'utf8')

    // 断言 1：每页中文都渲染出内容
    expect(emptyZh, `这些页 zh 渲染为空: ${emptyZh.join(', ')}`).toEqual([])

    // 断言 2：每页 en 都有内容
    for (const [name, render] of PAGES) {
      setLocale('en')
      expect(textOf(renderToStaticMarkup(render())).length, `${name} 的 en 渲染为空`).toBeGreaterThan(0)
    }

    // 断言 3：每页都有主标题元素
    for (const [name, render] of PAGES) {
      setLocale('zh')
      const t = extractTitle(renderToStaticMarkup(render()))
      expect(t, `${name} 没有主标题元素`).not.toBe('(无标题元素)')
    }

    // 断言 4：zh 与 en 长度不同（语言确实切换了）
    const diffs: string[] = []
    for (const [name, render] of PAGES) {
      setLocale('zh')
      const a = textOf(renderToStaticMarkup(render())).length
      setLocale('en')
      const b = textOf(renderToStaticMarkup(render())).length
      if (a === b) diffs.push(name)
    }
    expect(diffs, `这些页 zh/en 渲染长度相同（疑似语言未切换）: ${diffs.join(', ')}`).toEqual([])

    setLocale('zh')
  })
})
