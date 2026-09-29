import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDuration, setLocale, translate, translatePlanetName } from '../i18n'

/**
 * i18n 层纯函数的边界契约。
 *
 * 这两个函数此前零直接测试，只被 page-render 间接走到——
 * 而 page-render 断言的是「有没有中文」，恰恰无法发现「单位格式错了但没有中文」。
 * formatDuration 更是替换掉了一个写死中文单位的实现（EN 下每处时长都是中文），
 * 属于一旦回退就会静默复发 P1 的位置，所以需要把边界钉死。
 */

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

describe('formatDuration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    setLocale('zh')
  })

  it('中文：时/分/秒的切分与旧实现逐字一致', () => {
    expect(formatDuration(0)).toBe('0秒')
    expect(formatDuration(1)).toBe('1秒')
    expect(formatDuration(59)).toBe('59秒')
    expect(formatDuration(60)).toBe('1分0秒')
    expect(formatDuration(61)).toBe('1分1秒')
    expect(formatDuration(3599)).toBe('59分59秒')
    // 与旧 fmtTime 同语义：有小时就只显示时+分，丢弃秒
    expect(formatDuration(3600)).toBe('1时0分')
    expect(formatDuration(3661)).toBe('1时1分')
  })

  it('英文：走 h/m/s，且不带中文', () => {
    setLocale('en')
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(59)).toBe('59s')
    expect(formatDuration(60)).toBe('1m 0s')
    expect(formatDuration(3600)).toBe('1h 0m')
  })

  it('两种语言的输出必须不同——这正是当初那个 P1 的判定条件', () => {
    setLocale('zh')
    const zh = formatDuration(3661)
    setLocale('en')
    const en = formatDuration(3661)
    expect(en).not.toBe(zh)
    expect(zh).toMatch(/[一-鿿]/)
    expect(en).not.toMatch(/[一-鿿]/)
  })

  it('负数与小数：向上取整到 0，不出现负号', () => {
    expect(formatDuration(-5)).toBe('0秒')
    expect(formatDuration(0.2)).toBe('1秒')
  })
})

describe('translatePlanetName', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    setLocale('zh')
  })

  it('中文下原样返回', () => {
    expect(translatePlanetName('母星')).toBe('母星')
    expect(translatePlanetName('红沙殖民地')).toBe('红沙殖民地')
  })

  it('英文下命中内置映射', () => {
    setLocale('en')
    expect(translatePlanetName('母星')).toBe('Home Planet')
    expect(translatePlanetName('红沙殖民地')).toBe('Red Sand Colony')
    expect(translatePlanetName('铁幕站')).toBe('Iron Curtain Station')
  })

  it('英文下未收录的名字原样透传——玩家自己命名的星球不该被翻译', () => {
    setLocale('en')
    expect(translatePlanetName('我的要塞')).toBe('我的要塞')
    expect(translatePlanetName('Alpha')).toBe('Alpha')
  })
})

describe('formatDuration 依赖的键', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
  })

  it('common.timeSecond / timeMinute / timeHour 在两侧语言包都存在', () => {
    setLocale('zh')
    for (const k of ['common.timeSecond', 'common.timeMinute', 'common.timeHour']) {
      expect(translate(k, { s: 1, m: 1, h: 1 }), `${k} 在 zh 缺失`).toMatch(/[1]/)
    }
    setLocale('en')
    for (const k of ['common.timeSecond', 'common.timeMinute', 'common.timeHour']) {
      expect(translate(k, { s: 1, m: 1, h: 1 }), `${k} 在 en 缺失`).toMatch(/[1]/)
    }
  })
})
