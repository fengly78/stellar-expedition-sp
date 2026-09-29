import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILD_SLOTS, SHIP_SLOTS, RESEARCH_SLOTS, useGame } from '../state'

// 回归：槽位数在三处口径必须一致（2026-09-28）
//
// 成因记录：SHIP_SLOTS 抽常量之前，UI 渲染 3 条线程并以 3 禁用按钮，
// 而 store 的 buildShips 放行到 5 条——多出的 2 条玩家永远看不到（幽灵队列）。
// 科研这边当时也有同样的隐患：判定、UI 的 "/2" 文案、线程渲染是三处散落的裸数字。
//
// 本测试把「同一语义只有一处数字」锁住：任一处漏改都会失败。

const SRC = resolve(__dirname, '..', '..')

// newGame() 会走 writeSlot -> localStorage，node 环境需 shim
function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
}

const state = readFileSync(resolve(SRC, 'game/state.ts'), 'utf8')
const research = readFileSync(resolve(SRC, 'pages/Research.tsx'), 'utf8')
const shipyard = readFileSync(resolve(SRC, 'pages/Shipyard.tsx'), 'utf8')
const buildings = readFileSync(resolve(SRC, 'pages/Buildings.tsx'), 'utf8')

describe('槽位常量单一来源', () => {
  it('三个常量都是正整数', () => {
    for (const [name, v] of [['BUILD_SLOTS', BUILD_SLOTS], ['SHIP_SLOTS', SHIP_SLOTS], ['RESEARCH_SLOTS', RESEARCH_SLOTS]] as const) {
      expect(Number.isInteger(v), `${name} 不是整数`).toBe(true)
      expect(v, `${name} 应 > 0`).toBeGreaterThan(0)
    }
  })

  it('state.ts 的判定全部引用常量，无裸数字', () => {
    expect(state).toMatch(/researchQueue\.length >= RESEARCH_SLOTS/)
    expect(state).toMatch(/buildingQueue\.length >= BUILD_SLOTS/)
    expect(state).toMatch(/shipQueue\.length >= SHIP_SLOTS/)
    // 不应再有这三处的裸数字判定
    expect(state).not.toMatch(/researchQueue\.length >= \d/)
    expect(state).not.toMatch(/buildingQueue\.length >= \d/)
    expect(state).not.toMatch(/shipQueue\.length >= \d/)
  })

  it('Research 页不再硬编码线程数', () => {
    expect(research).toMatch(/import \{ RESEARCH_SLOTS/)
    expect(research).toMatch(/\{researchQueue\.length\}\/\{RESEARCH_SLOTS\}/)
    expect(research).toMatch(/Array\.from\(\{ length: RESEARCH_SLOTS \}/)
    expect(research).not.toMatch(/\[0, 1\]\.map\(\(slot\)/)
  })

  it('Shipyard 页线程渲染由 SHIP_SLOTS 驱动', () => {
    expect(shipyard).toMatch(/Array\.from\(\{ length: SHIP_SLOTS \}/)
    expect(shipyard).toMatch(/shipQueue\.length >= SHIP_SLOTS/)
    expect(shipyard).not.toMatch(/shipQueue\.length >= \d/)
  })

  it('Buildings 页队列判定由 BUILD_SLOTS 驱动', () => {
    expect(buildings).toMatch(/buildingQueue\.length >= BUILD_SLOTS/)
    expect(buildings).toMatch(/import \{ BUILD_SLOTS/)
  })

  it('科研线程数与实验室等级无关（已记录为明确设计决定）', () => {
    // 实验室只影响 canResearch 与 researchTime，不影响线程数。
    // 若将来要对齐经典 OGame（Lv.N = N 个位），本测试会提醒同步 Research.tsx。
    expect(RESEARCH_SLOTS).toBe(2)
  })

  it('实际行为：科研最多排 RESEARCH_SLOTS 项', () => {
    vi.unstubAllGlobals()
    localStorageShim()
    // 起一个真存档，连排到超过上限，第 N+1 项必须被拒
    useGame.getState().newGame()
    const home = useGame.getState().planets.find((p) => p.isHome)!
    const lab = { ...home, buildings: { ...home.buildings, 31: 12 }, resources: { metal: 1e12, crystal: 1e12, deuterium: 1e12 } }
    useGame.setState({ techs: {}, researchQueue: [], planets: [lab] })

    // 选四项互不依赖的科技：106 间谍 / 108 计算机 / 113 能源 / 115 燃烧（requires 均为空）
    const ids = [106, 108, 113, 115]
    const accepted = ids.filter((id) => useGame.getState().startResearch(id) === null)
    expect(accepted.length).toBe(RESEARCH_SLOTS)
    expect(useGame.getState().researchQueue.length).toBe(RESEARCH_SLOTS)
    // 超出部分必须被拒
    expect(useGame.getState().startResearch(117)).not.toBeNull()
  })
})
