import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setLocale } from '../i18n'
import { PRIVACY_STATEMENT_KEYS } from '../consent'
import PrivacyGate from '../../screens/PrivacyGate'

/**
 * 隐私同意门的多语言与可达性门禁（2026-09-29）
 *
 * 缺陷背景：隐私声明正文原是 consent.ts 里 4 条纯中文字面量，没有 locale 键。
 * 而 App.tsx 在未同意前**只渲染** PrivacyGate 一屏，语言切换器又在设置页之后。
 * 撤回同意时 withdrawPrivacy() 只删同意标记、保留 locale，
 * 所以 EN 用户会稳定落进「英文外壳 + 中文正文」且本页无切换入口的状态。
 *
 * 本文件锁三件事：
 *   1. 声明正文必须走 locale（EN 渲染不得含中文）
 *   2. 本页自带语言切换入口（否则 EN 用户被困住）
 *   3. 4 条声明在 zh/en 两个语言包中都存在且非空
 */

/** 汉字区（与 page-render.test.ts 同口径） */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/

function shim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

function renderIn(locale: 'zh' | 'en'): string {
  setLocale(locale)
  return renderToStaticMarkup(createElement(PrivacyGate))
}

describe('隐私同意门：声明正文多语言 + 不可困住用户', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
  })

  it('EN 模式下声明正文不得残留中文', () => {
    const html = renderIn('en')
    // 抽出 <p> 里的可见文本：声明正文与「不同意则无法进入」都必须是英文
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ''),
    )
    expect(paras.length, '声明段落数量异常').toBeGreaterThanOrEqual(PRIVACY_STATEMENT_KEYS.length)
    for (const p of paras) {
      expect(p, `EN 声明段落残留中文：${p}`).not.toMatch(CJK)
    }
  })

  it('EN 模式下整页除语言标签外不得残留中文', () => {
    const html = renderIn('en')
    // 语言切换器里「中文」按钮用各语言自称是正确的（中文用户就该看到「中文」），
    // 因此这里先把语言标签剔除，再要求剩余文本零中文。
    const text = html
      .replace(/<[^>]+>/g, '')
      .replace(/中文/g, '')
    expect(text, `EN 页面残留中文：${text.slice(0, 200)}`).not.toMatch(CJK)
  })

  it('ZH 模式下声明正文必须是中文（防止把 EN 文案误填进 zh 包）', () => {
    const html = renderIn('zh')
    const text = html.replace(/<[^>]+>/g, '')
    expect(text).toMatch(CJK)
  })

  it('本页自带语言切换入口（否则 EN 用户在未同意前无处切换）', () => {
    const html = renderIn('en')
    // 中英文两个语言按钮都要在，且当前语言用 aria-pressed 标记
    expect(html, '缺少 English 语言按钮').toContain('English')
    expect(html, '缺少 中文 语言按钮').toMatch(/>\s*中文\s*</)
    expect(html, '缺少语言切换标签').toMatch(/Switch language/)
    expect(html, '语言按钮未标记当前选中态').toContain('aria-pressed')
  })

  it('4 条声明键在 zh/en 两个语言包中都存在且非空', () => {
    const zh = readFileSync(resolve(__dirname, '../locales/zh.ts'), 'utf8')
    const en = readFileSync(resolve(__dirname, '../locales/en.ts'), 'utf8')
    expect(PRIVACY_STATEMENT_KEYS).toHaveLength(4)
    for (const k of PRIVACY_STATEMENT_KEYS) {
      expect(zh, `zh 包缺 ${k}`).toContain(`'${k}'`)
      expect(en, `en 包缺 ${k}`).toContain(`'${k}'`)
    }
  })

  it('PrivacyGate 源码不得再直接引入中文字面量数组（防回退）', () => {
    const src = readFileSync(resolve(__dirname, '../../screens/PrivacyGate.tsx'), 'utf8')
    expect(src, '仍从 consent 引入旧的中文字面量数组').not.toMatch(/PRIVACY_STATEMENT\b(?!_KEYS)/)
    expect(src, '声明正文应走 PRIVACY_STATEMENT_KEYS + t()').toContain('PRIVACY_STATEMENT_KEYS')
  })
})
