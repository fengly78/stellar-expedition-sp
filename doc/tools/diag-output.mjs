// 产能诊断：验证缺电阈值、仓库爆仓、X4 与显示值的关系
const SPEED = 4
const pf = (L) => L * Math.pow(1.1, L)
const metalProd = (L, pos = 1) => 50 * pf(L) * pos * SPEED
const crystalProd = (L, pos = 1) => 35 * pf(L) * pos * SPEED
const deuProd = (L, temp = 130) => 18 * pf(L) * (1.44 - 0.004 * temp) * SPEED
const solar = (L, E = 0) => 20 * pf(L) * (1 + 0.05 * E) * SPEED
const cons = (L, deu = false) => (deu ? 20 : 10) * pf(L) // 注意：没有 SPEED
const storage = (L) => 10000 * Math.pow(2, L)

const out = []
const P = (s) => out.push(s)

P('=== A. 缺电阈值：电站要比矿井落后几级才触发 ===')
P('（假设 金属矿=晶体矿=重氢=L，能源技术 E=0）')
P('L\t电站=S 时供需比（ratio<1 才缺电）')
for (const L of [10, 20, 30]) {
  const need = 10 * pf(L) + 10 * pf(L) + 20 * pf(L) // = 40*pf(L)
  const row = []
  for (const d of [0, 4, 6, 7, 8, 10]) {
    const ratio = solar(L - d) / need
    row.push(`落后${d}级:${ratio.toFixed(2)}`)
  }
  P(`Lv.${L}\t${row.join('  ')}`)
}
P('')
P('结论：电站必须落后矿井 >=8 级才会出现缺电。玩家按正常节奏建房几乎永远看不到。')

P('')
P('=== B. 若把 energyConsumption 也乘 SPEED（修复不一致后）===')
for (const L of [10, 20, 30]) {
  const need = (10 * pf(L) + 10 * pf(L) + 20 * pf(L)) * SPEED
  const row = []
  for (const d of [0, 2, 4, 7]) {
    const ratio = solar(L - d) / need
    row.push(`落后${d}级:${ratio.toFixed(2)}`)
  }
  P(`Lv.${L}\t${row.join('  ')}`)
}
P('结论：同级就会 ratio=0.50，现有存档立刻减产一半 —— 属于破坏性改动，需权衡。')

P('')
P('=== C. 仓库爆仓：母星开局 buildings={} → 仓库 Lv.0 容量仅 10000 ===')
P('矿等级\t金属产量/游戏时\t金属仓等级\t容量\t从 6000 起爆仓耗时')
for (const L of [1, 3, 5, 8, 10, 12, 15]) {
  for (const S of [0, 3, 6]) {
    const cap = storage(S)
    const rate = metalProd(L)
    const hrs = (cap - 6000) / rate
    P(`矿Lv.${L}\t${rate.toFixed(0)}/时\t\t仓Lv.${S}\t\t${cap}\t${hrs > 0 ? hrs.toFixed(1) + ' 小时' : '已满'}`)
  }
}

P('')
P('=== D. X4 到底改变了什么 ===')
P('HUD 显示的 "+X/时" = metalProduction(L)，已是【每游戏小时】且已含 SPEED=4 常量。')
P('timeScale（UI 的 1x/2x/4x）只影响游戏时钟流速，不影响这个数字。')
P('')
P('矿等级\t显示值/游戏时\t1x真实/时\t2x真实/时\t4x真实/时')
for (const L of [5, 10, 15, 20]) {
  const r = metalProd(L)
  P(`Lv.${L}\t${r.toFixed(0)}\t\t${r.toFixed(0)}\t\t${(r * 2).toFixed(0)}\t\t${(r * 4).toFixed(0)}`)
}
P('')
P('所以点 4x 后 HUD 数字不变是正常的：它本来就是"每游戏小时"。')
P('真实到账 = 显示值 × timeScale。玩家若按真实时间心算，会误判为"没生效/很低"。')

P('')
P('=== E. 缺电打击的严重度 ===')
P('withEnergyDeficit 最低把产量压到 ×0.2（下限）。')
for (const f of [1, 0.8, 0.5, 0.2]) {
  P(`ratio=${f}\t金属矿Lv.20 实际产出 ${(metalProd(20) * f).toFixed(0)}/时（满产 ${metalProd(20).toFixed(0)}）`)
}

console.log(out.join('\n'))
