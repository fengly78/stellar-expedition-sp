import { beforeEach, describe, expect, it, vi } from 'vitest'
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
 * 12 页双语渲染契约（p16-b 走查的可自动化部分）。
 *
 * 人工走查要拍 24 张截图逐页看，但其中风险最高的一问是——
 * **EN 模式下每页是否真的没有中文残留**。这可以用服务端渲染直接断言：
 * 渲染出的 HTML 里出现任何 CJK 字符即为漏译。
 *
 * 本测试覆盖：12 页在 zh/en 各渲染一次不抛错；EN 输出零 CJK；
 * zh 输出确实有中文（防止 locale 压根没切换而假通过）。
 *
 * **不覆盖**（仍需人工）：视觉布局、移动端断点、真实浏览器渲染与持久化。
 * 见 doc/release-walkthrough-1.0.0.md。
 */

/**
 * 「EN 输出零残留」的正则。
 *
 * 2026-09-29 扩区间：原先只有两个汉字区，**不含全角标点**，于是
 * GameScreen 资源格 aria-label 的「。」、Overview 的「：」、Research 对比区的
 * 「；》」、Shipyard 步进器的「＋」全部逃逸——它们是全角标点而非汉字，
 * 逐个汉字看根本看不见。补上 U+3000-303f（CJK 标点：、。；「」《》｜）
 * 与 U+FF00-FFEF（全角：：；＋（）等）两个区间。
 *
 * 变异验证：把任一 t('common.*') 取值改回全角字面量，对应页面的断言立刻变红。
 *
 * 白名单（ALLOWED_CJK）按「连续片段」匹配，新增的标点区间不会误伤
 * 已登记的双语副标设计——那些片段的中文主标本身不含全角标点。
 */
const CJK = /[一-鿿㐀-䶿]/
/** 汉字 + 全角标点：EN 输出里两者都是漏译信号。 */
const CJK_OR_FULLWIDTH = /[一-鿿㐀-䶿　-〿＀-￯]/
/** EN 输出已完全无中文的页面：硬断言，任何回退都会立刻红。 */
const CLEAN_PAGES = new Set([
  'Fleet', 'Reports', 'Shipyard', 'Codex', 'Galaxy', 'Achievements', 'Officers', 'Highscore',
])
/**
 * 允许残留中文的页面 —— 仅限**已确认保留的双语副标设计**（中文主标 + EN 副标并存）。
 * 断言是「命中的中文必须全在白名单内」，所以新出现的漏译依然会失败。
 * 其余页面用 it.fails 记债务（见下方注释）。
 *
 * 2026-09-29：Overview 从债务（it.fails）提为硬断言。它的残留只有场景热点的
 * 中文主标（指挥中继 / 金属矿场 …）与 BUILDING_MOTTO 警句，都属已确认设计，
 * 登记在下方白名单。原先的 `nextGoal：` 全角冒号也一并修掉了。
 */
const ALLOWED_CJK: Record<string, string[]> = {
  // 分类名：中文主标 + <small>EN</small> 副标（经确认保留的设计）
  Buildings: ['资源设施', '能源设施', '太空设施', '防御设施', '指挥与其他', '月面设施', '机器人工厂', '金属产量', '晶体产量', '重氢产量'],
  Research: ['能源科技', '推进科技', '信息科技', '军事科技', '基础科学', '文明核心'],
  Campaign: ['金属产量', '晶体产量', '重氢产量'],
  // Overview 场景热点 + 建筑警句：同属「中文主标 + EN 副标」设计
  Overview: [
    '指挥中继', '金属矿场', '晶体矿场', '研究实验室', '轨道船坞', '防御雷达',
    '深掘地核，铸造文明。', '折射星光，凝聚未来。', '精密建造，扩展家园。',
    '从轨道启航，驶向群星。', '知识拓展边界。', '洞察黑暗，预见威胁。',
    '连接星系，统御未来。',
  ],
}

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

const homeId = () => useGame.getState().planets.find((p) => p.isHome)!.id

/** 12 页渲染器：7 页无 props，4 页要 planetId，Overview 还要一个跳转回调。 */
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

describe('12 页双语渲染契约', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    const mem = shim()
    useGame.getState().newGame()
    mem.set('ogame-sp-session', 'render-test')
  })

  for (const [name, render] of PAGES) {
    it(`${name}：zh/en 均可渲染`, () => {
      setLocale('zh')
      const zh = renderToStaticMarkup(render())
      setLocale('en')
      const en = renderToStaticMarkup(render())
      expect(zh.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
    })

    /**
     * Fleet 与 Reports 的 EN 输出已完全无中文，改为硬断言。
     *
     * 其余页面仍有残留，分三类：
     * ① 已确认保留的双语副标设计（`资源设施 / RESOURCE FACILITIES` 这类）。
     * ② 术语仍走 `def.name` 而非 `term()`：Shipyard 舰船目录、Codex 建筑名、
     *    Galaxy 星球行、Highscore 星球名等。
     * ③ 游戏数据本身是中文：成就名称、军官效果描述、战役关卡描述、
     *    星球名、教程目标名。
     *
     * 这三类用 `it.fails` 记录：现在红着，修完自动转绿（vitest 会在它开始
     * 通过时反过来报失败，正是想要的信号）。已登记在 doc/release-walkthrough-1.0.0.md。
     */
    const check = CLEAN_PAGES.has(name) || ALLOWED_CJK[name] ? it : it.fails
    check(`${name}：EN 模式无中文残留${CLEAN_PAGES.has(name) || ALLOWED_CJK[name] ? '' : '（已知债务，见注释）'}`, () => {
      setLocale('en')
      const en = renderToStaticMarkup(render())
      const allowed = ALLOWED_CJK[name] ?? []
      const hits: string[] = []
      const re = new RegExp(CJK_OR_FULLWIDTH, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(en)) !== null) {
        // 只要该处的连续片段整体落在白名单里，就视为已批准的双语副标。
        // 片段用「汉字 + 全角标点」连取：像「资源设施」这种白名单项不含标点，
        // 而未批准的漏译（中文实体名 + 全角冒号）会被整段抓出来。
        const run = en.slice(m.index).match(new RegExp(CJK_OR_FULLWIDTH.source + '+'))?.[0] ?? ''
        if (allowed.some((a) => run.includes(a) || a.includes(run))) continue
        hits.push(en.slice(Math.max(0, m.index - 30), m.index + 30))
      }
      expect(hits, `EN 渲染输出含未批准的中文：\n${hits.join('\n---\n')}`).toEqual([])
    })
  }

  it('zh 模式确实含中文（防止 locale 未切换导致假通过）', () => {
    setLocale('zh')
    const zh = renderToStaticMarkup(createElement(Overview, { planetId: homeId() }))
    expect(zh).toMatch(CJK)
  })
})
