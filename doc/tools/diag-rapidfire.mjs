// 复刻 web/src/game/battle.ts 的战斗逻辑，对比 rapidfire 表补全前后的对抗结果
// 运行：node doc/tools/diag-rapidfire.mjs

const SHIPS = {
  204: { attack: 50,    shield: 10,    hull: 400,    cost: 3000 + 0 },
  205: { attack: 150,   shield: 25,    hull: 1000,   cost: 6000 + 2000 },
  206: { attack: 400,   shield: 50,    hull: 2700,   cost: 20000 + 7000 + 2000 },
  207: { attack: 1200,  shield: 200,   hull: 6000,   cost: 45000 + 15000 },
  211: { attack: 1000,  shield: 500,   hull: 7500,   cost: 50000 + 25000 + 15000 }, // 修复后 shield=500
  214: { attack: 200000,shield: 50000, hull: 9000000,cost: 5000000 + 4000000 + 1000000 },
}
const DEFENSES = {
  401: { attack: 80,   shield: 20,  hull: 2000,   cost: 2000 },
  402: { attack: 100,  shield: 25,  hull: 2000,   cost: 1500 + 500 },
  403: { attack: 250,  shield: 100, hull: 8000,   cost: 6000 + 2000 },
  404: { attack: 1100, shield: 200, hull: 35000,  cost: 20000 + 15000 + 2000 },
  405: { attack: 150,  shield: 500, hull: 8000,   cost: 2000 + 6000 },
  406: { attack: 3000, shield: 300, hull: 100000, cost: 50000 + 50000 + 30000 },
}

// 改前：只有 6 条关系，且轰炸机护盾被误写成 50
const RF_BEFORE = {
  204: { 210: 5 },
  205: { 210: 5 },
  206: { 204: 3, 210: 5 },
  207: { 210: 5 },
  211: { 401: 10, 402: 10, 403: 5, 404: 5, 405: 5 },
  214: { 210: 10, 401: 10, 402: 10 },
}
const BOMBER_SHIELD_BEFORE = 50

// 改后：对齐 OGameX MilitaryShipObjects.php
const RF_AFTER = {
  204: { 210: 5, 212: 5 },
  205: { 202: 3, 210: 5, 212: 5 },
  206: { 204: 6, 210: 5, 212: 5, 401: 10 },
  207: { 210: 5, 212: 5 },
  211: { 210: 5, 212: 5, 401: 20, 402: 20, 403: 10, 404: 5, 405: 10, 406: 5 },
  214: { 202: 250, 203: 250, 204: 200, 205: 100, 206: 33, 207: 30, 208: 250, 209: 250, 210: 250, 211: 25, 212: 250, 401: 200, 402: 200, 403: 100, 404: 50, 405: 100 },
}

function spec(id, bomberShield) {
  const s = SHIPS[id] ?? DEFENSES[id]
  const shield = id === 211 ? bomberShield : s.shield
  return { attack: s.attack, shield, hull: s.hull }
}

function mk(id, n, bomberShield) {
  const sp = spec(id, bomberShield)
  const out = []
  for (let i = 0; i < n; i++) out.push({ id, attack: sp.attack, shieldMax: sp.shield, hullMax: sp.hull, shield: sp.shield, hull: sp.hull })
  return out
}

// 忠实复刻 battle.ts：目标从「本回合开始时的完整数组」里随机取，
// 因此可能选到本回合内已死单位（火力浪费），这是原版既有行为
function combatPhase(attackers, defenders, rfTable) {
  if (defenders.length === 0) return
  for (const a of attackers) {
    if (a.hull <= 0) continue
    let guard = 0
    while (guard++ < 5000) {
      const t = defenders[Math.floor(Math.random() * defenders.length)]
      const damage = a.attack
      if (damage < 0.01 * t.shieldMax) break // bounce：完全弹开
      if (t.shield > 0) {
        if (damage <= t.shield) t.shield -= damage
        else { t.hull -= damage - t.shield; t.shield = 0 }
      } else t.hull -= damage
      const ratio = t.hull / t.hullMax
      if (ratio < 0.7 && Math.random() < 1 - ratio) { t.hull = 0; t.shield = 0 } // 概率爆炸
      const rf = rfTable[a.id]?.[t.id]
      if (!rf) break
      if (Math.random() < 1 - 1 / rf) continue
      break
    }
  }
}

