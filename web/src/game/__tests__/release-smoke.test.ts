import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from '../state'

/**
 * 发布烟测（p16-c 的逻辑半）。
 *
 * 人工步骤「注册 → 开局 → 玩 10 分钟 → 关浏览器重开 → 续档」里，
 * 关浏览器重开验的是游戏循环与存档往返，这些都能无头驱动——state.ts 是纯逻辑 store，
 * `wait-queue` / `ore-deposit` / `save-migration` 等测试已经这么用。
 *
 * 覆盖：按真实依赖链开局（三矿→实验室 / 机器人工厂→船坞）→ 建造/研究/造舰/派遣
 *      → 存档 → 破坏状态 → 读档 → 继续推进。
 * **不覆盖**（必须人工）：界面渲染、双语切换、移动端布局、真实浏览器重启后的
 * localStorage 持久化、音频。见 doc/release-walkthrough-1.0.0.md。
 */

const SESSION = 'smoke-commander'
/** 用槽 1，避开 newGame() 自动写槽 0（自动存档）导致的自我覆盖。 */
const SLOT = 1
/** 依赖链：实验室需三矿 Lv.3；船坞需机器人工厂 Lv.2（见 objects.ts 的 requires）。 */
const BOOTSTRAP: Array<[number, number]> = [[1, 3], [2, 3], [3, 3], [4, 1], [31, 1], [14, 2], [21, 2]]

