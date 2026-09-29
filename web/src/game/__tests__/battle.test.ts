/**
 * battle.ts ↔ sim/combat.py 跨语言金值对拍。
 *
 * sim/combat.py 是 battle.ts 的逐位等价移植（CR-20260921-001 指定本文件为 canonical）。
 * 金值由 `python sim/gen_battle_golden_ts.py` 生成（默认种子=输入派生，与本实现一致）。
 * 比对口径：每回合 hits/fullStrength/absorbedDamage/双方舰数 + 终局累计损失与幸存，
 * 全部精确相等（两侧均 f64、同序运算）；若漂移说明移植失真，必须停下来查因。
 */
import { describe, expect, it } from 'vitest'
import { simulate, type BattleInput } from '../battle'
import golden from './golden/battle_golden.json'

type GoldenCase = {
  name: string
  input: BattleInput
  expected: {
    rounds: Array<{
      hitsAttacker: number
      hitsDefender: number
      fullStrengthAttacker: number
      fullStrengthDefender: number
      absorbedDamageAttacker: number
      absorbedDamageDefender: number
      attackerShips: Record<string, number>
      defenderShips: Record<string, number>
    }>
    attackerLosses: Record<string, number>
    defenderLosses: Record<string, number>
    attackerSurvivors: Record<string, number>
    defenderSurvivors: Record<string, number>
  }
}

/** Record<number, number> → 字符串键对象，便于与金值 JSON 精确比较 */
function strKeys(rec: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec)) out[k] = v
  return out
}

describe('battle.ts ↔ combat.py 金值对拍', () => {
  for (const c of golden.cases as unknown as GoldenCase[]) {
    it(c.name, () => {
      const out = simulate(c.input)
      const exp = c.expected

      expect(out.rounds.length).toBe(exp.rounds.length)

      out.rounds.forEach((r, i) => {
        const e = exp.rounds[i]
        expect(r.hitsAttacker, `回合${i + 1} hitsAttacker`).toBe(e.hitsAttacker)
        expect(r.hitsDefender, `回合${i + 1} hitsDefender`).toBe(e.hitsDefender)
        expect(r.fullStrengthAttacker, `回合${i + 1} fullStrengthAttacker`).toBe(e.fullStrengthAttacker)
        expect(r.fullStrengthDefender, `回合${i + 1} fullStrengthDefender`).toBe(e.fullStrengthDefender)
        expect(r.absorbedDamageAttacker, `回合${i + 1} absorbedDamageAttacker`).toBe(e.absorbedDamageAttacker)
        expect(r.absorbedDamageDefender, `回合${i + 1} absorbedDamageDefender`).toBe(e.absorbedDamageDefender)
        expect(strKeys(r.attackerShips), `回合${i + 1} attackerShips`).toEqual(e.attackerShips)
        expect(strKeys(r.defenderShips), `回合${i + 1} defenderShips`).toEqual(e.defenderShips)
      })

      const last = out.rounds[out.rounds.length - 1]
      expect(strKeys(last.attackerLosses), '终局攻方累计损失').toEqual(exp.attackerLosses)
      expect(strKeys(last.defenderLosses), '终局守方累计损失').toEqual(exp.defenderLosses)
      expect(strKeys(last.attackerShips), '终局攻方幸存').toEqual(exp.attackerSurvivors)
      expect(strKeys(last.defenderShips), '终局守方幸存').toEqual(exp.defenderSurvivors)
    })
  }
})
