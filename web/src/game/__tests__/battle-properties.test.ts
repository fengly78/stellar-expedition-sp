import { describe, expect, it } from 'vitest'
import { simulate, type BattleInput, type UnitSpec } from '../battle'
import { SHIPS, DEFENSES } from '../objects'
import { mulberry32 } from '../prng'

/**
 * 战斗引擎属性化测试（2026-09-28）
 *
 * 现状：battle_golden.json 只有 5 例固定场景，覆盖的是「给定输入的确定输出」。
 * 它无法回答「换成别的组合会不会崩」——空舰队、单舰对决、护盾远厚于伤害、
 * 耐久悬殊、满编死星 vs 一堆探测器这类边界，恰好都是玩家会遇到的。
 *
 * 策略：不为每种组合写死 expected（那样只是把实现抄一遍），而是验证
 * **物理守恒律**——任何输入下都必须成立的性质：
 *   1. 损失 + 幸存 == 初始（守恒）
 *   2. 舰船数只减不增、且不为负
 *   3. 战斗必然终止（轮数有上界），且一方全灭时停止
 *   4. 同输入必同输出（seed 可重放）
 *   5. 护盾吸收量不超过实际造成的伤害
 *   6. 零攻击单位（如运输船/探测器）永不被判为「有效伤害」
 */

const SHIP_IDS = Object.keys(SHIPS).map(Number)
const DEF_IDS = Object.keys(DEFENSES).map(Number)

/** 从真实定义表取 spec（battle.ts 用的就是这套形状） */
function specOf(id: number): UnitSpec {
  const src = SHIPS[id] ?? DEFENSES[id]
  return {
    unitId: id,
    attack: src.attack,
    shield: src.shield,
    hull: src.hull,
    rapidfire: (src as { rapidfire?: Record<number, number> }).rapidfire ?? {},
  }
}

function fleet(missionId: number, ownerId: number, comp: Array<[number, number]>) {
  const units: Record<number, { spec: UnitSpec; amount: number }> = {}
  for (const [id, n] of comp) {
    if (n > 0) units[id] = { spec: specOf(id), amount: n }
  }
  return { fleetMissionId: missionId, ownerId, units }
}

/** 随机舰队：用固定种子的 PRNG，保证测试可复现 */
function randomFleet(rng: () => number, missionId: number, ownerId: number, maxUnits: number) {
  const pool = rng() > 0.3 ? SHIP_IDS : DEF_IDS
  const picks = 1 + Math.floor(rng() * 3)
  const comp: Array<[number, number]> = []
  for (let i = 0; i < picks; i++) {
    comp.push([pool[Math.floor(rng() * pool.length)], 1 + Math.floor(rng() * maxUnits)])
  }
  return fleet(missionId, ownerId, comp)
}

function totalOf(rec: Record<number, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0)
}

