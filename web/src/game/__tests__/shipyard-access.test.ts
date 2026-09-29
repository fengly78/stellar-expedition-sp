import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SHIP_SLOTS, BUILD_SLOTS } from '../state'

// 回归：玩家找不到造船入口（2026-09-28 试玩发现 P1）
//
// 三个缺陷叠加，导致新手完全无法造船：
//   1. 底栏「防御」tab 打开的是船坞页（Shipyard），且传 defaultFamily="defense"
//      ——打开就停在防御标签，而早期一个防御都造不出（前置要建筑/科技），
//      按钮恒灰，表现为「不能建造」
//   2. 真正名为「舰队」的 tab（Fleet.tsx）是派遣页，完全没有造船入口
//   3. 船坞页在导航里被标为「防御」而非「船坞」，玩家找不到它
//
// 修复：底栏改名 nav.shipyard + defaultFamily="ships"；Fleet 页加 onGoShipyard 出口。

// 测试文件在 src/game/__tests__/，源码在 src/ 下，故上溯两级
const SRC = resolve(__dirname, '..', '..')

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

describe('造船入口可达性', () => {
  const gameScreen = read('components/GameScreen.tsx')
  const fleet = read('pages/Fleet.tsx')

  it('底栏船坞 tab 用 defaultFamily="ships"（打开就是造船，不是防御）', () => {
    expect(gameScreen).toMatch(/<Shipyard[^>]*defaultFamily="ships"/)
    expect(gameScreen).not.toMatch(/<Shipyard[^>]*defaultFamily="defense"/)
  })

  it('底栏标签是 nav.shipyard 而不是 nav.defense', () => {
    expect(gameScreen).toMatch(/key:\s*'shipyard',\s*label:\s*'nav\.shipyard'/)
    expect(gameScreen).not.toMatch(/label:\s*'nav\.defense'/)
  })

  it('Fleet 页接受并提供去船坞的出口', () => {
    expect(fleet).toMatch(/onGoShipyard/)
    expect(gameScreen).toMatch(/<Fleet[^>]*onGoShipyard/)
  })

  it('Fleet 页的船坞状态是实算的，不再是静态「已连接」假数据', () => {
    // 真实读取船坞等级与舰船数
    expect(fleet).toMatch(/buildings\[21\]/)
    expect(fleet).toMatch(/planet\.ships/)
  })

  it('船坞产线上限两端一致（消除 3 vs 5 的幽灵队列）', () => {
    const shipyard = read('pages/Shipyard.tsx')
    const state = read('game/state.ts')
    // 两端都必须引用 SHIP_SLOTS 常量，不再各自硬编码
    expect(shipyard).toMatch(/SHIP_SLOTS/)
    expect(state).toMatch(/planet\.shipQueue\.length >= SHIP_SLOTS/)
    expect(shipyard).not.toMatch(/shipQueue\.length >= \d/)
    expect(SHIP_SLOTS).toBeGreaterThan(0)
  })

  it('建筑槽位与船坞槽位都是明确常量', () => {
    expect(BUILD_SLOTS).toBe(3)
    expect(SHIP_SLOTS).toBe(3)
  })
})
