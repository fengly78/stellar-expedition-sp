import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGame, BUILD_SLOTS, SHIP_SLOTS, RESEARCH_SLOTS } from '../state'
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
 * 试玩修复的 SSR 渲染门禁（2026-09-28）
 *
 * 背景：5 个 UI 修复此前只有「代码看起来对」，没有任何自动化断言——
 * 其中 4 个要登录才能在浏览器里看，而登录需要用户接手，等于长期挂着。
 * 本文件用 renderToStaticMarkup 做服务端渲染断言，把这 4 项变成可跑的门禁：
 *   1. 12 个页面全部有页面标题（此前被一条 display:none 全局隐藏）
 *   2. 新增标题条在 EN 下不残留中文
 *   3. 研究队列空槽与在研槽结构一致（此前空槽少一行，两个窗口高度不齐）
 *   4. 船坞默认停在舰船标签 + 舰队页提供造船出口
 *   5. 建筑分类名走 i18n（Buildings/Research 的分类名不得是硬编码中文）
 *
 * SSR 覆盖不到的部分（需真机）：CSS 布局重叠、移动端断点、动效、真实交互。
 */

/** 页面标题的 CSS 契约：中文主标 + data-en 英文副标 */
const TITLE_MARK = /class="page-title/

/** 需要默认停在舰船标签的页面 */
function shipyardShipsFirst() {
  // 船坞页的「舰船/防御」双标签，舰船在前且带 data-active
  const html = renderToStaticMarkup(createElement(Shipyard, { planetId: homeId() }))
  return html
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

/**
 * 哪些页用专用标题组件（不含 page-title 类名）——它们已自带头部，不重复断言。
 * 逐页实测：Overview=nova-home-title、Campaign=nova-campaign-title、
 * Shipyard/Research=nova-workspace-title、Galaxy=nova-galaxy-title。
 */
const CUSTOM_HEAD = new Set(['Overview', 'Campaign', 'Shipyard', 'Research', 'Galaxy'])

describe('试玩 UI 修复的渲染门禁', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
    setLocale('zh')
  })

  it('12 个页面全部有页面标题（修复前有 9 页被 display:none 隐藏）', () => {
    const missing: string[] = []
    for (const [name, render] of PAGES) {
      if (CUSTOM_HEAD.has(name)) continue
      const html = renderToStaticMarkup(render())
      if (!TITLE_MARK.test(html)) missing.push(name)
    }
    expect(missing, `这些页没有 page-title: ${missing.join(', ')}`).toEqual([])
  })

  it('Overview 与 Campaign 用专用标题组件（不是遗漏）', () => {
    const overview = renderToStaticMarkup(PAGES[0][1]())
    expect(overview).toMatch(/class="nova-home-title"/)
    const campaign = renderToStaticMarkup(createElement(Campaign, { planetId: homeId() }))
    expect(campaign).toMatch(/class="nova-campaign-title"/)
  })

  it('Shipyard / Research / Galaxy 也用专用标题组件（不是遗漏）', () => {
    expect(shipyardShipsFirst()).toMatch(/class="nova-workspace-title"/)
    expect(renderToStaticMarkup(createElement(Research, {}))).toMatch(/class="nova-workspace-title"/)
    expect(renderToStaticMarkup(createElement(Galaxy, { planetId: homeId() }))).toMatch(/class="nova-galaxy-title"/)
  })

  it('带 data-en 的标题条在 EN 模式下不残留中文主标', () => {
    setLocale('en')
    for (const name of ['Fleet', 'Reports', 'Codex', 'Galaxy', 'Achievements', 'Officers', 'Highscore']) {
      const render = PAGES.find(([n]) => n === name)![1]
      const html = renderToStaticMarkup(render())
      const m = html.match(/<h2 class="page-title[^"]*"[^>]*>([^<]*)</)
      if (m) {
        expect(m[1], `${name} 的 EN 标题含 CJK: ${m[1]}`).not.toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })

  it('新增的三页标题条有 data-en 英文副标', () => {
    setLocale('zh')
    for (const name of ['Fleet', 'Reports', 'Codex']) {
      const render = PAGES.find(([n]) => n === name)![1]
      const html = renderToStaticMarkup(render())
      expect(html, `${name} 缺 data-en`).toMatch(/page-title[^"]*" data-en="[A-Z ]+"/)
    }
  })

  it('研究队列：空槽与在研槽结构一致（空槽也有进度槽）', () => {
    // 排一项科技：一槽在研、一槽空闲
    const st = useGame.getState()
    const home = st.planets.find((p) => p.isHome)!
    useGame.setState({
      techs: {},
      researchQueue: [],
      planets: [{ ...home, buildings: { ...home.buildings, 31: 12 }, resources: { metal: 1e12, crystal: 1e12, deuterium: 1e12 } }],
    })
    expect(useGame.getState().startResearch(106)).toBeNull() // 间谍技术

    const html = renderToStaticMarkup(createElement(Research, {}))
    // 队列渲染 RESEARCH_SLOTS 个槽
    const items = html.match(/class="nova-research-queue-(empty|item)"/g) ?? []
    expect(items.length).toBe(RESEARCH_SLOTS)
    // 空槽也必须有进度槽 <i><u>，否则两窗高度不齐（db533bd 修的就是这个）
    const empties = html.match(/class="nova-research-queue-empty"[\s\S]*?(?=<div class="nova-|<\/aside>)/g) ?? []
    for (const e of empties) {
      expect(e, '空槽缺少 <i> 进度槽容器').toMatch(/<i>/)
      expect(e, '空槽缺少 <u> 填充块').toMatch(/<u/)
    }
  })

  it('船坞默认停在舰船标签而非防御（造船入口修复）', () => {
    setLocale('zh')
    const html = shipyardShipsFirst()
    // 双标签渲染的是译文（ship.shipsTab=舰船 / ship.defenseTab=防御）
    const shipsIdx = html.indexOf('>舰船<')
    const defIdx = html.indexOf('>防御<')
    expect(shipsIdx, '找不到舰船标签').toBeGreaterThan(-1)
    expect(defIdx, '找不到防御标签').toBeGreaterThan(-1)
    // GameScreen 传 defaultFamily="ships"，所以第一个带 data-active 的是舰船标签
    const shipsBtnStart = html.lastIndexOf('<button', shipsIdx)
    const defBtnStart = html.lastIndexOf('<button', defIdx)
    const shipsActive = html.slice(shipsBtnStart, shipsIdx).includes('data-active')
    const defActive = html.slice(defBtnStart, defIdx).includes('data-active')
    expect(shipsActive, '舰船标签应默认选中（data-active）').toBe(true)
    expect(defActive, '防御标签不应默认选中').toBe(false)
  })

  it('GameShell 传 defaultFamily="ships"（造船入口的真正接线点）', () => {
    // 上一条只测了 Shipyard 组件自身的默认值；这里测接线——
    // 变异测试确认：把 GameScreen 的 defaultFamily 改回 "defense" 时，
    // 组件级断言抓不到，必须锁这一行。
    const fs = readFileSync(resolve(__dirname, '..', '..', 'components', 'GameScreen.tsx'), 'utf8')
    expect(fs, '船坞 tab 必须传 defaultFamily="ships"').toMatch(/<Shipyard[^>]*defaultFamily="ships"/)
    expect(fs, '不得回退为 defaultFamily="defense"').not.toMatch(/<Shipyard[^>]*defaultFamily="defense"/)
    // 底栏标签必须是 nav.shipyard（显示「船坞」）
    expect(fs, '底栏必须用 nav.shipyard').toMatch(/key:\s*'shipyard',\s*label:\s*'nav\.shipyard'/)
  })

  it('舰队页在一艘船都没有时提供造船出口', () => {
    const html = renderToStaticMarkup(createElement(Fleet, { onGoShipyard: () => {} }))
    // 页脚「船坞联动」是可点击的按钮，且无船时出现引导出口
    expect(html, '舰队页没有造船出口').toMatch(/fleet\.goShipyard|前往船坞|Go to Shipyard/)
  })

  it('建筑分类名走 i18n（EN 下不得是硬编码中文）', () => {
    setLocale('en')
    const html = renderToStaticMarkup(createElement(Buildings, { planetId: homeId() }))
    const cats = html.match(/nova-construction-cats__list[\s\S]*?<\/div>/)?.[0] ?? ''
    // 分类名应出现英文原文
    expect(cats).toMatch(/Resource Facilities|Energy Facilities|Space Facilities/)
    // 不得残留中文硬编码
    expect(cats).not.toMatch(/资源设施|能源设施|太空设施|防御设施|指挥与其他|月面设施/)
  })

  it('研究分类名走 i18n（EN 下不得是硬编码中文）', () => {
    setLocale('en')
    const html = renderToStaticMarkup(createElement(Research, {}))
    const cats = html.match(/nova-research-categories[\s\S]*?<\/aside>/)?.[0] ?? ''
    expect(cats).toMatch(/>Energy<|>Propulsion<|>Computing<|>Military<|>Science</)
    expect(cats).not.toMatch(/能源科技|推进科技|信息科技|军事科技|基础科学/)
  })

  it('三类队列容量常量一致（幽灵队列回归）', () => {
    expect(BUILD_SLOTS).toBe(3)
    expect(SHIP_SLOTS).toBe(3)
    expect(RESEARCH_SLOTS).toBe(2)
  })
})
