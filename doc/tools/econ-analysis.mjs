// 一次性经济体检脚本：把"感觉不对"换算成能验证的数字。
const SPEED = 4
const P = (L) => L * Math.pow(1.1, L)

// —— 当前 web/src/game/objects.ts 的实现 ——
const metalProd = (L, pos = 1) => 50 * P(L) * pos * SPEED
const crystalProd = (L, pos = 1) => 35 * P(L) * pos * SPEED
const deutProd = (L, tempMax = 40) => 18 * P(L) * (1.44 - 0.004 * tempMax) * SPEED
const solarOut = (L, tech = 0) => 20 * P(L) * (1 + 0.05 * tech) * SPEED
const energyUse = (L, deut = false) => (deut ? 20 : 10) * P(L) // 注意：没有乘 SPEED

const lines = []
const say = (s) => lines.push(s)

// 1) 边际回本：把矿从 L-1 升到 L 的成本 / 增加的单位时间产量
say('=== 1. 金属矿边际回本时间（成本 60×1.5^L，产量 50×P(L)×4）===')
say('等级'.padEnd(6) + '升级成本'.padEnd(14) + '时产增量'.padEnd(14) + '回本(小时)'.padEnd(12) + '回本(天)')
for (const L of [5, 10, 15, 20, 25, 30, 35, 40]) {
  const c = 60 * Math.pow(1.5, L - 1)
  const d = metalProd(L) - metalProd(L - 1)
  const payback = c / d
  say(
    String(L).padEnd(6) +
      Math.round(c).toLocaleString().padEnd(14) +
      Math.round(d).toLocaleString().padEnd(14) +
      payback.toFixed(1).padEnd(12) +
      (payback / 24).toFixed(1),
  )
}

say('')
say('=== 2. 能源供需：三个矿同级时的电力缺口（bug：solarOutput 乘了 SPEED，耗电没乘）===')
say('矿等级'.padEnd(8) + '总耗电'.padEnd(14) + '同级电站发电'.padEnd(16) + '供需比'.padEnd(12) + '对应 eta')
for (const L of [10, 20, 30, 40]) {
  const need = energyUse(L) * 2 + energyUse(L, true)
  const have = solarOut(L)
  const ratio = Math.min(1, have / need)
  say(
    String(L).padEnd(8) +
      Math.round(need).toLocaleString().padEnd(14) +
      Math.round(have).toLocaleString().padEnd(16) +
      (have / need).toFixed(2).padEnd(12) +
      ratio.toFixed(2),
  )
}
say('→ 供需比恒远大于 1 意味着 withEnergyDeficit 永远取上限 1，能源系统完全失效。')
say('')
say('若把 energyConsumption 也乘 SPEED（恢复原版 20:10 的发电/耗电比）：')
for (const L of [10, 20, 30, 40]) {
  const need = (energyUse(L) * 2 + energyUse(L, true)) * SPEED
  const have = solarOut(L)
  say(`  矿 Lv.${L}: 需 ${Math.round(need).toLocaleString()} vs 同级电站 ${Math.round(have).toLocaleString()} → ratio ${(have / need).toFixed(2)}（<1 即需要多建电站，张力恢复）`)
}

say('')
say('=== 3. 单星建筑空间预算（maxFields = 200 + 地形改造器×15）===')
{
  const budget = 200
  // 一组典型后期配置
  const alloc = { 1: 30, 2: 28, 3: 25, 4: 30, 14: 10, 21: 12, 22: 10, 23: 10, 24: 10, 31: 10, 44: 4 }
  let used = 0
  for (const k in alloc) used += alloc[k]
  say(`示例配置合计占用 ${used}/${budget}，剩余 ${budget - used}`)
  say(`若继续深挖：金属 30→35 需额外 5 格，晶体 28→33 需 5 格，仅剩 ${budget - used} 格可用`)
  say('→ 地形改造器修复后可解禁扩容，但每级净收益仅 +14 格（自身占 1 格），成本却是 50k晶+25k重氢×2^L')
}

say('')
say('=== 4. 掠夺 vs 挖矿：持续收益率对比 ===')
{
  const regen = { 0: 200, 1: 500, 2: 800 } // 金属/小时
  const fleetSlots = 5 // 计算机技术满级
  say(`NPC 资源再生（金属/时）：难度0 ${regen[0]}｜难度1 ${regen[1]}｜难度2 ${regen[2]}`)
  say(`并发 ${fleetSlots} 条航线全打难度2：${(regen[2] * fleetSlots).toLocaleString()} 金属/时（上限，忽略飞行与损失）`)
  say(`对照单星金属矿产量：Lv.10 ${Math.round(metalProd(10)).toLocaleString()}｜Lv.20 ${Math.round(metalProd(20)).toLocaleString()}｜Lv.30 ${Math.round(metalProd(30)).toLocaleString()} 金属/时`)
  say('→ 掠夺的"一次性开罐"收益高，但可持续速率受再生上限约束；')
  say('  真正的长期引擎仍是矿产，且殖民地数量（1+电脑技术，上限 7）决定产能规模。')
}

say('')
say('=== 5. 开局节奏check ===')
{
  let metal = 6000
  const targets = [[4, 1], [1, 1], [1, 2], [1, 3]]
  say(`开局金属 ${metal.toLocaleString()}，首升 太阳能电站→1 成本 ${75}，再金属矿→1 成本 ${60}`)
  say('→ 开局预算充裕，前 10 级几乎无摩擦；决定前期体感的是教程引导是否指向正确目标。')
}

console.log(lines.join('\n'))