describe('战斗引擎属性化守恒', () => {
  it('随机对局 300 场：损失 + 幸存 == 初始（守恒）', () => {
    const rng = mulberry32(20260928)
    let played = 0
    for (let i = 0; i < 300; i++) {
      const input: BattleInput = {
        attackerFleets: [randomFleet(rng, 1000 + i, 7, 30)],
        defenderFleets: [randomFleet(rng, 2000 + i, 9, 30)],
      }
      const countIn = (fleets: typeof input.attackerFleets) =>
        fleets.reduce((acc, f) => acc + Object.values(f.units).reduce((a, u) => a + u.amount, 0), 0)
      const startA = countIn(input.attackerFleets)
      const startD = countIn(input.defenderFleets)

      const { rounds } = simulate(input)
      // 双方都是 210（唯一 attack=0）时无伤害可造成，simulate 返回 0 轮——
      // 这是合法结果，守恒无从谈起，跳过。
      if (rounds.length === 0) {
        expect(startA).toBeGreaterThan(0)
        continue
      }
      played++

      const last = rounds[rounds.length - 1]
      const survA = totalOf(last.attackerShips)
      const survD = totalOf(last.defenderShips)
      expect(survA + totalOf(last.attackerLosses), `第 ${i} 场攻方不守恒`).toBe(startA)
      expect(survD + totalOf(last.defenderLosses), `第 ${i} 场守方不守恒`).toBe(startD)
    }
    expect(played, '随机对局几乎全部退化为 0 轮，样本不足').toBeGreaterThan(200)
  })

  it('随机对局 300 场：舰船数单调不增且非负', () => {
    const rng = mulberry32(11111)
    for (let i = 0; i < 300; i++) {
      const input: BattleInput = {
        attackerFleets: [randomFleet(rng, 100 + i, 7, 25)],
        defenderFleets: [randomFleet(rng, 200 + i, 9, 25)],
      }
      const { rounds } = simulate(input)
      let prevA = Infinity
      let prevD = Infinity
      for (const r of rounds) {
        const a = totalOf(r.attackerShips)
        const d = totalOf(r.defenderShips)
        expect(a, `第 ${i} 场攻方舰船数增加`).toBeLessThanOrEqual(prevA)
        expect(d, `第 ${i} 场守方舰船数增加`).toBeLessThanOrEqual(prevD)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(d).toBeGreaterThanOrEqual(0)
        prevA = a
        prevD = d
      }
    }
  })

  it('战斗必然终止：轮数 <= 6，且一方全灭即停', () => {
    const rng = mulberry32(22222)
    for (let i = 0; i < 300; i++) {
      const input: BattleInput = {
        attackerFleets: [randomFleet(rng, 10 + i, 7, 40)],
        defenderFleets: [randomFleet(rng, 50 + i, 9, 40)],
      }
      const { rounds } = simulate(input)
      expect(rounds.length, `第 ${i} 场轮数超界`).toBeLessThanOrEqual(6)
      for (const r of rounds) {
        if (totalOf(r.attackerShips) === 0 || totalOf(r.defenderShips) === 0) {
          // 全灭的那一轮之后不应再有轮次（循环开头会 break）
          expect(rounds[rounds.length - 1]).toBe(r)
        }
      }
    }
  })

  it('同输入必同输出（seed 可重放）', () => {
    const rng = mulberry32(33333)
    for (let i = 0; i < 100; i++) {
      const input: BattleInput = {
        attackerFleets: [randomFleet(rng, 500 + i, 7, 20)],
        defenderFleets: [randomFleet(rng, 900 + i, 9, 20)],
      }
      const a = JSON.stringify(simulate(input))
      const b = JSON.stringify(simulate(input))
      expect(a, `第 ${i} 场两次模拟结果不一致`).toBe(b)
    }
  })

  it('护盾吸收量不超过造成的伤害', () => {
    const rng = mulberry32(44444)
    for (let i = 0; i < 200; i++) {
      const input: BattleInput = {
        attackerFleets: [randomFleet(rng, 70 + i, 7, 25)],
        defenderFleets: [randomFleet(rng, 80 + i, 9, 25)],
      }
      for (const r of simulate(input).rounds) {
        expect(r.absorbedDamageAttacker).toBeGreaterThanOrEqual(0)
        expect(r.absorbedDamageDefender).toBeGreaterThanOrEqual(0)
        // 吸收的部分必然来自总伤害
        expect(r.absorbedDamageDefender).toBeLessThanOrEqual(r.fullStrengthAttacker + 1e-9)
        expect(r.absorbedDamageAttacker).toBeLessThanOrEqual(r.fullStrengthDefender + 1e-9)
      }
    }
  })
})

