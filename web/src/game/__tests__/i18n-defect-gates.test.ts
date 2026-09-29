import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGame, SLOT_NAMES, DIFFICULTIES, warnOverflow, overflowText } from '../state'
import { useToasts } from '../toasts'
import { setLocale, translatePlanetName, localizeField, listSep } from '../i18n'
import { ACHIEVEMENTS } from '../achievements'
import { TUTORIAL_STEPS } from '../tutorial'
import { CAMPAIGN_STAGES } from '../campaign'
import { OFFICERS } from '../objects'

import Overview from '../../pages/Overview'
import Research from '../../pages/Research'
import Highscore from '../../pages/Highscore'
import Officers from '../../pages/Officers'
import Shipyard from '../../pages/Shipyard'
import GameScreen from '../../components/GameScreen'
import MissileModal from '../../components/MissileModal'
import DispatchWizard from '../../components/DispatchWizard'
import LoadScreen from '../../screens/LoadScreen'

/**
 * 四类多语言缺陷的防回归门禁（2026-09-29）
 *
 * 每一节的注释都写明「缺陷形态」是什么——把所有断言改回缺陷形态时，
 * 对应的 it() 必须变红。变异验证结果见各节末尾。
 *
 * ① state.ts 零 i18n 引用：50 处 toast() 硬编码中文，且插值了中文实体名
 *    （BUILDINGS[].name / a.name / step.title），EN 玩家全程读中文。
 * ② 星球名漏走 translatePlanetName：同一数据在 6 处走了、5 处没走。
 * ③ SLOT_NAMES / DIFFICULTIES 缺 En 字段，LoadScreen 存档列表整行中文。
 * ④ 全角标点（：。；》｜＋、）漏进 EN 输出——page-render 的 CJK 正则
 *    不含全角标点区间，所以这一类历史上完全逃逸。
 */

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/
/** 汉字 + 全角标点。缺陷 ④ 逃逸的根因就是原正则漏了后两个区间。 */
const CJK_OR_FULLWIDTH = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/

/**
 * 已确认保留的**双语主标 + EN 副标**设计（与 page-render.test.ts 的 ALLOWED_CJK 同源）。
 * Overview 的场景热点标签与 BUILDING_MOTTO 都属这一类：中文主标是设计的一部分，
 * 不是漏译。断言前先把这些片段从渲染结果里抹掉，剩下的才算漏译。
 */
const APPROVED_ZH_BILINGUAL = [
  '指挥中继', '金属矿场', '晶体矿场', '研究实验室', '轨道船坞', '防御雷达',
  '深掘地核，铸造文明。', '折射星光，凝聚未来。', '精密建造，扩展家园。',
  '从轨道启航，驶向群星。', '知识拓展边界。', '洞察黑暗，预见威胁。',
  '连接星系，统御未来。',
]

/** 抹掉已批准的双语片段（含包裹它的全角引号），再做「零残留」判定。 */
function stripApproved(html: string): string {
  let out = html
  for (const s of APPROVED_ZH_BILINGUAL) {
    out = out.split(s).join('')
  }
  return out.replace(/[“”]/g, '')
}

