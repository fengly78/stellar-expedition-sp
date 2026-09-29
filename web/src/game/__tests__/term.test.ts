import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findTerm, getLocale, setLocale, translateTerm } from '../i18n'
import { BUILDINGS, DEFENSES, SHIPS, TECHS } from '../objects'

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

describe('术语层 translateTerm / findTerm', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    localStorageShim()
    setLocale('zh')
  })

  it('zh 返回 name，en 返回 nameEn', () => {
    expect(translateTerm(204, 'ships')).toBe(SHIPS[204].name)
    setLocale('en')
    expect(translateTerm(204, 'ships')).toBe(SHIPS[204].nameEn)
    expect(translateTerm(1, 'buildings')).toBe('Metal Mine')
    expect(translateTerm(402, 'defenses')).toBe('Light Laser')
    expect(translateTerm(113, 'techs')).toBe('Energy Technology')
  })

  it('id 不存在时回退 id 本身，永不返回 undefined', () => {
    expect(translateTerm(999999, 'ships')).toBe('999999')
    expect(translateTerm(999999, 'techs')).toBe('999999')
  })

  it('findTerm 跨表命中：前置条件可能指向建筑也可能指向科技', () => {
    // 21 = 船坞（建筑），115 = 燃烧引擎（科技），204 = 轻型战斗机（舰船）
    expect(findTerm(21)).toBe('船坞')
    expect(findTerm(115)).toBe('燃烧引擎')
    expect(findTerm(204)).toBe('轻型战斗机')
    setLocale('en')
    expect(findTerm(21)).toBe('Shipyard')
    expect(findTerm(115)).toBe('Combustion Drive')
  })

  it('findTerm 全表未命中时返回 null，交调用点兜底', () => {
    expect(findTerm(999999)).toBeNull()
  })

  it('四表 nameEn 全覆盖且非空（防漏译）', () => {
    for (const [id, def] of Object.entries(SHIPS)) {
      expect(def.nameEn, `SHIPS ${id}`).toBeTruthy()
    }
    for (const [id, def] of Object.entries(BUILDINGS)) {
      expect(def.nameEn, `BUILDINGS ${id}`).toBeTruthy()
    }
    for (const [id, def] of Object.entries(DEFENSES)) {
      expect(def.nameEn, `DEFENSES ${id}`).toBeTruthy()
    }
    for (const [id, def] of Object.entries(TECHS)) {
      expect(def.nameEn, `TECHS ${id}`).toBeTruthy()
    }
  })

  it('语言切换后 term 立即反映新语言包（不缓存旧值）', () => {
    const before = translateTerm(207, 'ships')
    setLocale('en')
    const after = translateTerm(207, 'ships')
    expect(before).not.toBe(after)
    expect(getLocale()).toBe('en')
  })
})
