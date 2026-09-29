import { hash32, mulberry32 } from './prng'

export interface UnitSpec {
  unitId: number
  attack: number
  shield: number
  hull: number
  rapidfire: Record<number, number>
}

export interface UnitSpecWithAmount {
  spec: UnitSpec
  amount: number
}

export interface FleetInput {
  fleetMissionId: number
  ownerId: number
  units: Record<number, UnitSpecWithAmount>
}

export interface BattleInput {
  attackerFleets: FleetInput[]
  defenderFleets: FleetInput[]
}

export interface FleetResult {
  fleetMissionId: number
  ownerId: number
  unitsStart: Record<number, number>
  unitsResult: Record<number, number>
  unitsLost: Record<number, number>
}

export interface BattleRound {
  attackerShips: Record<number, number>
  defenderShips: Record<number, number>
  attackerLosses: Record<number, number>
  defenderLosses: Record<number, number>
  attackerLossesInRound: Record<number, number>
  defenderLossesInRound: Record<number, number>
  absorbedDamageAttacker: number
  absorbedDamageDefender: number
  fullStrengthAttacker: number
  fullStrengthDefender: number
  hitsAttacker: number
  hitsDefender: number
  attackerFleetResults: Record<number, FleetResult>
  defenderFleetResults: Record<number, FleetResult>
}

export interface BattleOutput {
  rounds: BattleRound[]
}

interface UnitInstance {
  spec: UnitSpec
  fleetId: number
  ownerId: number
  shield: number
  hull: number
}

function expandFleets(fleets: FleetInput[]): UnitInstance[] {
  const units: UnitInstance[] = []
  for (const f of fleets) {
    for (const id in f.units) {
      const u = f.units[+id]
      for (let i = 0; i < u.amount; i++) {
        units.push({ spec: u.spec, fleetId: f.fleetMissionId, ownerId: f.ownerId, shield: u.spec.shield, hull: u.spec.hull })
      }
    }
  }
  return units
}

function combatPhase(rng: () => number, attackers: UnitInstance[], defenders: UnitInstance[], round: BattleRound, attackerSide: boolean): void {
  for (const a of attackers) {
    const spec = a.spec
    for (;;) {
      if (defenders.length === 0) return
      const target = defenders[Math.floor(rng() * defenders.length)]

      const damage = spec.attack
      if (damage < 0.01 * target.spec.shield) break

      let absorbed = 0
      if (target.shield > 0) {
        if (damage <= target.shield) {
          absorbed = damage
          target.shield -= damage
        } else {
          absorbed = target.shield
          target.hull -= damage - target.shield
          target.shield = 0
        }
      } else {
        target.hull -= damage
      }

      const ratio = target.hull / target.spec.hull
      if (ratio < 0.7 && rng() < 1 - ratio) {
        target.hull = 0
        target.shield = 0
      }

      if (attackerSide) {
        round.hitsAttacker++
        round.fullStrengthAttacker += damage
        round.absorbedDamageDefender += absorbed
      } else {
        round.hitsDefender++
        round.fullStrengthDefender += damage
        round.absorbedDamageAttacker += absorbed
      }

      const rf = spec.rapidfire[target.spec.unitId]
      if (!rf) break
      if (rng() < 1 - 1 / rf) continue
      break
    }
  }
}

function battleSeed(input: BattleInput): number {
  const flat: number[] = []
  for (const f of input.attackerFleets) {
    flat.push(f.ownerId)
    for (const id in f.units) flat.push(+id, f.units[+id].amount)
  }
  flat.push(0xdeadbeef)
  for (const f of input.defenderFleets) {
    flat.push(f.ownerId)
    for (const id in f.units) flat.push(+id, f.units[+id].amount)
  }
  return hash32(...flat)
}

