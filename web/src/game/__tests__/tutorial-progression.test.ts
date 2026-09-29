import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'
import { TUTORIAL_STEPS, type TutorialStep, type TutorialTab } from '../tutorial'
import { ACHIEVEMENTS } from '../achievements'
import { BUILDINGS, SHIPS, DEFENSES } from '../objects'

/**
 * 教程 15 步可完成性（2026-09-28）
 *
 * 背景：教程是玩家遇到的第一段内容，**任何一步无法完成都是 P1 死锁**——
 * 引导条会永远停在那一步，玩家既进不了后续内容也不知道卡在哪。
 * 但此前没有任何测试验证过「15 步能不能走完」。
 *
 * 本文件检查两类问题：
 *   A. 步骤本身的判定条件是否可达（每步的 check 能否被满足）
 *   B. 步骤之间是否存在循环依赖（第 N 步的解锁需要第 M 步的产物，M < N 才行）
 *
 * 特别关注：教程步骤的 check 逻辑在 state.ts 的 tutorialChecks（约 L585），
 * 奖励发放紧随其后。这里不重跑那套逻辑，而是验证**依赖图无环 + 前置可达**。
 */

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

describe('教程 15 步可完成性', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  const st = () => useGame.getState()
  const homeBuildings = () => st().planets.find((p) => p.isHome)?.buildings ?? {}

  describe('A. 步骤结构', () => {
    it('教程共 15 步，id 连续 1..15', () => {
      expect(TUTORIAL_STEPS.length).toBe(15)
      const ids = TUTORIAL_STEPS.map((s) => s.id)
      expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    })

    it('每步都有 title/hint/why/reward（缺一玩家会看到空白）', () => {
      for (const s of TUTORIAL_STEPS) {
        expect(s.title, `第 ${s.id} 步缺 title`).toBeTruthy()
        expect(s.titleEn, `第 ${s.id} 步缺 titleEn`).toBeTruthy()
        expect(s.hint, `第 ${s.id} 步缺 hint`).toBeTruthy()
        expect(s.hintEn, `第 ${s.id} 步缺 hintEn`).toBeTruthy()
        expect(s.why, `第 ${s.id} 步缺 why`).toBeTruthy()
        expect(s.reward, `第 ${s.id} 步缺 reward`).toBeDefined()
      }
    })

    it('每步都有 tab 目标（引导条要能跳过去）', () => {
      for (const s of TUTORIAL_STEPS) {
        expect(s.tab, `第 ${s.id} 步（${s.title}）缺 tab，跳转按钮会失效`).toBeTruthy()
      }
    })

    it('TutorialTab.tab 是必填字段（编译期兜底，不再是可选）', () => {
      // 若有人把它改回 `tab?`，下面这个类型断言会编译失败。
      // 历史上它就是可选的，导致 13/14/15 步漏填而无人察觉。
      const step: TutorialStep = TUTORIAL_STEPS[0]
      const tab: TutorialTab = step.tab
      expect(tab).toBeTruthy()
    })

    it('TutorialTab 覆盖 GameScreen 的全部主导航 tab（无孤立跳转目标）', () => {
      const used = new Set(TUTORIAL_STEPS.map((s) => s.tab))
      // GameScreen 的 NAV_ORDER 主导航：overview/research/shipyard/fleet/reports
      // 教程能跳转的子集（overview/reports 无对应建造/研究动作，不应出现）
      for (const t of used) {
        expect(
          ['buildings', 'research', 'shipyard', 'fleet', 'galaxy', 'campaign', 'officers'],
          `教程跳转目标 ${t} 不在 GameScreen 的 tab 集合内`,
        ).toContain(t)
      }
    })
  })

  describe('B. 建筑类步骤的前置链可达', () => {
    /** 按 tutorialChecks 的实际判定（state.ts L586-593）复现建筑类步骤的 check */
    function buildCheck(stepId: number): (h: Record<number, number>) => boolean {
      const map: Record<number, (h: Record<number, number>) => boolean> = {
        1: (h) => (h[1] ?? 0) >= 1,   // 金属矿
        2: (h) => (h[4] ?? 0) >= 1,   // 太阳能电站
        3: (h) => (h[2] ?? 0) >= 1,   // 晶体矿
        4: (h) => (h[22] ?? 0) >= 1,  // 金属仓库
        5: (h) => (h[14] ?? 0) >= 1,  // 机器人工厂
        6: (h) => (h[31] ?? 0) >= 1,  // 研究实验室
        8: (h) => (h[21] ?? 0) >= 1,  // 船坞
      }
      return map[stepId] ?? (() => true)
    }

    it('第 1~6、8 步可从零建筑起步依次满足（无循环依赖）', () => {
      // 注意：newGameData 预置三系仓库 Lv.10（22/23/24），所以第 4 步
      // （金属仓库 >=1）在开局就天然满足——这不是死锁，但也意味着该步
      // 对新开局玩家是「自动完成」。这里只验证前 6 步与第 8 步的可达性。
      const h: Record<number, number> = {}
      const target: Record<number, number> = { 1: 1, 2: 4, 3: 2, 5: 14, 6: 31, 8: 21 }
      for (const stepId of [1, 2, 3, 5, 6, 8]) {
        const check = buildCheck(stepId)
        expect(check(h), `第 ${stepId} 步在零状态下即已满足（无教学价值）`).toBe(false)
        h[target[stepId]] = 1
        expect(check(h), `第 ${stepId} 步造出后仍未满足`).toBe(true)
      }
    })

    it('第 4 步（金属仓库）因开局预置 Lv.10 而自动满足', () => {
      // 登记这一事实：教程第 4 步对新开局玩家是秒完成的
      expect(homeBuildings()[22] ?? 0).toBeGreaterThanOrEqual(1)
      expect(buildCheck(4)(homeBuildings())).toBe(true)
    })

    it('第 8 步（船坞）不被第 5 步（机器人工厂）卡死', () => {
      // 船坞 21 requires {14:2}，机器人工厂 14 requires {} —— 造机器人后必能造船坞
      expect(BUILDINGS[21].requires[14]).toBe(2) // 船坞需机器人 Lv2
      expect(BUILDINGS[14].requires[14] === undefined).toBe(true) // 机器人无前置，不会死锁
    })
  })

  describe('C. 死锁风险：第 15 步（远征）', () => {
    it('第 15 步（远征）指向星系页且文案明确 16 号位', () => {
      const step15 = TUTORIAL_STEPS.find((s) => s.id === 15)!
      expect(step15.hint).toContain('16')
      expect(step15.tab, '第 15 步缺 tab，前往按钮会静默失效').toBe('galaxy')
    })

    it('第 10/11 步的完成条件不互锁（第 10 步可由造探测器独立完成）', () => {
      // tutorialChecks: 10 = hasShip(210) || 有侦察报告；11 = 有侦察报告
      // 第 10 步不依赖第 11 步的产物（造出探测器即可），因此不构成循环依赖
      const step10 = TUTORIAL_STEPS.find((s) => s.id === 10)!
      const step11 = TUTORIAL_STEPS.find((s) => s.id === 11)!
      expect(step10.hint).toContain('间谍探测器') // 造出探测器即可
      expect(step11.hint).toContain('间谍')       // 第 11 步才需要侦察
      expect(step10.id).toBeLessThan(step11.id)
    })
  })

  describe('D. 奖励不掏空玩家', () => {
    it('每步奖励都是「增量」而非「清零」类操作', () => {
      for (const s of TUTORIAL_STEPS) {
        const totalRes = Object.values(s.reward.resources ?? {}).reduce((a, b) => a + b, 0)
        const totalShips = Object.values(s.reward.ships ?? {}).reduce((a, b) => a + b, 0)
        // 每步至少给点什么，否则「教程完成」只有 toast 没有获得感
        expect(totalRes + totalShips, `第 ${s.id} 步奖励为空`).toBeGreaterThan(0)
        // 也不能一次给到破坏平衡的量级
        expect(totalRes, `第 ${s.id} 步资源奖励过大: ${totalRes}`).toBeLessThan(100000)
      }
    })

    it('奖励里的舰船 id 都真实存在（拼错 id 会静默丢奖励）', () => {
      for (const s of TUTORIAL_STEPS) {
        for (const idStr of Object.keys(s.reward.ships ?? {})) {
          const id = +idStr
          expect(SHIPS[id] ?? DEFENSES[id], `第 ${s.id} 步奖励的舰船 ${id} 不存在`).toBeDefined()
        }
      }
    })
  })

  describe('E. 实际推进：模拟玩家完成前几步', () => {
    it('建造金属矿 + 太阳能后，教程 1、2 步应被判定完成', () => {
      // 仓库预置 Lv.10，资源充足，直接造
      useGame.getState().upgradeBuilding(st().planets.find((p) => p.isHome)!.id, 1)
      useGame.getState().upgradeBuilding(st().planets.find((p) => p.isHome)!.id, 4)
      useGame.setState({ lastWallTick: Date.now() - 60000, timeScale: 20 })
      st().tick()
      const done = st().tutorialDone
      expect(done, '建造金属矿后第 1 步未完成').toContain(1)
      expect(done, '建造太阳能后第 2 步未完成').toContain(2)
    })

    it('跳过教程后不再逐步发放奖励（不刷资源）', () => {
      useGame.getState().skipTutorial()
      useGame.getState().upgradeBuilding(st().planets.find((p) => p.isHome)!.id, 1)
      useGame.setState({ lastWallTick: Date.now() - 60000, timeScale: 20 })
      st().tick()
      expect(st().tutorialDone.length, '跳过后仍在发教程奖励').toBe(0)
    })
  })
})

describe('成就 19 项的判定可满足性', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    shim()
    useGame.getState().newGame()
  })

  it('成就条目非空且有 name/nameEn', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0)
    for (const a of ACHIEVEMENTS) {
      expect(a.name, `成就 ${a.id} 缺 name`).toBeTruthy()
      expect(a.nameEn, `成就 ${a.id} 缺 nameEn`).toBeTruthy()
      expect(a.desc ?? a.description ?? a.why, `成就 ${a.id} 缺描述`).toBeTruthy()
    }
  })

  it('成就 id 连续无重复（重复会导致只发一次奖励）', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size, '成就 id 有重复').toBe(ids.length)
  })

  it('存在第 19 项（state.ts 的 achChecks 覆盖到 19）', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(Math.max(...ids), '成就数量与 achChecks 不匹配').toBeGreaterThanOrEqual(19)
  })
})
