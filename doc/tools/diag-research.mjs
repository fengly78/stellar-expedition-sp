// 研究时间公式改造前后的对比。
// 新公式取自参考实现 ogame-vue-ts (src/logic/researchLogic.ts)：cost^0.3 软化。
const SPEED = 4

const TECHS = {
  109: { name: '武器技术', cost: { metal: 800, crystal: 200, deuterium: 0 }, factor: 2 },
  110: { name: '护盾技术', cost: { metal: 200, crystal: 600, deuterium: 0 }, factor: 2 },
  111: { name: '装甲技术', cost: { metal: 1000, crystal: 0, deuterium: 0 }, factor: 2 },
  113: { name: '能源技术', cost: { metal: 0, crystal: 800, deuterium: 400 }, factor: 2 },
  108: { name: '计算机技术', cost: { metal: 0, crystal: 400, deuterium: 600 }, factor: 2 },
}

function oldTime(t, labLevel) {
  return (t.cost.metal + t.cost.crystal) / SPEED / (1 + labLevel)
}

function newTime(t, level, labLevel, energyTech = 0) {
  const f = Math.pow(t.factor, level)
  const sum =
    Math.pow(t.cost.metal * f, 0.3) + Math.pow(t.cost.crystal * f, 0.3) + Math.pow(t.cost.deuterium * f, 0.3)
  const elementCost = sum / 0.003
  return Math.max(5, Math.floor(elementCost / SPEED / ((1 + labLevel) * (1 + energyTech * 0.05))))
}

// canResearch 要求 labLevel > techLevel，所以实验室等级取 level+1（最省的情况）
function fmtDur(s) {
  if (s < 60) return `${s.toFixed(0)}秒`
  if (s < 3600) return `${(s / 60).toFixed(1)}分`
  return `${(s / 3600).toFixed(1)}时`
}

console.log('=== 武器技术：改造前 vs 改造后（实验室等级取最低可用值 level+1）===')
console.log('等级 | 研究成本(金)      | 改前耗时 | 改后耗时 | 改后@4x倍速')
for (const L of [0, 1, 3, 5, 8, 10, 15, 20, 25]) {
  const t = TECHS[109]
  const lab = L + 1
  const costM = t.cost.metal * Math.pow(t.factor, L)
  const o = oldTime(t, lab)
  const n = newTime(t, L, lab)
  console.log(
    `Lv.${String(L).padEnd(2)} | ${costM.toExponential(2).padStart(12)} | ${fmtDur(o).padStart(8)} | ${fmtDur(n).padStart(8)} | ${fmtDur(n / 4).padStart(10)}`,
  )
}

console.log('\n=== 各科技 Lv.10 改后耗时（实验室 Lv.11）===')
for (const id in TECHS) {
  const t = TECHS[id]
  console.log(`${t.name} | 改前 ${fmtDur(oldTime(t, 11)).padStart(8)} | 改后 ${fmtDur(newTime(t, 10, 11)).padStart(8)}`)
}

console.log('\n=== 能源技术(113) 对研究时间的加速效果（武器 Lv.10，实验室 Lv.11）===')
for (const e of [0, 5, 10, 15, 20]) {
  console.log(`能源技术 Lv.${String(e).padEnd(2)} → ${fmtDur(newTime(TECHS[109], 10, 11, e))}`)
}

console.log('\n=== 下限保护检查 ===')
console.log('极低等级小科技（如间谍技术 Lv.0）：', newTime({ cost: { metal: 200, crystal: 1000, deuterium: 200 }, factor: 2 }, 0, 1), '秒')
console.log('下限为 5 秒，避免 0 秒排队')