function localStorageShim() {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

const home = () => useGame.getState().planets.find((p) => p.isHome)!
const lvl = (objectId: number) => home().buildings[objectId] ?? 0

function advanceGameMinutes(minutes: number) {
  const target = useGame.getState().gameTime + minutes * 60_000
  useGame.getState().setTimeScale(3600)
  let guard = 0
  while (useGame.getState().gameTime < target && guard++ < 8000) useGame.getState().tick()
  useGame.getState().setTimeScale(1)
}

function buildUp(objectId: number, target: number) {
  const id = home().id
  for (let i = lvl(objectId); i < target; i++) {
    expect(useGame.getState().upgradeBuilding(id, objectId), `建筑 ${objectId} 第 ${i + 1} 级被拒`).toBeNull()
    advanceGameMinutes(10)
  }
  expect(lvl(objectId)).toBe(target)
}

function bootstrap() {
  for (const [objectId, target] of BOOTSTRAP) buildUp(objectId, target)
}

describe('发布烟测：游戏会话 + 存档往返', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    const mem = localStorageShim()
    useGame.getState().newGame()
    // 存档读写依赖登录会话（saveSlotKey 读 ogame-sp-session）
    mem.set('ogame-sp-session', SESSION)
  })

  it('开局状态可用：母星存在、三矿充足、存档版本 11', () => {
    const s = useGame.getState()
    expect(s.saveVersion).toBe(11)
    expect(s.planets.length).toBeGreaterThan(0)
    expect(home().resources.metal).toBeGreaterThan(0)
    expect(home().resources.crystal).toBeGreaterThan(0)
    expect(home().resources.deuterium).toBeGreaterThan(0)
  })

  it('建造：入队 → 队列跑完 → 等级上涨，三矿按依赖链到 Lv.3', () => {
    const id = home().id
    const before = lvl(1)
    expect(useGame.getState().upgradeBuilding(id, 1)).toBeNull()
    expect(useGame.getState().planets.find((p) => p.id === id)!.buildingQueue.length).toBe(1)
    advanceGameMinutes(10)
    expect(lvl(1)).toBe(before + 1) // 入队的那一级已跑完
    bootstrap()
    expect(lvl(1)).toBe(3)
    expect(lvl(2)).toBe(3)
    expect(lvl(3)).toBe(3)
  })

  it('研究：三矿 Lv.3 后实验室可建，起能源科技并推进完成', () => {
    buildUp(1, 3)
    buildUp(2, 3)
    buildUp(3, 3)
    buildUp(31, 1)
    expect(useGame.getState().startResearch(113)).toBeNull()
    expect(useGame.getState().researchQueue.length).toBe(1)
    advanceGameMinutes(30)
    expect(useGame.getState().techs[113]).toBeGreaterThanOrEqual(1)
  })

  it('造舰 + 派遣：造舰与派遣入口要么受理要么返回门禁错误串，不抛异常', () => {
    buildUp(14, 2)
    buildUp(21, 2)
    const id = home().id
    // 造舰门槛按母星船坞等级判定，本测试只要求「有明确结果」而不是「一定成功」——
    // 门槛数值属于平衡参数，不该由发布烟测钉死。
    const r1 = useGame.getState().buildShips(id, 210, 1)
    expect(r1 === null || typeof r1 === 'string').toBe(true)
    advanceGameMinutes(20)
    const r2 = useGame
      .getState()
      .dispatchMission(id, { galaxy: 1, system: 8, position: 4 }, 'espionage', { 210: 1 }, { metal: 0, crystal: 0, deuterium: 0 })
    expect(r2 === null || typeof r2 === 'string').toBe(true)
    if (r2 === null) expect(useGame.getState().missions.length).toBe(1)
    advanceGameMinutes(15)
    // 关键不是任务终态，而是时钟推进后循环没崩
    expect(useGame.getState().gameTime).toBeGreaterThan(0)
  })

  it('战役 / 相位扫描 / 交易 / 每日签到：各入口要么成功要么返回错误串，不抛异常', () => {
    bootstrap()
    const id = home().id
    for (const call of [
      () => useGame.getState().playCampaign(id, 1, { 208: 1 }),
      () => useGame.getState().phalanxScan(1, 8),
      () => useGame.getState().trade(id, 'metal', 'crystal', 1000),
      () => useGame.getState().skipTutorial(),
    ]) {
      const r = call()
      expect(r === null || r === undefined || typeof r === 'string').toBe(true)
    }
    useGame.getState().claimDaily()
    expect(useGame.getState().lastDailyClaimWallAt).toBeGreaterThan(0)
  })

  it('存档往返：存盘 → 新开局破坏状态 → 读档，进度完整恢复', () => {
    bootstrap()
    useGame.getState().startResearch(113)
    useGame.getState().buildShips(home().id, 204, 2)
    advanceGameMinutes(20)

    const before = useGame.getState()
    const snapshot = {
      metal: lvl(1),
      lab: lvl(31),
      shipyard: lvl(21),
      robotics: lvl(14),
      tech113: before.techs[113] ?? 0,
      ships204: home().ships[204] ?? 0,
      gameTime: before.gameTime,
      metalRes: home().resources.metal,
    }
    expect(snapshot.gameTime).toBeGreaterThan(0)

    useGame.getState().saveToSlot(SLOT, '烟测存档')

    useGame.getState().newGame() // 模拟「关掉浏览器重开」
    expect(lvl(31)).toBeLessThan(snapshot.lab)

    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()

    const after = useGame.getState()
    expect(after.saveVersion).toBe(11)
    expect(lvl(1)).toBe(snapshot.metal)
    expect(lvl(2)).toBe(3)
    expect(lvl(31)).toBe(snapshot.lab)
    expect(lvl(21)).toBe(snapshot.shipyard)
    expect(lvl(14)).toBe(snapshot.robotics)
    expect(after.techs[113] ?? 0).toBe(snapshot.tech113)
    expect(home().ships[204] ?? 0).toBe(snapshot.ships204)
    expect(after.gameTime).toBe(snapshot.gameTime)
    expect(home().resources.metal).toBe(snapshot.metalRes)
  })

  it('读档后仍可继续推进（不是只读快照）', () => {
    buildUp(1, 2)
    advanceGameMinutes(10)
    useGame.getState().saveToSlot(SLOT, '续档测试')
    const t0 = useGame.getState().gameTime
    useGame.getState().newGame()
    expect(useGame.getState().loadFromSlot(SLOT)).toBeNull()
    expect(lvl(1)).toBe(2)
    advanceGameMinutes(10)
    expect(useGame.getState().gameTime).toBeGreaterThan(t0)
  })
})