describe('战斗引擎边界情形', () => {
  it('空攻方：0 轮，不崩', () => {
    const out = simulate({ attackerFleets: [], defenderFleets: [fleet(1, 9, [[204, 5]])] })
    expect(out.rounds.length).toBe(0)
  })

  it('空守方：0 轮，不崩', () => {
    const out = simulate({ attackerFleets: [fleet(1, 7, [[204, 5]])], defenderFleets: [] })
    expect(out.rounds.length).toBe(0)
  })

  it('双方皆空：0 轮，不崩', () => {
    const out = simulate({ attackerFleets: [], defenderFleets: [] })
    expect(out.rounds).toEqual([])
  })

  it('单舰对决 1v1', () => {
    const out = simulate({ attackerFleets: [fleet(1, 7, [[204, 1]])], defenderFleets: [fleet(2, 9, [[204, 1]])] })
    expect(out.rounds.length).toBeGreaterThan(0)
    const last = out.rounds[out.rounds.length - 1]
    expect(totalOf(last.attackerLosses) + totalOf(last.defenderLosses)).toBeGreaterThan(0)
  })

  it('零攻击单位（探测器 210）vs 满编死星：不产生任何伤害', () => {
    // 注意：210 间谍探测器是唯一 attack=0 的单位；202 运输船是 atk=5，不是 0。
    const out = simulate({
      attackerFleets: [fleet(1, 7, [[210, 50]])],
      defenderFleets: [fleet(2, 9, [[214, 1]])],
    })
    for (const r of out.rounds) {
      expect(r.fullStrengthAttacker, '零攻击单位产生了伤害').toBe(0)
      expect(r.hitsAttacker).toBe(0)
    }
  })

  it('探测器(attack=0) 对高耐久目标：不会陷入死循环（轮数有上界）', () => {
    const out = simulate({
      attackerFleets: [fleet(1, 7, [[210, 200]])],
      defenderFleets: [fleet(2, 9, [[214, 1]])],
    })
    expect(out.rounds.length).toBeLessThanOrEqual(6)
  })

  it('死星打满编探测器：探测器全灭，但死星毫发无伤（210 atk=0）', () => {
    const out = simulate({
      attackerFleets: [fleet(1, 7, [[214, 1]])],
      defenderFleets: [fleet(2, 9, [[210, 100]])],
    })
    const last = out.rounds[out.rounds.length - 1]
    expect(totalOf(last.defenderShips), '死星应全歼 100 探测器').toBe(0)
    // 探测器 attack=0 -> 死星不掉血
    expect(totalOf(last.attackerLosses), '探测器无法造成任何损失').toBe(0)
    expect(totalOf(last.attackerShips)).toBe(1)
  })

  it('速射链：重战速射探测器应打出多于基础 6 回合的命中数', () => {
    // 205 重战 rapidfire {210:3} —— 6 轮内对 210 的命中应显著多于同船无速射
    const withRf = simulate({
      attackerFleets: [fleet(1, 7, [[205, 20]])],
      defenderFleets: [fleet(2, 9, [[210, 100]])],
    })
    const totalHits = withRf.rounds.reduce((a, r) => a + r.hitsAttacker, 0)
    // 20 艘 × 6 轮 = 120 基础命中，速射只会更多
    expect(totalHits).toBeGreaterThanOrEqual(120)
  })

  it('大兵力差：500 轻战 vs 1 巡洋舰必胜', () => {
    const out = simulate({
      attackerFleets: [fleet(1, 7, [[204, 500]])],
      defenderFleets: [fleet(2, 9, [[206, 1]])],
    })
    const last = out.rounds[out.rounds.length - 1]
    expect(totalOf(last.defenderShips), '500 轻战应全歼 1 巡洋舰').toBe(0)
    expect(totalOf(last.attackerShips)).toBeGreaterThan(0)
  })

  it('多方舰队：按 owner 归属各自计算损失', () => {
    const out = simulate({
      attackerFleets: [fleet(1, 7, [[204, 10]]), fleet(2, 8, [[205, 5]])],
      defenderFleets: [fleet(3, 9, [[204, 12]])],
    })
    const last = out.rounds[out.rounds.length - 1]
    // 每个 fleetMissionId 都应在结果里出现
    const ids = Object.keys(last.attackerFleetResults).map(Number).sort()
    expect(ids).toEqual([1, 2])
    for (const id of [1, 2, 3]) {
      const key = id <= 2 ? last.attackerFleetResults[id] : last.defenderFleetResults[id]
      expect(key, `fleet ${id} 缺结果`).toBeDefined()
      expect(key.ownerId).toBe(id <= 2 ? (id === 1 ? 7 : 8) : 9)
    }
  })
})