function cleanup(units) {
  const kept = []
  for (const u of units) {
    if (u.hull <= 0) continue
    u.shield = u.shieldMax // 护盾每回合回满
    kept.push(u)
  }
  return kept
}

function simulate(atkId, atkN, defId, defN, rfTable, bomberShield) {
  let attackers = mk(atkId, atkN, bomberShield)
  let defenders = mk(defId, defN, bomberShield)
  for (let r = 0; r < 6; r++) {
    if (attackers.length === 0 || defenders.length === 0) break
    combatPhase(attackers, defenders, rfTable)
    combatPhase(defenders, attackers, rfTable)
    attackers = cleanup(attackers)
    defenders = cleanup(defenders)
  }
  return { atkAlive: attackers.length, defAlive: defenders.length }
}

function run(label, atkId, atkN, defId, defN, trials = 200) {
  const costAtk = (SHIPS[atkId]?.cost ?? 0) * atkN
  const costDef = (DEFENSES[defId]?.cost ?? 0) * defN
  const acc = { bA: 0, bD: 0, aA: 0, aD: 0, bWin: 0, aWin: 0 }
  for (let i = 0; i < trials; i++) {
    const b = simulate(atkId, atkN, defId, defN, RF_BEFORE, BOMBER_SHIELD_BEFORE)
    const a = simulate(atkId, atkN, defId, defN, RF_AFTER, 500)
    acc.bA += b.atkAlive; acc.bD += b.defAlive
    acc.aA += a.atkAlive; acc.aD += a.defAlive
    if (b.defAlive === 0) acc.bWin++
    if (a.defAlive === 0) acc.aWin++
  }
  const t = trials
  const name = (id) => SHIPS[id]?.constructor === undefined ? (SHIPS[id] ? SHIPS[id] : DEFENSES[id]) : null
  console.log(`\n### ${label}`)
  console.log(`  攻方 ${atkN} × ${atkId}（造价 ${costAtk.toLocaleString()}）vs 守方 ${defN} × ${defId}（造价 ${costDef.toLocaleString()}）`)
  console.log(`  ${'版本'.padEnd(6)} 攻方存活      守方存活      攻方清场率   资源交换比(守损/攻损)`)
  const fmtRow = (v, a, d, win) => {
    const aRate = (a / atkN * 100).toFixed(1)
    const dRate = (d / defN * 100).toFixed(1)
    const lostAtk = (1 - a / atkN) * costAtk
    const lostDef = (1 - d / defN) * costDef
    const ratio = lostAtk > 0 ? (lostDef / lostAtk).toFixed(2) : '∞'
    console.log(`  ${v.padEnd(8)} ${String(a).padStart(4)}/${atkN} (${aRate.padStart(5)}%)  ${String(d).padStart(5)}/${defN} (${dRate.padStart(5)}%)  ${(win / t * 100).toFixed(0).padStart(4)}%      ${ratio}`)
  }
  fmtRow('改前', acc.bA / t, acc.bD / t, acc.bWin)
  fmtRow('改后', acc.aA / t, acc.aD / t, acc.aWin)
}

console.log('=== rapidfire 表补全 + 轰炸机护盾修复：战斗结果对照（每组 200 次蒙特卡洛）===')

run('A. 巡洋舰 vs 同价火箭海（关键缺失：巡洋→火箭 rf=10）', 206, 50, 401, Math.floor(50 * 29000 / 2000))
run('B. 轰炸机 vs 同价火箭海', 211, 20, 401, Math.floor(20 * 90000 / 2000))
run('C. 轰炸机 vs 同价高斯炮（反防御专精的核心场景）', 211, 20, 404, Math.floor(20 * 90000 / 37000))
run('D. 轰炸机 vs 同价等离子炮台（终局防御）', 211, 20, 406, Math.floor(20 * 90000 / 130000))
run('E. 死星 vs 1000 轻型战斗机（碾压性验证）', 214, 1, 204, 1000, 60)
run('F. 基线：100 轻战 vs 1 高斯（应无变化，验证改动无副作用）', 204, 100, 404, 1)