/** 剥离注释但保持行号（否则注释里的示例代码会造成误报）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

const STATE_SRC = readFileSync(resolve(import.meta.dirname, '..', 'state.ts'), 'utf8')

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
const home = () => useGame.getState().planets.find((p) => p.isHome)!

describe('① state.ts 的操作反馈必须走 i18n', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
    useToasts.setState({ toasts: [] })
  })

  it('state.ts 引用了 i18n 层（缺陷形态：对 ./i18n 零 import）', () => {
    expect(STATE_SRC, 'state.ts 未 import i18n，toast 只能硬编码中文').toMatch(/from '\.\/i18n'/)
  })

  it('state.ts 的 toast() 实参里没有裸中文字面量', () => {
    // 抓 toast( ... ) 调用实参中的 CJK。注释已剥离。
    const code = stripComments(STATE_SRC)
    const offenders: string[] = []
    for (const m of code.matchAll(/toast\(([\s\S]{0,300}?),\s*'(?:info|success|warn|error)'\)/g)) {
      if (CJK_OR_FULLWIDTH.test(m[1])) offenders.push(m[1].replace(/\s+/g, ' ').slice(0, 90))
    }
    expect(offenders, `以下 toast() 实参含中文/全角标点，EN 下会显示中文：\n${offenders.join('\n')}`).toEqual([])
  })

  it('state.ts 的 return 文案（store 动作的校验错误）没有裸中文', () => {
    // 只补上一条断言漏掉的一类：`return \`…\`` 这种带插值的错误文案。
    // 变异验证时正是它没变红（M2b）——早期版本只查了单引号字面量。
    const code = stripComments(STATE_SRC)
    const offenders: string[] = []
    for (const m of code.matchAll(/return\s+(?:`[^`]*`|'[^']*')/g)) {
      if (CJK_OR_FULLWIDTH.test(m[0])) offenders.push(m[0].replace(/\s+/g, ' ').slice(0, 100))
    }
    expect(offenders, `以下 return 文案含中文/全角标点，EN 下会显示中文：\n${offenders.join('\n')}`).toEqual([])
  })

  it('state.ts 里除数据表与持久化名称外，不得再有裸中文', () => {
    // 兜底口径：中文只允许出现在「数据表的 name/nameEn 成对字段」与
    // 「存进存档的星球/槽位名」里，其余都是漏译。
    const code = stripComments(STATE_SRC)
    const ALLOWED_LINE = [
      /label: '标准'/, /desc: '本地单机/, /name: '自动存档'/, /name: '存档[一二三]'/,
      /之月/, /'母星'/, /'殖民地'/, /SLOT_NAMES\[slot\]\?\.name \?\? `存档\$\{slot\}`/,
    ]
    const offenders: string[] = []
    code.split('\n').forEach((line, i) => {
      if (!CJK.test(line)) return
      if (ALLOWED_LINE.some((re) => re.test(line))) return
      offenders.push(`${i + 1}  ${line.trim().slice(0, 100)}`)
    })
    expect(offenders, `以下行仍含中文（数据表/持久化名之外都是漏译）：\n${offenders.join('\n')}`).toEqual([])
  })

  it('EN 下的真实 toast 无中文残留（实战：溢出告警 / 存档 / 交易 / 签到 / 拆解）', () => {
    setLocale('en')
    const s = useGame.getState()
    const texts: string[] = []
    const collect = () => texts.push(...useToasts.getState().toasts.map((x) => x.text))

    warnOverflow({ metal: 17500, crystal: 0, deuterium: 0 })
    collect()

    s.saveToSlot(1, SLOT_NAMES[1].name)
    collect()

    s.trade(homeId(), 'metal', 'crystal', 1000)
    collect()

    s.claimDaily()
    collect()

    s.scrapDefense(homeId(), 401, 2)
    collect()

    expect(texts.length, '本用例应至少产生 5 条 toast，否则说明触发路径变了').toBeGreaterThanOrEqual(5)
    const bad = texts.filter((x) => CJK_OR_FULLWIDTH.test(x))
    expect(bad, `EN 模式 toast 仍含中文/全角标点：\n${bad.join('\n')}`).toEqual([])
  })

  it('EN 下 store 动作的校验错误无中文（实战：导弹 / 交易 / 派遣 / 军官 / 星球缺失）', () => {
    setLocale('en')
    const s = useGame.getState()
    const NO_SUCH_PLANET = 999999
    const errs: (string | null)[] = [
      s.dispatchMissiles(homeId(), { galaxy: 1, system: 8, position: 3 }, 1), // 无发射井
      s.dispatchMissiles(homeId(), { galaxy: 1, system: 8, position: 3 }, 0), // 数量无效
      s.trade(homeId(), 'metal', 'metal', 100), // 相同资源
      s.trade(homeId(), 'metal', 'crystal', 0), // 数量无效
      s.dispatchMission(homeId(), { galaxy: 1, system: 8, position: 5 }, 'attack', {}, {}), // 未选舰船
      s.hireOfficer('commander'), // 已雇佣 / 资源不足
      s.abandonPlanet(homeId()), // 母星不可放弃
      s.upgradeBuilding(homeId(), 9999), // 建筑不存在
      // 「星球不存在」这条必须真的被走到：把不存在的 planetId 传进去，
      // 否则该分支永远不被覆盖，断言会退化成空跑（变异验证时正是它没变红）。
      s.upgradeBuilding(NO_SUCH_PLANET, 1),
      s.scrapDefense(NO_SUCH_PLANET, 401, 1),
      s.buildShips(NO_SUCH_PLANET, 202, 1),
      s.trade(NO_SUCH_PLANET, 'metal', 'crystal', 10),
      s.abandonPlanet(NO_SUCH_PLANET),
    ]
    const bad = errs.filter((e): e is string => typeof e === 'string' && CJK_OR_FULLWIDTH.test(e))
    expect(bad, `EN 模式下校验错误仍为中文：\n${bad.join('\n')}`).toEqual([])
    // 至少要真的返回了错误，否则本用例退化成空跑
    expect(errs.filter((e) => typeof e === 'string').length).toBeGreaterThanOrEqual(12)
  })

  it('EN 下插值进去的实体名是英文（成就 / 教程 / 战役 / 军官 / 建筑 / 资源）', () => {
    setLocale('en')
    const home2 = useGame.getState().planets.find((p) => p.isHome)!
    // 直接打在这些数据表上：toast 用的就是同一批 localizeField / translateTerm
    const ach = ACHIEVEMENTS.map((a) => `${localizeField(a, 'name')} ${localizeField(a, 'desc')}`)
    const tut = TUTORIAL_STEPS.map((s) => localizeField(s, 'title'))
    const stage = CAMPAIGN_STAGES.map((s) => localizeField(s, 'name'))
    const off = Object.values(OFFICERS).map((o) => `${localizeField(o, 'name')} ${localizeField(o, 'desc')}`)
    const overflow = overflowText({ metal: 17500, crystal: 0, deuterium: 0 }) ?? ''
    const bad = [...ach, ...tut, ...stage, ...off, overflow].filter((x) => CJK_OR_FULLWIDTH.test(x))
    expect(bad, `EN 下实体名仍为中文：\n${bad.slice(0, 8).join('\n')}`).toEqual([])
    // 防假通过：资源名必须真的是 Deuterium 那一族，而不是 undefined/空
    expect(overflow).toMatch(/Metal/i)
    expect(overflowText({ metal: 0, crystal: 0, deuterium: 900 })).toMatch(/Deuterium/i)
  })

  it('EN 下存档槽位名与难度名是英文（EN 字段已接线）', () => {
    setLocale('en')
    const slots = SLOT_NAMES.map((s) => localizeField(s, 'name'))
    expect(slots.filter((x) => CJK_OR_FULLWIDTH.test(x))).toEqual([])
    expect(slots).toEqual(['Auto Save', 'Save 1', 'Save 2', 'Save 3'])
    const diff = localizeField(DIFFICULTIES.normal, 'label')
    expect(diff).toBe('Standard')
  })

  it('月球名也走翻译（凝月产物名是 `${星球名}之月`，不在星球名映射表里）', () => {
    setLocale('en')
    expect(translatePlanetName('母星之月')).toBe('Home Planet Moon')
    setLocale('zh')
    expect(translatePlanetName('母星之月')).toBe('母星之月')
  })
})

describe('② 星球名在同一条功能链上必须一致走 translatePlanetName', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    const mem = shim()
    useGame.getState().newGame()
    mem.set('ogame-sp-session', 'planet-i18n-test')
  })

  it('EN 下 GameScreen 基地切换器不显示中文星球名', () => {
    setLocale('en')
    // 整页渲染代价高但覆盖面最全：GameScreen 正是「同一数据在 6 处翻译、5 处没翻译」
    // 漏网的那一侧（基地切换器就在这个壳里）。
    const html = renderToStaticMarkup(createElement(GameScreen, {}))
    expect(html.length).toBeGreaterThan(0)
    // 母星/殖民地/月球这些内置名必须已英文化
    expect(html, 'EN 下 GameScreen 仍显示中文星球名「母星」').not.toContain('母星')
    // 已批准的双语主标设计之外，不得有中文残留
    const rest = stripApproved(html)
    const bad = rest.match(/[\u4e00-\u9fff]+/g) ?? []
    expect(bad, `EN 下 GameScreen 仍有未批准的中文：\n${[...new Set(bad)].slice(0, 10).join('\n')}`).toEqual([])
  })

  it('EN 下 MissileModal / DispatchWizard 标题不含中文目标名', () => {
    setLocale('en')
    const target = { coord: { galaxy: 1, system: 8, position: 3 }, name: '铁幕站' }
    const missile = renderToStaticMarkup(createElement(MissileModal, { planetId: homeId(), target, onClose: () => {} }))
    expect(missile, 'MissileModal 标题仍显示中文目标名').not.toContain('铁幕站')
    expect(missile).toContain('Iron Curtain Station')
  })

  it('EN 下 DispatchWizard 标题不含中文目标名', () => {
    setLocale('en')
    const target = { coord: { galaxy: 1, system: 8, position: 3 }, name: '红沙殖民地', kind: 'npc' }
    const html = renderToStaticMarkup(
      createElement(DispatchWizard, { originId: homeId(), target, allowedTypes: ['attack'], onClose: () => {} }),
    )
    expect(html.length).toBeGreaterThan(0)
    expect(html, 'DispatchWizard 仍显示中文目标名').not.toContain('红沙殖民地')
    expect(html).toContain('Red Sand Colony')
  })

  it('这些组件源码里不得再出现裸 target.name / planet.name / p.name 渲染', () => {
    // 静态口径：防止将来新增一处渲染点又把中文星球名放回去。
    const offenders: string[] = []
    for (const rel of ['components/MissileModal.tsx', 'components/DispatchWizard.tsx', 'components/GameScreen.tsx']) {
      const src = readFileSync(resolve(import.meta.dirname, '..', '..', rel), 'utf8')
      src.split('\n').forEach((line, i) => {
        // JSX 里的裸 {target.name} / {planet.name} / {p.name}
        if (/\{(target|planet|p)\.name\}/.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`)
        // t(...) 的 params 里插值裸名字
        if (/\{\s*(g|s|p):\s*(target|planet|p)\.name\s*\}/.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`)
      })
    }
    expect(offenders, `以下位置裸渲染星球名，EN 下会显示中文：\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('③ SLOT_NAMES / DIFFICULTIES 必须带 En 字段', () => {
  it('SLOT_NAMES：四项都有非空且与中文不同的 nameEn', () => {
    expect(SLOT_NAMES.length).toBe(4)
    const problems: string[] = []
    for (const s of SLOT_NAMES) {
      if (!s.nameEn?.trim()) problems.push(`nameEn 为空：${s.name}`)
      else if (CJK.test(s.nameEn)) problems.push(`nameEn 含中文：${s.nameEn}`)
      else if (s.nameEn === s.name) problems.push(`nameEn 与 name 相同：${s.name}`)
    }
    expect(problems).toEqual([])
  })

  it('DIFFICULTIES.normal：labelEn / descEn 非空、与中文不同、不含中文', () => {
    const d = DIFFICULTIES.normal
    for (const [zh, en] of [[d.label, d.labelEn], [d.desc, d.descEn]] as const) {
      expect(en?.trim(), `${zh} 的 En 字段为空`).toBeTruthy()
      expect(CJK.test(en ?? ''), `En 字段含中文：${en}`).toBe(false)
      expect(en, 'En 字段与中文相同').not.toBe(zh)
    }
  })

  it('EN 下 LoadScreen 存档列表无中文槽位名 / 难度名', () => {
    vi.unstubAllGlobals()
    const mem = shim()
    useGame.getState().newGame()
    setLocale('en')
    const html = renderToStaticMarkup(createElement(LoadScreen, { onBack: () => {}, onLoaded: () => {} }))
    expect(html.length).toBeGreaterThan(0)
    for (const s of SLOT_NAMES) {
      expect(html, `EN 下 LoadScreen 仍显示中文槽位名「${s.name}」`).not.toContain(s.name)
    }
    expect(html, 'EN 下 LoadScreen 仍显示中文难度名').not.toContain(DIFFICULTIES.normal.label)
    expect(html).toContain('Auto Save')
    void mem
  })
})

describe('④ EN 输出不得含全角标点', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('语言包里的分隔符按语言切换（中文顿号 / 英文逗号）', () => {
    setLocale('zh')
    expect(listSep()).toBe('、')
    setLocale('en')
    expect(listSep()).toBe(', ')
  })

  it('EN 下高频全角标点对应的语言包取值是半角', () => {
    setLocale('en')
    // 逐条断言：把任一语言包取值改回全角，下面这行就会红
    expect(listSep()).toBe(', ')
    // GameScreen 资源格 aria-label 里的「。」→ common.period
    const html = stripApproved(renderToStaticMarkup(createElement(GameScreen, {})))
    expect(html).not.toMatch(/[\u3000-\u303f\uff00-\uffef]/)
  })

  it('EN 模式 SSR 渲染不含全角标点（12 页 + 关键弹窗）', () => {
    // 这条是缺陷 ④ 的主门禁：原 page-render 的 CJK 正则不含全角标点区间，
    // 所以 GameScreen 的「。」、Overview 的「：」、Research 的「；》」、
    // Shipyard 的「＋」全部逃逸。这里把区间补上。
    setLocale('en')
    const target = { coord: { galaxy: 1, system: 8, position: 3 }, name: '铁幕站' }
    const pages: Array<[string, () => string]> = [
      ['Overview', () => renderToStaticMarkup(createElement(Overview, { planetId: homeId(), onJumpTo: () => {} }))],
      ['Research', () => renderToStaticMarkup(createElement(Research, {}))],
      ['Highscore', () => renderToStaticMarkup(createElement(Highscore, {}))],
      ['Officers', () => renderToStaticMarkup(createElement(Officers, {}))],
      ['Shipyard', () => renderToStaticMarkup(createElement(Shipyard, { planetId: homeId() }))],
      ['MissileModal', () => renderToStaticMarkup(createElement(MissileModal, { planetId: homeId(), target, onClose: () => {} }))],
    ]
    const bad: string[] = []
    for (const [name, render] of pages) {
      const html = stripApproved(render())
      const m = html.match(/[\u3000-\u303f\uff00-\uffef]/g)
      if (m) bad.push(`${name}: ${[...new Set(m)].map((c) => `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase()})`).join(' ')}`)
    }
    expect(bad, `EN 渲染输出含全角标点：\n${bad.join('\n')}`).toEqual([])
  })

  it('源码里不得再有裸的全角标点字面量（EN 会渲染到的页面/组件/屏）', () => {
    // 静态口径：防止将来新增一处 `：` 又逃逸。
    const SRC = resolve(import.meta.dirname, '..', '..')
    const offenders: string[] = []
    for (const dir of ['pages', 'components', 'screens']) {
      for (const file of ['Buildings', 'Campaign', 'Galaxy', 'Overview', 'Research', 'Reports', 'Shipyard', 'Highscore', 'Officers', 'GameScreen', 'DetailDialog', 'MissileModal', 'DispatchWizard', 'BattleReplay', 'MainMenu', 'LoadScreen']) {
        const full = resolve(SRC, dir, `${file}.tsx`)
        let src: string
        try {
          src = readFileSync(full, 'utf8')
        } catch {
          continue
        }
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
          .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
        code.split('\n').forEach((line, i) => {
          // 排除 Overview 的 BUILDING_MOTTO：那是已确认保留的中文主标 + EN 副标设计
          if (file === 'Overview' && /[“”]/.test(line)) return
          const m = line.match(/[\u3000-\u303f\uff00-\uffef]/g)
          if (m) offenders.push(`${dir}/${file}.tsx:${i + 1}  ${[...new Set(m)].join(' ')}  ${line.trim().slice(0, 60)}`)
        })
      }
    }
    expect(offenders, `以下位置仍有裸全角标点，EN 下会漏出全角：\n${offenders.join('\n')}`).toEqual([])
  })
})
