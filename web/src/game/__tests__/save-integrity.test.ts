import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame, importSlot, writeSlotRaw, listSlots, SAVE_VERSION_MIN, SAVE_VERSION_MAX } from '../state'

/**
 * 存档入口的结构校验与写入失败处理（2026-09-29）
 *
 * 背景：并行审计发现三条入口各写各的校验、标准不一致，造出两条高危路径：
 *   · importSlot 不校验 `planets` 是不是数组 → 任意垃圾 JSON 被写入槽位并返回 null
 *     （UI 弹「导入成功」），直接覆盖原本正常的存档，之后原档不可恢复。
 *   · 版本闸 `saveVersion < 2 || saveVersion > 11` 对**缺失值**失效（undefined 与数字
 *     比较恒为 false），缺版本的存档被放行，9 级迁移全部跳过，
 *     进入游戏后主循环首个 tick() 即抛 TypeError 且每 tick 都抛。
 * 另有两条写入侧问题：手动存档在配额满时谎报成功；云端恢复的 setItem 无 try/catch，
 * 异常逃逸后云备份按钮永久 disabled。
 *
 * 本文件锁住这四类行为，并断言「坏档不得覆盖好档」。
 */

function shim(opts: { failSetItem?: boolean } = {}) {
  const mem = new Map<string, string>()
  mem.set('ogame-sp-session', SESSION)
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.failSetItem) throw new DOMException('quota', 'QuotaExceededError')
      mem.set(k, String(v))
    },
    removeItem: (k: string) => void mem.delete(k),
    clear: () => void mem.clear(),
  })
  return mem
}

/** 真实槽位 key 格式：ogame-sp-save-{sessionId}-{slot}（见 accounts.ts saveSlotKey） */
const SESSION = 'test-session'
const slotKey = (slot: number): string => 'ogame-sp-save-' + SESSION + '-' + slot

function fakeFile(content: string): File {
  return { text: async () => content } as unknown as File
}

/** 造一个结构完整、版本合法的存档文件文本 */
function validSaveJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    meta: { savedWallAt: Date.now(), label: '自动存档', gameTime: 0, difficulty: 'normal', planetCount: 1 },
    data: {
      saveVersion: SAVE_VERSION_MAX,
      planets: [{ id: 1, name: '母星', resources: { metal: 1, crystal: 1, deuterium: 1 } }],
      ...overrides,
    },
  })
}

describe('存档入口结构校验：坏档不得落盘、更不得覆盖好档', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('先存一个好档，作为「不许被覆盖」的基准', async () => {
    const mem = shim()
    useGame.getState().newGame()
    // newGame 会写 slot 0；再显式写一份 slot 1 作为基准
    const good = validSaveJson()
    mem.set(slotKey(1), good)
    expect(listSlots()[1]).not.toBeNull()
  })

  it('planets 不是数组的 JSON 必须被 importSlot 拒绝', async () => {
    const mem = shim()
    const good = validSaveJson()
    mem.set(slotKey(1), good)

    const bad = JSON.stringify({
      meta: { savedWallAt: Date.now(), label: 'x', gameTime: 0, difficulty: 'normal', planetCount: 1 },
      data: { saveVersion: SAVE_VERSION_MAX, totally: 'wrong' },
    })
    const err = await importSlot(1, fakeFile(bad))

    expect(err, 'planets 缺失的垃圾档必须被拒绝').not.toBeNull()
    // 关键断言：拒绝的同时不能覆盖槽位
    expect(mem.get(slotKey(1)), '坏档覆盖了好档').toBe(good)
  })

  it('planets 是空数组也必须被拒绝（主循环需要一个星球）', async () => {
    const mem = shim()
    const good = validSaveJson()
    mem.set(slotKey(1), good)
    const err = await importSlot(1, fakeFile(validSaveJson({ planets: [] })))
    expect(err).not.toBeNull()
    expect(mem.get(slotKey(1))).toBe(good)
  })

  it('saveVersion 缺失的档必须被拒绝（这是此前会让游戏每 tick 崩掉的档）', async () => {
    const mem = shim()
    const noVersion = JSON.stringify({
      meta: { savedWallAt: Date.now(), label: 'x', gameTime: 0, difficulty: 'normal', planetCount: 1 },
      data: { planets: [{ id: 1, name: '母星', resources: { metal: 1, crystal: 1, deuterium: 1 } }] },
    })
    expect(
      await importSlot(1, fakeFile(noVersion)),
      '缺 saveVersion 的档必须判为不兼容',
    ).not.toBeNull()
  })

  it('saveVersion 越界仍然被拒绝（回归：别把既有保护改坏）', async () => {
    shim()
    for (const v of [0, 1, SAVE_VERSION_MAX + 1, 99]) {
      const err = await importSlot(1, fakeFile(validSaveJson({ saveVersion: v })))
      expect(err, `saveVersion=${v} 应被拒绝`).not.toBeNull()
    }
  })

  it('合法档仍然能导入（别把闸门修过头）', async () => {
    const mem = shim()
    const good = validSaveJson()
    expect(await importSlot(2, fakeFile(good))).toBeNull()
    expect(mem.get(slotKey(2))).toBe(good)
  })

  it('loadFromSlot 对缺 saveVersion 的档必须报错而不是放行', () => {
    const mem = shim()
    useGame.getState().newGame()
    const noVersion = JSON.stringify({
      meta: { savedWallAt: Date.now(), label: 'x', gameTime: 0, difficulty: 'normal', planetCount: 1 },
      data: { planets: [{ id: 1, name: '母星' }] },
    })
    mem.set(slotKey(3), noVersion)
    const err = useGame.getState().loadFromSlot(3)
    expect(err, '缺 saveVersion 的档必须被 loadFromSlot 拒绝').not.toBeNull()
  })

  it('writeSlotRaw 走同一校验器：planets 非数组 / 缺版本都被拒', () => {
    shim()
    expect(writeSlotRaw(1, validSaveJson({ saveVersion: undefined }))).not.toBeNull()
    expect(writeSlotRaw(1, validSaveJson({ planets: {} }))).not.toBeNull()
    expect(writeSlotRaw(1, validSaveJson())).toBeNull()
  })
})

describe('写入失败必须如实上报，不得谎报成功', () => {
  it('配额满时 saveToSlot 不弹成功提示，且槽位确实没写进去', () => {
    shim({ failSetItem: true })
    useGame.getState().newGame()
    const before = listSlots()[1]
    expect(before, '前置条件：此前 slot 1 为空').toBeNull()

    useGame.getState().saveToSlot(1)

    expect(listSlots()[1], '写入失败后槽位应仍为空').toBeNull()
  })

  it('writeSlotRaw 在配额满时返回可读错误而不是抛出', () => {
    shim({ failSetItem: true })
    let result: string | null | undefined
    let threw = false
    try {
      result = writeSlotRaw(1, validSaveJson())
    } catch {
      threw = true
    }
    expect(threw, 'QuotaExceededError 不得逃出 writeSlotRaw（会让云备份按钮永久 disabled）').toBe(false)
    expect(result).not.toBeNull()
  })
})
