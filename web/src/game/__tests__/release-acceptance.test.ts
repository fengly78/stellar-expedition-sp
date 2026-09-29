import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
 * 发布验收：12 页 × zh/en 的**原始 i18n 键名泄漏**（2026-09-29）
 *
 * 背景——真机走查（4173 dist 产物）抓到两个玩家可见 P1，界面上直接显示：
 *   · 「更多」面板 7 个入口：nav.buildings / nav.galaxy / nav.campaign ...
 *   · Overview 场景热点：scene.metalMine / scene.crystalMine ...
 * 两者的共同形态是「t() 拿到了语言包里不存在的键，于是把键名原样吐到界面上」。
 *
 * 为什么已有门禁都漏了：
 *   · page-render.test.ts 的「EN 零 CJK」只找汉字，而键名是**拉丁字符**；
 *   · missing-i18n-keys.test.ts 是**静态**扫描源码字面量，抓不到运行时才
 *     拼出来的文本，也不覆盖数据表驱动的渲染结果。
 *
 * 本门禁补上这一层：从渲染出的 HTML 里**只抽取可见文本节点**（> 与 < 之间），
 * 再判定有没有长得像 i18n 键的片段。只看文本节点是关键——否则 class 名、
 * data-* 属性、CSS 变量里的点号会造成海量误报。
 *
 * 判定「像 i18n 键」：小写开头的点分串，且首段是语言包里真实存在的命名空间
 * （nav. / build. / overview. / research. ...）。这样 `scene.metalMine` 会被抓
 * （scene 与其余键同形），而 `1:8:3`「Lv.14」这类正常文本不会。
 *
 * 变异验证：回退两处修复后，本门禁精确报出 GameScreen 的 nav.* 与 Overview 的
 * scene.* 两组泄漏。
 */

function shim() {
  const mem = new Map<string, string>()
  mem.set('ogame-sp-session', 'test-session')
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

const homeId = () => useGame.getState().planets.find((p) => p.isHome)!.id

function stripComments(txt: string): string {
  let out = txt.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
  return out
}

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

/** 抽取可见文本节点：> 与 < 之间的内容，跳过 script/style/注释。 */
function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/<[^>]*>/)
    .join('\u0001')
}

/**
 * 判定「原始键名泄漏」：**整个文本节点**恰好是一个 i18n 键形态的串。
 *
 * 为什么用「整节点匹配」而不是「节点里包含点分串」：
 * 前者精度极高——原始键泄漏时 t() 返回的就是键本身，React 把它渲染成一个
 * 内容恰为 `nav.buildings` 的文本节点；而正常文本（Lv.14 / 1:8:3 / 10,633/h /
 * Metal Mine / v 1.0.0 · ...）都不会整体匹配。早期版本用「包含」判定，
 * 结果被版本号 `v1.0.0` 之类的片段淹没，误报满天飞。
 * 也不需要维护「命名空间白名单」——白名单一旦漏掉某个命名空间（如本轮的
 * `scene.`），门禁就会对该类缺陷完全失明，而这种失明是静默的。
 */
const WHOLE_KEY = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/

function leakedKeys(html: string): string[] {
  const hits: string[] = []
  for (const run of visibleText(html).split('\u0001')) {
    const text = run.trim()
    if (!text) continue
    if (WHOLE_KEY.test(text)) hits.push(text)
  }
  return [...new Set(hits)]
}

describe('发布验收：可见文本不得出现原始 i18n 键名', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    const mem = shim()
    useGame.getState().newGame()
    mem.set('ogame-sp-session', 'accept-test')
  })

  for (const [name, render] of PAGES) {
    for (const lang of ['zh', 'en'] as const) {
      it(`${name}（${lang}）`, () => {
        setLocale(lang)
        const html = renderToStaticMarkup(render())
        const leaked = leakedKeys(html)
        expect(
          leaked,
          `${name} ${lang} 的可见文本里出现原始 i18n 键名：${leaked.join(', ')}`,
        ).toEqual([])
      })
    }
  }

  it('Overview 场景热点显示中文主标 + 英文副标（本轮修复点）', () => {
    setLocale('zh')
    const html = renderToStaticMarkup(createElement(Overview, { planetId: homeId(), onJumpTo: () => {} }))
    for (const label of ['金属矿场', '晶体矿场', '研究实验室', '轨道船坞', '防御雷达']) {
      expect(html, `场景热点缺少「${label}」`).toContain(label)
    }
    expect(html, '仍泄漏 scene.* 伪键').not.toContain('scene.metalMine')
  })

  /**
   * 「更多」面板由 showMobileMore 状态控制，SSR 渲染不到（默认收起），
   * 所以上面 12 页的可见文本断言覆盖不到它——而这正是本轮第一个 P1 的位置。
   * 这里改用源码断言守住渲染点：页签的 label 是 i18n 键，必须再过一次 t()。
   * 断言口径是「不得出现未经 t() 包裹的 {X.label} 裸渲染」。
   */
  it('GameScreen「更多」面板不得裸渲染页签 label（必须 t(item.label)）', () => {
    const src = stripComments(readFileSync(resolve(process.cwd(), 'src/components/GameScreen.tsx'), 'utf8'))
    // 只看「更多」面板区块：全文件扫描会误报 SPEEDS 的 {sp.label}
    // （那是 '1x' / '20x' 字面量，不是 i18n 键）。
    const start = src.indexOf('mobile-more-panel')
    expect(start, '未找到 more-panel 区块，结构已变，请同步本门禁').toBeGreaterThan(-1)
    // 截到 </nav> 为止：面板里还嵌着存档槽子分块，固定长度会截不到页签渲染处
    const end = src.indexOf('</nav>', start)
    expect(end, '未找到 </nav>，结构已变，请同步本门禁').toBeGreaterThan(start)
    const block = src.slice(start, end)
    // 合法写法 t(tabItem.label) 里 "{" 紧邻的是 t(，不是 tabItem，
    // 因此这个正则只会命中**裸渲染**的 {X.label}。
    const raw = [...block.matchAll(/\{(\w+)\.label\}/g)].map((m) => m[0])
    expect(
      [...new Set(raw)],
      `「更多」面板存在未经 t() 包裹的页签 label 渲染（会显示原始键名）：${[...new Set(raw)].join(', ')}`,
    ).toEqual([])
    // 反向确认：正确写法确实在区块里
    expect(block, '未见 t(tabItem.label)，修复可能被回退').toContain('t(tabItem.label)')
  })
})
