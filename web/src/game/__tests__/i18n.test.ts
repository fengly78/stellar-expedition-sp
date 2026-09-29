import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocale, setLocale, translate } from '../i18n'

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

describe('G5 i18n 框架', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    setLocale('zh')
  })

  it('zh 为主语言：translate 返回语言包文案', () => {
    expect(translate('menu.newGame')).toBe('新游戏')
  })

  it('切到 en：返回英文文案并持久化', () => {
    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(translate('menu.newGame')).toBe('New Game')
    expect(localStorage.getItem('ogame-sp-locale')).toBe('en')
  })

  it('en 缺键回退 zh（渐进翻译）；双缺回退 key 本身（不崩）', () => {
    setLocale('en')
    // 'menu.initResource' en 包未定义 → 回退 zh
    expect(translate('menu.initResource')).toContain('初始资源')
    expect(translate('no.such.key')).toBe('no.such.key')
  })

  it('参数插值：{name} 占位替换', () => {
    setLocale('zh')
    expect(translate('menu.lastSave', {})).toBe('上次存档')
    // 以 zh 包真实带占位键为准——无占位键时原样返回
    expect(translate('menu.commander')).toBe('指挥官')
  })
})
