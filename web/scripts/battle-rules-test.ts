const { simulate } = await import('../src/game/battle.ts')

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

const LF = (n: number) => ({ 204: { spec: { unitId: 204, attack: 50, shield: 10, hull: 400, rapidfire: {} }, amount: n } })
const sum = (m: Record<number, number>) => Object.values(m).reduce((a, b) => a + b, 0)

{
  const out = simulate({
    attackerFleets: [{ fleetMissionId: 1, ownerId: 1, units: LF(500) }],
    defenderFleets: [{ fleetMissionId: 2, ownerId: 2, units: LF(10) }],
  })
  assert(out.rounds.length <= 6, `回合数 ≤ 6（实际 ${out.rounds.length}）`)
  const last = out.rounds[out.rounds.length - 1]
  assert(sum(last.defenderShips) === 0, '500 轻战 vs 10 轻战：守方全灭')
  assert(sum(last.attackerShips) > 0, '攻方有存活')
}

{
  const out = simulate({
    attackerFleets: [{ fleetMissionId: 1, ownerId: 1, units: { 204: { spec: { unitId: 204, attack: 1, shield: 10, hull: 400, rapidfire: {} }, amount: 1 } } }],
    defenderFleets: [{ fleetMissionId: 2, ownerId: 2, units: { 207: { spec: { unitId: 207, attack: 0, shield: 1000, hull: 6000, rapidfire: {} }, amount: 1 } } }],
  })
  assert(out.rounds.length === 6, '弹开场景打满 6 回合')
  const hits = out.rounds.reduce((a, r) => a + r.hitsAttacker + r.hitsDefender, 0)
  assert(hits === 0, '1 攻击 vs 1000 盾：全部弹开（1% 规则）')
}

{
  const CR = (n: number) => ({ 206: { spec: { unitId: 206, attack: 400, shield: 50, hull: 2700, rapidfire: { 204: 3 } }, amount: n } })
  const out = simulate({
    attackerFleets: [{ fleetMissionId: 1, ownerId: 1, units: CR(50) }],
    defenderFleets: [{ fleetMissionId: 2, ownerId: 2, units: LF(300) }],
  })
  const last = out.rounds[out.rounds.length - 1]
  assert(sum(last.defenderShips) < 100, `巡洋 rapidfire 扫射轻战群（守方剩 ${sum(last.defenderShips)}）`)
}

{
  const tank = { 207: { spec: { unitId: 207, attack: 100, shield: 200, hull: 6000, rapidfire: {} }, amount: 50 } }
  const out = simulate({
    attackerFleets: [{ fleetMissionId: 1, ownerId: 1, units: tank }],
    defenderFleets: [{ fleetMissionId: 2, ownerId: 2, units: tank }],
  })
  const r1 = out.rounds[0]
  const r2 = out.rounds[1]
  assert(r1 !== undefined && r2 !== undefined, '势均力敌战斗超过 1 回合')
  assert(r1.absorbedDamageDefender > 0, '首回合护盾吸收伤害')
  assert(sum(r2.defenderShips) <= sum(r1.defenderShips), '护盾回合末回充但兵力不增')
}

console.log('---')
console.log('战斗规则全部断言通过')
