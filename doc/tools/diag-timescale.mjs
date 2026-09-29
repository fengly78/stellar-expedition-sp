// 倍速感知诊断：把 tick 的真实增量算出来，看玩家在不同倍速下每秒能看到什么。
// 复刻 state.ts tick() 与 produce() 的逻辑。

const SPEED = 4
const TICK_MS = 1000 // GameScreen.tsx:64 setInterval(tick, 1000)

const productionFactor = (L) => L * Math.pow(1.1, L)
const metalProduction = (L) => 50 * productionFactor(L) * SPEED
const storageCapacity = (L) => 10000 * Math.pow(2, L)
const fmtFloor = (n) => Math.floor(n).toString()

console.log('=== 1. 每秒可见增量（界面用 Math.floor 取整）===')
console.log('矿等级 | 每游戏小时 | 1x每秒 | 2x每秒 | 4x每秒 | 1x涨1点需 | 4x涨1点需')
for (const L of [1, 2, 3, 5, 8, 10, 15, 20, 30]) {
  const perGameHour = metalProduction(L)
  const perSec1 = (perGameHour / 3600000) * TICK_MS * 1
  const perSec2 = (perGameHour / 3600000) * TICK_MS * 2
  const perSec4 = (perGameHour / 3600000) * TICK_MS * 4
  const t1 = (1 / perSec1).toFixed(1)
  const t4 = (1 / perSec4).toFixed(1)
  console.log(
    `Lv.${String(L).padEnd(2)} | ${String(Math.round(perGameHour)).padStart(10)} | ` +
      `${perSec1.toFixed(3).padStart(7)} | ${perSec2.toFixed(3).padStart(7)} | ${perSec4.toFixed(3).padStart(7)} | ` +
      `${(t1 + 's').padStart(9)} | ${(t4 + 's').padStart(8)}`,
  )
}

console.log('\n=== 2. 满仓截断：什么时候调倍速也没用 ===')
console.log('仓库等级 | 容量 | 开局6000金属，矿Lv.X 满仓所需游戏小时')
for (const st of [0, 1, 2, 3]) {
  const cap = storageCapacity(st)
  const out = []
  for (const L of [5, 10, 20]) {
    const hours = (cap - 6000) / metalProduction(L)
    out.push(`矿Lv.${L}=${hours.toFixed(1)}h`)
  }
  console.log(`Lv.${st} | ${String(cap).padStart(7)} | ${out.join('  ')}`)
}

console.log('\n=== 3. 满仓后：无论几倍速，增量恒为 0 ===')
console.log('storageCapacity(0) = 10000，母星开局 6000 金属 → 仅剩 4000 空间')
console.log('矿Lv.10 (5187/时) 在 4x 下真实速率 = ' + (metalProduction(10) * 4).toFixed(0) + '/真实小时，但满仓后全部丢弃')

console.log('\n=== 4. 顶栏显示值是否随倍速变化 ===')
console.log('顶栏渲染: +{fmt(rates.metal)}/时  ← rates 来自 planetProduction()，不含 timeScale')
for (const L of [10]) {
  console.log(`矿Lv.${L}: 1x 显示 ${fmtFloor(metalProduction(L))}/时，2x 显示 ${fmtFloor(metalProduction(L))}/时，4x 显示 ${fmtFloor(metalProduction(L))}/时 → 三者完全相同`)
}

console.log('\n=== 5. 反直觉点：SPEED=4 已经内置 ===')
console.log(`metalProduction 内含 SPEED=${SPEED}，即「每游戏小时」产量已被放大 ${SPEED} 倍`)
console.log(`4x 倍速再乘 4 → 真实速率 = 显示值 × ${SPEED} × 4 = 显示值的 ${SPEED * 4} 倍`)
console.log(`矿Lv.10: 显示 ${Math.round(metalProduction(10))}/时，4x 真实到账 ${Math.round(metalProduction(10) * 4)}/真实小时`)

console.log('\n=== 6. 时间倍速真正生效的地方（对照组）===')
console.log('建筑/科技/舰船队列: finishAt 基于 gameTime，gameNow += dtWall * timeScale → 生效')
console.log('舰队航行 arriveAt:  同上 → 生效')
console.log('资源产出:           同样走 gameNow → 生效，但受 Math.min(容量) 截断')
console.log('结论: 倍速逻辑本身没坏，坏在「产出被截断」+「显示值不含倍速」')