function cleanupSide(losses: Record<number, number>, units: UnitInstance[]): UnitInstance[] {
  const kept: UnitInstance[] = []
  for (const u of units) {
    if (u.hull <= 0) {
      losses[u.spec.unitId] = (losses[u.spec.unitId] ?? 0) + 1
      continue
    }
    u.shield = u.spec.shield
    kept.push(u)
  }
  return kept
}

function countUnits(units: UnitInstance[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const u of units) counts[u.spec.unitId] = (counts[u.spec.unitId] ?? 0) + 1
  return counts
}

function diffCounts(initial: Record<number, number>, current: Record<number, number>): Record<number, number> {
  const diff: Record<number, number> = {}
  for (const id in initial) {
    const start = initial[+id]
    if (start > (current[+id] ?? 0)) diff[+id] = start - (current[+id] ?? 0)
  }
  return diff
}

function fleetResults(fleets: FleetInput[], survivors: UnitInstance[]): Record<number, FleetResult> {
  const startByFleet: Record<number, Record<number, number>> = {}
  for (const f of fleets) {
    const counts: Record<number, number> = {}
    for (const id in f.units) counts[+id] = f.units[+id].amount
    startByFleet[f.fleetMissionId] = counts
  }

  const resultByFleet: Record<number, Record<number, number>> = {}
  for (const u of survivors) {
    if (!resultByFleet[u.fleetId]) resultByFleet[u.fleetId] = {}
    resultByFleet[u.fleetId][u.spec.unitId] = (resultByFleet[u.fleetId][u.spec.unitId] ?? 0) + 1
  }

  const results: Record<number, FleetResult> = {}
  for (const f of fleets) {
    const start = startByFleet[f.fleetMissionId]
    const result = resultByFleet[f.fleetMissionId] ?? {}
    const lost: Record<number, number> = {}
    for (const id in start) {
      if (start[+id] > (result[+id] ?? 0)) lost[+id] = start[+id] - (result[+id] ?? 0)
    }
    results[f.fleetMissionId] = { fleetMissionId: f.fleetMissionId, ownerId: f.ownerId, unitsStart: start, unitsResult: result, unitsLost: lost }
  }
  return results
}

export function simulate(input: BattleInput): BattleOutput {
  let attackers = expandFleets(input.attackerFleets)
  let defenders = expandFleets(input.defenderFleets)

  const initialAttacker = countUnits(attackers)
  const initialDefender = countUnits(defenders)

  const rounds: BattleRound[] = []

  // ponytail: derive RNG seed from BattleInput so simulate() is replay-deterministic.
  // Same fleets → same seed → same rolls → same outcome. Mulberry32(0) = fresh entropy.
  const rng = mulberry32(battleSeed(input))

  for (let i = 0; i < 6; i++) {
    if (attackers.length === 0 || defenders.length === 0) break

    const round: BattleRound = {
      attackerShips: {}, defenderShips: {}, attackerLosses: {}, defenderLosses: {},
      attackerLossesInRound: {}, defenderLossesInRound: {},
      absorbedDamageAttacker: 0, absorbedDamageDefender: 0,
      fullStrengthAttacker: 0, fullStrengthDefender: 0,
      hitsAttacker: 0, hitsDefender: 0,
      attackerFleetResults: {}, defenderFleetResults: {},
    }

    combatPhase(rng, attackers, defenders, round, true)
    combatPhase(rng, defenders, attackers, round, false)

    round.attackerLossesInRound = {}
    attackers = cleanupSide(round.attackerLossesInRound, attackers)
    round.defenderLossesInRound = {}
    defenders = cleanupSide(round.defenderLossesInRound, defenders)

    round.attackerShips = countUnits(attackers)
    round.defenderShips = countUnits(defenders)

    round.attackerLosses = diffCounts(initialAttacker, round.attackerShips)
    round.defenderLosses = diffCounts(initialDefender, round.defenderShips)

    round.attackerFleetResults = fleetResults(input.attackerFleets, attackers)
    round.defenderFleetResults = fleetResults(input.defenderFleets, defenders)

    rounds.push(round)
  }

  return { rounds }
}
