// 全量数值体检：复刻源码公式，输出可复算的建模表
const SPEED = 4
const pf = (L) => L * Math.pow(1.1, L)

// ---------- 源码常量 ----------
const METAL_BASE = 50, CRY_BASE = 35, DEU_BASE = 18
const SOLAR_BASE = 20, CONS_M = 10, CONS_C = 10, CONS_D = 20
const storage = (L) => 10000 * Math.pow(2, L)

const BUILDINGS = {
  1: { name: '金属矿', cost: { m: 60, c: 15, d: 0 }, f: 1.5, req: { 4: 1 } },
  2: { name: '晶体矿', cost: { m: 48, c: 24, d: 0 }, f: 1.6, req: { 4: 1 } },
  3: { name: '重氢', cost: { m: 225, c: 75, d: 0 }, f: 1.5, req: { 4: 1 } },
  4: { name: '太阳能', cost: { m: 75, c: 30, d: 0 }, f: 1.5, req: {} },
  14: { name: '机器人', cost: { m: 400, c: 120, d: 200 }, f: 2, req: {} },
  22: { name: '金属仓', cost: { m: 1000, c: 0, d: 0 }, f: 2, req: {} },
  33: { name: '地形改造', cost: { m: 0, c: 50000, d: 25000 }, f: 2, req: {} },
}
const TECHS = {
  113: { name: '能源', cost: { m: 0, c: 800, d: 400 }, f: 1.75 },
  115: { name: '燃烧引擎', cost: { m: 400, c: 0, d: 600 }, f: 2 },
  117: { name: '脉冲引擎', cost: { m: 1200, c: 2000, d: 500 }, f: 1.6 },
  109: { name: '武器', cost: { m: 800, c: 0, d: 0 }, f: 2 },
  108: { name: '计算机', cost: { m: 0, c: 400, d: 600 }, f: 2 },
}

const SHIPS = {
  204: { name: '轻战', a: 50, s: 10, h: 400, cost: { m: 3000, c: 0, d: 0 }, speed: 12500, cargo: 50, fuel: 20 },
  205: { name: '重战', a: 150, s: 25, h: 1000, cost: { m: 6000, c: 2000, d: 0 }, speed: 10000, cargo: 100, fuel: 75 },
  206: { name: '巡洋', a: 400, s: 50, h: 2700, cost: { m: 20000, c: 7000, d: 2000 }, speed: 15000, cargo: 800, fuel: 300 },
  207: { name: '战列', a: 1200, s: 200, h: 6000, cost: { m: 45000, c: 15000, d: 0 }, speed: 10000, cargo: 1500, fuel: 750 },
  202: { name: '小运', a: 5, s: 10, h: 4000, cost: { m: 2000, c: 2000, d: 0 }, speed: 5000, cargo: 5000, fuel: 20 },
  211: { name: '轰炸机', a: 1000, s: 50, h: 7500, cost: { m: 50000, c: 25000, d: 15000 }, speed: 4000, cargo: 500, fuel: 1000 },
}
const DEFENSES = {
  401: { name: '火箭', a: 80, s: 20, h: 2000, cost: { m: 2000, c: 0, d: 0 } },
  402: { name: '轻激', a: 100, s: 25, h: 2000, cost: { m: 1500, c: 500, d: 0 } },
  403: { name: '重激', a: 250, s: 100, h: 8000, cost: { m: 6000, c: 2000, d: 0 } },
  404: { name: '高斯', a: 1100, s: 200, h: 35000, cost: { m: 20000, c: 15000, d: 2000 } },
  405: { name: '离子', a: 150, s: 500, h: 8000, cost: { m: 2000, c: 6000, d: 0 } },
  406: { name: '等离子', a: 3000, s: 300, h: 100000, cost: { m: 50000, c: 50000, d: 30000 } },
}
// 商人换算：金属1 / 晶体1.5 / 重氢3
const worth = (r) => r.m + r.c * 1.5 + r.d * 3

const out = []
const P = (s) => out.push(s)

// ============ 1. 三矿边际回本 ============
P('【1】矿井边际回本时间（小时，1x 真实时；成本按金属当量）')
P('等级\t金属矿\t\t晶体矿\t\t重氢\t\t（成本/产量增量）')
{
  const rows = []
  for (const L of [5, 10, 15, 20, 25, 30, 35, 40]) {
    const cells = []
    for (const [b, base] of [[1, METAL_BASE], [2, CRY_BASE], [3, DEU_BASE]]) {
      const def = BUILDINGS[b]
      const cost = worth(def.cost) * Math.pow(def.f, L)
      const gain = base * (pf(L + 1) - pf(L)) * SPEED
      cells.push((cost / gain).toFixed(1))
    }
    rows.push(`Lv.${L}\t${cells[0]}\t\t${cells[1]}\t\t${cells[2]}`)
  }
  P(rows.join('\n'))
}

