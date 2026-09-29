// 第九轮改动验证：能源选项 B / C2 防御格效率 / C3 晶体曲线 / C4 NPC再生 / C6 修复分布
const SPEED = 4
const pf = (l) => l * Math.pow(1.1, l)

// --- 能源（新公式，对齐 objects.ts 改动后） ---
const solar = (l, t = 0) => 40 * pf(l) * (1 + 0.05 * t)
const sat = (n, tempMax) => n * (15 + tempMax * 0.12)
const cons = (l, d = false) => (d ? 20 : 10) * pf(l)

console.log('== 1. 能源选项 B：供需比（三矿同级 vs 电站等级） ==')
for (const L of [5, 10, 20, 30]) {
  const need = cons(L) + cons(L) + cons(L, true)
  const row = [`矿 Lv.${L}（耗 ${Math.round(need)}）`]
  for (const dl of [-2, -1, 0, 1]) {
    const s = solar(Math.max(0, L + dl))
    row.push(`电站${dl >= 0 ? '+' : ''}${dl}: ${(s / need).toFixed(2)}`)
  }
  console.log('  ' + row.join(' ｜ '))
}
console.log('  卫星补电：每颗 ' + sat(1, 40).toFixed(1) + '（tempMax=40），Lv.10 三矿耗 ' + Math.round(cons(10) + cons(10) + cons(10, true)) + ' → 卫星是补充手段而非替代')

// --- C2 防御格效率 ---
console.log('\n== 2. C2：每格伤害 vs 每资源伤害 ==')
const DEF = {
  401: { n: '火箭发射器', atk: 80, cost: 2000, f: 1 },
  402: { n: '轻型激光炮', atk: 100, cost: 2000, f: 1 },
  403: { n: '重型激光炮', atk: 250, cost: 8000, f: 2 },
  404: { n: '高斯炮', atk: 1100, cost: 37000, f: 3 },
  405: { n: '离子炮', atk: 150, cost: 8000, f: 3 },
  406: { n: '等离子炮台', atk: 3000, cost: 130000, f: 4 },
}
for (const [id, d] of Object.entries(DEF)) {
  console.log(`  ${d.n.padEnd(6)} 攻/格 ${(d.atk / d.f).toFixed(0).padStart(4)} ｜ 攻/千资源 ${(d.atk / (d.cost / 1000)).toFixed(1).padStart(5)} ｜ 占地 ${d.f}`)
}
console.log('  200 格空间对比：200 火箭 = ' + 200 * 80 + ' 攻 vs 50 等离子 = ' + 50 * 3000 + ' 攻（' + (50 * 3000 / (200 * 80)).toFixed(1) + ' 倍）')

// --- C3 晶体矿回本 ---
console.log('\n== 3. C3：晶体矿边际回本（factor 1.6 → 1.5） ==')
const costAt = (L, f) => (48 + 24) * Math.pow(f, L)
const prodAt = (L) => 35 * pf(L) * SPEED * 1.0 // posCoef=1
for (const L of [10, 20, 30]) {
  const gain = prodAt(L + 1) - prodAt(L)
  const oldH = costAt(L, 1.6) / gain
  const newH = costAt(L, 1.5) / gain
  console.log(`  Lv.${L}→${L + 1}：旧 ${oldH.toFixed(0)}h → 新 ${newH.toFixed(0)}h`)
}

// --- C4 NPC 再生 ---
console.log('\n== 4. C4：NPC 再生速率（每时） ==')
for (const d of [0, 1, 2]) console.log(`  难度${d}：${200 + d * 300} → ${400 + d * 600}`)

// --- C6 修复分布 ---
console.log('\n== 5. C6：防御修复（逐座 70% 掷骰，10000 次模拟） ==')
const roll = (n) => { let r = 0; for (let i = 0; i < n; i++) if (Math.random() < 0.7) r++; return r }
for (const n of [1, 5, 20]) {
  let sum = 0, max = 0
  for (let i = 0; i < 10000; i++) { const r = roll(n); sum += r; if (r > max) max = r }
  console.log(`  被毁 ${n} 座：期望修复 ${(sum / 10000).toFixed(2)}（旧实现固定 ${Math.round(n * 0.7)}），最大 ${max}（≤${n} ✓）`)
}
