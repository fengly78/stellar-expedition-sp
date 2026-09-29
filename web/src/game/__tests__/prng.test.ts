import { describe, expect, it } from 'vitest'
import { simulate, type BattleInput } from '../battle'
import { hash32, mulberry32 } from '../prng'

describe('R10 PRNG determinism', () => {
  it('mulberry32 same seed produces identical sequences', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('hash32 is stable across reloads (pure function)', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3))
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1))
    expect(hash32()).toBe(hash32())
  })

  it('simulate() is replay-deterministic: same input → same output', () => {
    const spec = { unitId: 204, attack: 50, shield: 10, hull: 100, rapidfire: {} }
    const input: BattleInput = {
      attackerFleets: [
        {
          fleetMissionId: 1,
          ownerId: 100,
          units: { 204: { spec, amount: 100 } },
        },
      ],
      defenderFleets: [
        {
          fleetMissionId: 2,
          ownerId: 200,
          units: { 204: { spec, amount: 50 } },
        },
      ],
    }
    const out1 = simulate(input)
    const out2 = simulate(input)
    expect(JSON.stringify(out1)).toBe(JSON.stringify(out2))
  })

  it('simulate() different fleet sizes → different outcomes', () => {
    const spec = { unitId: 204, attack: 50, shield: 10, hull: 100, rapidfire: {} }
    const small: BattleInput = {
      attackerFleets: [{ fleetMissionId: 1, ownerId: 100, units: { 204: { spec, amount: 10 } } }],
      defenderFleets: [{ fleetMissionId: 2, ownerId: 200, units: { 204: { spec, amount: 5 } } }],
    }
    const large: BattleInput = {
      attackerFleets: [{ fleetMissionId: 1, ownerId: 100, units: { 204: { spec, amount: 1000 } } }],
      defenderFleets: [{ fleetMissionId: 2, ownerId: 200, units: { 204: { spec, amount: 5 } } }],
    }
    expect(JSON.stringify(simulate(small))).not.toBe(JSON.stringify(simulate(large)))
  })
})