/**
 * G5 i18n 框架（第一批）：零依赖轻量语言包 + React 绑定。
 *
 * 设计：
 * - 扁平点分 key（'menu.newGame'），zh 为主语言包，en 缺键回退 zh，再缺回退 key 本身（永不崩）。
 * - 语言持久化 localStorage 'ogame-sp-locale'（全局界面偏好，不随游戏存档）。
 * - useLocale() 用 useSyncExternalStore 订阅切换，切语言即时全局重渲染。
 * - 后续批次：逐页把硬编码文案换成 t()（键已按页面命名空间预留）。
 */
import { useSyncExternalStore } from 'react'
import { zh } from './locales/zh'
import { en } from './locales/en'
import { BUILDINGS, DEFENSES, SHIPS, TECHS } from './objects'

export type Locale = 'zh' | 'en'

const LOCALE_KEY = 'ogame-sp-locale'

const PACKS: Record<Locale, Record<string, string>> = { zh, en }

export const LOCALE_LABELS: { locale: Locale; label: string }[] = [
  { locale: 'zh', label: '中文' },
  { locale: 'en', label: 'English' },
]

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // ignore
  }
  return 'zh'
}

let current: Locale = initialLocale()
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale): void {
  if (locale === current) return
  current = locale
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // ignore
  }
  for (const fn of listeners) fn()
}

/** 翻译：params 以 {name} 占位插值。缺键回退 zh → key。 */
export function translate(key: string, params?: Record<string, string | number>): string {
  const raw = PACKS[current][key] ?? PACKS.zh[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 术语表：四表按 id 取定义。术语走「术语表+文案」两层，不逐条 t()。 */
const TERM_TABLES = {
  ships: SHIPS,
  buildings: BUILDINGS,
  defenses: DEFENSES,
  techs: TECHS,
} as const

export type TermTable = keyof typeof TERM_TABLES

/**
 * 时长格式化（跟着语言走）。
 *
 * 原先由 objects.ts 的 fmtTime 承担，但它把「时/分/秒」写死成中文，
 * 而 objects.ts 又被 i18n.ts 引用（术语表），没法反向 import translate——
 * 结果 EN 模式下每一处建造/研究/造舰/任务倒计时都显示中文单位。
 * 格式化依赖语言包，所以放在这一层；调用方改用 formatDuration。
 * fmtTime 已随之删除（零引用），避免留下一个会被误 import 而静默复活该缺陷的陷阱。
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return translate('common.timeHour', { h, m })
  if (m > 0) return translate('common.timeMinute', { m, s: sec })
  return translate('common.timeSecond', { s: sec })
}

/** 跨表查找顺序：前置条件可能指向建筑或科技，战报可能指向舰船或防御。 */
const TERM_SEARCH: TermTable[] = ['buildings', 'techs', 'ships', 'defenses']

/**
 * 术语翻译：zh 返回 name，en 返回 nameEn；缺 nameEn 或 id 不存在时回退 name，
 * 再回退 id 本身（与 translate 同语义，永不崩、永不显示 undefined）。
 */
export function translateTerm(id: number, table: TermTable): string {
  const def = TERM_TABLES[table][id] as { name?: string; nameEn?: string } | undefined
  if (!def) return String(id)
  if (current === 'zh') return def.name ?? String(id)
  return def.nameEn ?? def.name ?? String(id)
}

/**
 * 跨表术语翻译：按 TERM_SEARCH 顺序找第一个命中的定义。
 * 全部未命中时返回 null，由调用点决定兜底文案（各页兜底不同，故不内置）。
 */
export function findTerm(id: number, table?: TermTable): string | null {
  const order = table ? [table, ...TERM_SEARCH.filter((x) => x !== table)] : TERM_SEARCH
  for (const tbl of order) {
    const def = TERM_TABLES[tbl][id] as { name?: string; nameEn?: string } | undefined
    if (!def) continue
    if (current === 'zh') return def.name ?? null
    return def.nameEn ?? def.name ?? null
  }
  return null
}

/** React 绑定：语言切换后使用 t() / term() 的组件自动重渲染。 */
export function useLocale(): {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
  term: (id: number, table: TermTable) => string
  findTerm: (id: number, table?: TermTable) => string | null
} {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  return { locale, setLocale, t: translate, term: translateTerm, findTerm }
}

/**
 * 内置星球名 → 英文。走映射而不是往存档里塞 nameEn：
 * 改存档结构要动迁移链，而玩家自己重命名的星球本来就不该被翻译
 * （那是用户输入）。命不中映射就原样返回。
 */
const PLANET_NAME_EN: Record<string, string> = {
  '母星': 'Home Planet',
  '废弃前哨': 'Abandoned Outpost',
  '红沙殖民地': 'Red Sand Colony',
  '铁幕站': 'Iron Curtain Station',
  '静默之环': 'Silent Ring',
  '焦土基地': 'Scorched Base',
  '远星哨站': 'Far Star Outpost',
  '殖民地': 'Colony',
}

/**
 * 凝月产物的名字是 `${星球名}之月`（state.ts 的 spawnMoonFromDebris），
 * 落不到 PLANET_NAME_EN 任何一条上——月球会随母星一起出现在基地切换器里，
 * 于是在 EN 下整颗月球都是中文。拆掉后缀查表再补本地化后缀。
 */
const MOON_SUFFIX_ZH = '之月'

export function translatePlanetName(name: string): string {
  if (current === 'zh') return name
  if (name.endsWith(MOON_SUFFIX_ZH)) {
    const base = name.slice(0, -MOON_SUFFIX_ZH.length)
    const baseEn = PLANET_NAME_EN[base]
    if (baseEn) return `${baseEn}${translate('common.moonOf')}`
  }
  return PLANET_NAME_EN[name] ?? name
}

/**
 * 内容表实体的字段本地化：成就 / 教程 / 战役关卡 / 军官都带 `nameEn`/`descEn`。
 *
 * 为什么不逐个写 translateTerm：术语表只覆盖 BUILDINGS/SHIPS/DEFENSES/TECHS 四张表，
 * 而成就、教程、关卡、军官是四张**独立的**数据表，键也不在这四张表里。
 * 这里取「zh 用 base 字段、en 用 En 字段，缺 En 字段回退 base」这一条口径，
 * 与 translateTerm 语义一致（永不崩、永不显示 undefined）。
 */
export function localizeField(
  def: { name?: string; nameEn?: string; label?: string; labelEn?: string; desc?: string; descEn?: string; title?: string; titleEn?: string } | undefined,
  field: 'name' | 'label' | 'desc' | 'title',
): string {
  if (!def) return ''
  const base = def[field]
  if (current === 'zh') return base ?? ''
  const en = def[`${field}En`]
  return en ?? base ?? ''
}

/** 列表分隔符：中文顿号 / 英文逗号。硬编码 `、` 会让 EN 输出带全角标点。 */
export function listSep(): string {
  return translate('common.listSep')
}