// ============ 2. 研究时间恒定缺陷 ============
P('')
P('【2】研究时间 vs 成本（注意时间不随等级增长）')
P('科技\t等级\t成本(金属当量)\t研究时间(秒,实验室Lv.20)\t每百万资源耗时(秒)')
{
  for (const id of [113, 117, 109]) {
    const t = TECHS[id]
    for (const L of [1, 5, 10, 15, 20]) {
      const cost = worth(t.cost) * Math.pow(t.f, L)
      const time = (t.cost.m + t.cost.c) / SPEED / (1 + 20)
      P(`${t.name}\tLv.${L}\t${(cost / 1e6).toFixed(2)}M\t\t${time.toFixed(1)}\t\t\t${((time / cost) * 1e6).toFixed(1)}`)
    }
  }
}
P('>> 诊断：研究时间只由基础成本决定，与等级无关。等级越高，单位资源所需时间越趋近 0。')
P('>> 对照 buildingTime 是 baseTime × factor^L / SPEED / (1+机器人)，随等级指数增长 —— 两者不一致。')

// ============ 3. 防御性价比与护盾免疫线 ============
P('')
P('【3】防御设施性价比（6 回合口径，有效生命 = hull + 6×shield）')
P('防御\t成本(当量)\t攻击\t护盾\t装甲\t输出/资源\t生命/资源\t免疫线(挡住攻击<)')
{
  for (const id of [401, 402, 403, 404, 405, 406]) {
    const d = DEFENSES[id]
    const w = worth(d.cost)
    const eff = d.h + 6 * d.s
    P(`${d.name}\t${w}\t\t${d.a}\t${d.s}\t${d.h}\t${((d.a * 6) / w).toFixed(3)}\t\t${(eff / w).toFixed(2)}\t\t${d.s}`)
  }
}
P('>> 诊断：输出/资源 随等级单调下降（火箭 0.240 → 等离子 0.084）。高阶防御的唯一价值是护盾免疫线。')

P('')
P('【3b】护盾免疫线：谁能打穿谁（攻方 attack vs 守方 shield，无科技加成）')
{
  const ships = [204, 205, 206, 207, 211]
  const defs = [401, 402, 403, 404, 405, 406]
  P('舰船\\防御\t' + defs.map((d) => DEFENSES[d].name).join('\t'))
  for (const s of ships) {
    const row = defs.map((d) => (SHIPS[s].a > DEFENSES[d].s ? '破盾' : '免疫'))
    P(`${SHIPS[s].name}(攻${SHIPS[s].a})\t${row.join('\t')}`)
  }
}

// ============ 4. 舰船性价比 ============
P('')
P('【4】舰船性价比')
P('舰船\t成本(当量)\t攻击\t装甲\t货舱\t输出/资源\t生命/资源\t货运/资源')
{
  for (const id of [204, 205, 206, 207, 202, 211]) {
    const s = SHIPS[id]
    const w = worth(s.cost)
    P(`${s.name}\t${w}\t\t${s.a}\t${s.h}\t${s.cargo}\t${((s.a * 6) / w).toFixed(3)}\t\t${((s.h + 6 * s.s) / w).toFixed(2)}\t\t${(s.cargo / w).toFixed(2)}`)
  }
}

// ============ 5. 战斗模拟（复刻 battle.ts） ============
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function simulate(atkUnits, defUnits, rounds = 6, trials = 400, weapons = 0, shield = 0, armour = 0) {
  const wa = 1 + 0.1 * weapons, ws = 1 + 0.1 * shield, wh = 1 + 0.1 * armour
  let atkSurv = 0, defSurv = 0, atkLossVal = 0, defLossVal = 0
  for (let t = 0; t < trials; t++) {
    const rnd = mulberry32(t * 7919 + 13)
    const mk = (spec, count) => Array.from({ length: count }, () => ({
      a: spec.a * wa, sMax: spec.s * ws, s: spec.s * ws, hMax: spec.h * wh, h: spec.h * wh,
    }))
    let A = []
    for (const id in atkUnits) A = A.concat(mk(SHIPS[id], atkUnits[id]))
    let D = []
    for (const id in defUnits) D = D.concat(mk(DEFENSES[id], defUnits[id]))
    const a0 = A.length, d0 = D.length
    for (let r = 0; r < rounds; r++) {
      const strike = (src, dst) => {
        for (const u of src) {
          if (dst.length === 0) break
          let times = 1
          const target = dst[Math.floor(rnd() * dst.length)]
          const hit = () => {
            const dmg = u.a
            if (dmg < 0.01 * target.sMax) return
            const absorbed = Math.min(target.s, dmg)
            target.s -= absorbed
            const rest = dmg - absorbed
            if (rest > 0) {
              target.h -= rest
              const ratio = target.h / target.hMax
              if (target.h <= 0 || (ratio < 0.7 && rnd() < 1 - ratio)) target.h = 0
            }
          }
          hit()
          while (times < 8 && rnd() < 0.0) { times++; hit() }
        }
      }
      strike(A, D)
      strike(D, A)
      A = A.filter((u) => u.h > 0)
      D = D.filter((u) => u.h > 0)
      for (const u of A) u.s = u.sMax
      for (const u of D) u.s = u.sMax
      if (A.length === 0 || D.length === 0) break
    }
    atkSurv += A.length
    defSurv += D.length
    atkLossVal += a0 - A.length
    defLossVal += d0 - D.length
  }
  return { atkSurv: atkSurv / trials, defSurv: defSurv / trials, atkLoss: atkLossVal / trials, defLoss: defLossVal / trials }
}

P('')
P('【5】战斗模拟（复刻 battle.ts：6 回合、随机选目标、护盾每回合回满、无 rapidfire）')
P('对抗\t\t\t\t攻方存活\t守方存活\t战损比')
{
  const cases = [
    [{ 204: 100 }, { 401: 24 }, '100 轻战 vs 24 火箭'],
    [{ 204: 100 }, { 404: 1 }, '100 轻战 vs 1 高斯（等价资源）'],
    [{ 205: 50 }, { 401: 24 }, '50 重战 vs 24 火箭'],
    [{ 205: 50 }, { 404: 1 }, '50 重战 vs 1 高斯'],
    [{ 206: 20 }, { 404: 1 }, '20 巡洋 vs 1 高斯'],
    [{ 204: 200 }, { 401: 48 }, '200 轻战 vs 48 火箭（等比放大）'],
  ]
  for (const [a, d, label] of cases) {
    const r = simulate(a, d)
    const aTotal = Object.values(a)[0], dTotal = Object.values(d)[0]
    P(`${label}\t\t${r.atkSurv.toFixed(0)}/${aTotal}\t\t${r.defSurv.toFixed(0)}/${dTotal}\t\t攻损${r.atkLoss.toFixed(1)} 守损${r.defLoss.toFixed(1)}`)
  }
}

P('')
P('【5b】同资源对抗：火箭党 vs 高斯党（各约 5.8M 金属当量防御，攻方 200 轻战）')
{
  const ra = simulate({ 204: 200 }, { 401: 2900 })
  const ga = simulate({ 204: 200 }, { 404: 120 })
  P(`2900 火箭(5.8M)\t攻方存活 ${ra.atkSurv.toFixed(0)}/200\t守方存活 ${ra.defSurv.toFixed(0)}\t攻损 ${ra.atkLoss.toFixed(0)}`)
  P(`120 高斯(5.82M)\t攻方存活 ${ga.atkSurv.toFixed(0)}/200\t守方存活 ${ga.defSurv.toFixed(0)}\t攻损 ${ga.atkLoss.toFixed(0)}`)
}

// ============ 6. 掠夺 vs 矿产 ============
P('')
P('【6】掠夺收益 vs 矿产收益')
{
  const raidPerHour = 4000
  for (const L of [10, 20, 30]) {
    const mine = METAL_BASE * pf(L) * SPEED
    P(`金属矿 Lv.${L}\t${mine.toFixed(0)}/时\t满配掠夺 4000/时 = ${((raidPerHour / mine) * 100).toFixed(1)}%`)
  }
  const npcStock = 131000
  P(`NPC 难度2 平均存量 ${npcStock}，单次掠夺上限 50% = ${npcStock * 0.5}`)
  P(`再生 800/时 → 打完一颗需 ${(npcStock * 0.5 / 800).toFixed(0)} 小时回满可抢额度`)
}

// ============ 7. 战役难度墙 ============
P('')
P('【7】战役关卡：敌方战力 vs 通关所需投入')
{
  const stages = [
    [1, { 204: 3 }, {}, { m: 2000, c: 1000, d: 0 }],
    [2, { 204: 8 }, { 401: 2 }, { m: 5000, c: 2000, d: 1000 }],
    [3, { 204: 10, 205: 5 }, { 401: 5, 402: 3 }, { m: 10000, c: 5000, d: 2000 }],
    [4, { 204: 15, 205: 10 }, { 401: 8, 404: 2 }, { m: 20000, c: 10000, d: 5000 }],
    [5, { 204: 20, 205: 15, 206: 2 }, { 402: 6, 403: 2 }, { m: 30000, c: 15000, d: 8000 }],
    [6, { 205: 20, 206: 8 }, { 403: 6, 404: 3 }, { m: 60000, c: 30000, d: 15000 }],
    [7, { 205: 20, 206: 10, 207: 4 }, { 404: 5, 405: 3 }, { m: 100000, c: 50000, d: 25000 }],
    [8, { 204: 30, 205: 25, 206: 10, 207: 6 }, { 403: 10, 404: 5, 406: 2 }, { m: 200000, c: 100000, d: 50000 }],
  ]
  P('关卡\t敌方总装甲\t敌方总攻击\t奖励(金属当量)\t奖励/敌方装甲')
  for (const [n, fleet, def, reward] of stages) {
    let h = 0, a = 0
    for (const id in fleet) { h += SHIPS[id].h * fleet[id]; a += SHIPS[id].a * fleet[id] }
    for (const id in def) { h += DEFENSES[id].h * def[id]; a += DEFENSES[id].a * def[id] }
    const rw = worth(reward)
    P(`${n}\t${h}\t\t${a}\t\t${rw}\t\t${(rw / h).toFixed(3)}`)
  }
  P('>> 第 8 关敌方含 2 座等离子炮（装甲 10 万/座、护盾 300），需战列级舰队；')
  P('>> 但奖励 200k 金属当量 ≈ 2 座等离子的造价，投入产出比极低。')
}

// ============ 8. 殖民地位置排序 ============
P('')
P('【8】殖民地位置：综合产出系数（温度 T=200-10×位置，重氢再乘温度系数）')
{
  const POS = { 1: [0.8, 1.3, 0.5], 5: [1, 1, 0.8], 8: [1, 1, 1], 10: [1, 0.95, 1.2], 13: [0.85, 0.8, 1.5], 15: [0.75, 0.7, 1.7] }
  P('位置\t金\t晶\t重（含温度）\t加权总量(按1:1.5:3)')
  for (const p in POS) {
    const [m, c, d] = POS[p]
    const T = 200 - 10 * p
    const kt = 1.44 - 0.004 * T
    const dw = d * kt
    const total = m * 1 + c * 1.5 + dw * 3 / kt * kt
    P(`${p}\t${m}\t${c}\t${dw.toFixed(3)}\t\t${(m + c * 1.5 + dw * 3).toFixed(2)}`)
  }
  P('>> 重氢按商人价（×3）加权，但重氢实际消耗远小于金属，加权重氢会高估高位置价值。')
}

// ============ 9. 仓储匹配 ============
P('')
P('【9】不爆仓所需仓储等级（离线 12h 场景，母星）')
{
  P('矿井等级\t12小时产量\t需要仓储等级\t对应容量')
  for (const L of [10, 15, 20, 25, 30]) {
    const daily = METAL_BASE * pf(L) * SPEED * 12
    let lv = 0
    while (storage(lv) < daily && lv < 10) lv++
    P(`Lv.${L}\t\t${daily.toFixed(0)}\t\tLv.${lv}\t\t\t${storage(lv)}`)
  }
  P('>> 仓储上限 Lv.10 = 10.24M。金属矿 Lv.30 十二小时产出已超过它 → 中期后离线必然溢仓。')
}

// ============ 10. 能源：修正后影响 ============
P('')
P('【10】能源公式不一致的影响面（若统一乘 SPEED）')
{
  P('矿等级\t当前同级ratio\t修正后同级ratio\t当前需落后几级才缺电\t修正后需落后几级')
  for (const L of [10, 20, 30]) {
    const need = (CONS_M + CONS_C + CONS_D) * pf(L)
    const now = (SOLAR_BASE * pf(L) * SPEED) / need
    const fixed = (SOLAR_BASE * pf(L) * SPEED) / (need * SPEED)
    let dn = 0, df = 0
    for (let d = 0; d <= 20; d++) {
      if (!dn && (SOLAR_BASE * pf(L - d) * SPEED) / need < 1) dn = d
      if (!df && (SOLAR_BASE * pf(L - d) * SPEED) / (need * SPEED) < 1) df = d
    }
    P(`Lv.${L}\t${now.toFixed(2)}\t\t${fixed.toFixed(2)}\t\t${dn}\t\t\t\t${df}`)
  }
}

console.log(out.join('\n'))
