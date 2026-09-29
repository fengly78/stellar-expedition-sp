import { useEffect, useMemo, useRef, useState } from 'react'
import type { BattleInput, BattleOutput, FleetInput } from '../game/battle'
import { hash32, mulberry32 } from '../game/prng'
import { useLocale, findTerm } from '../game/i18n'

// 画布专用配色 —— 全站唯一允许的硬编码 hex。
// 灰阶与蓝/红在深底 (#070d1b) 上已提亮一档，保证舰船点位可辨。
const SHIP_COLORS: Record<number, string> = {
  202: '#d1d5db', 203: '#9ca3af', 204: '#22d3ee', 205: '#60a5fa',
  206: '#a78bfa', 207: '#ef4444', 208: '#34d399', 209: '#f59e0b', 210: '#facc15',
  211: '#f472b6', 212: '#fde047', 214: '#f87171',
  401: '#fb7185', 402: '#fb7185', 403: '#fb7185', 404: '#fb7185',
  405: '#fb7185', 406: '#fb7185', 407: '#818cf8', 408: '#818cf8',
}

function unitName(id: number): string {
  return findTerm(id) ?? `#${id}`
}

interface Slot {
  unitId: number
  name: string
  x: number
  y: number
  radius: number
  deathRound: number
}

type Side = 'attackerShips' | 'defenderShips'

function buildSideSlots(fleet: FleetInput, rounds: BattleOutput['rounds'], key: Side, side: 1 | -1): Slot[] {
  const slots: Slot[] = []
  const entries = Object.entries(fleet.units)
  let total = 0
  for (const [, u] of entries) total += u.amount
  if (total === 0) return slots

  // 布局随规模自适应：小规模保持方阵手感，大规模压缩列/行距与点半径，
  // 否则上千单位会按固定 24px 行距排到画布（640x360）之外，玩家只能看到前十几行。
  const cols = Math.min(24, Math.max(1, Math.ceil(Math.sqrt(total))))
  const rows = Math.ceil(total / cols)
  const stepX = 280 / cols
  const stepY = Math.min(24, 300 / rows)
  const radius = Math.max(2, Math.min(5, Math.min(stepX, stepY) / 2.2))

  let idx = 0
  for (const [idStr, u] of entries) {
    const unitId = +idStr
    for (let j = 0; j < u.amount; j++) {
      let death = rounds.length
      for (let d = 1; d <= rounds.length; d++) {
        if ((rounds[d - 1][key][unitId] ?? 0) <= j) {
          death = d
          break
        }
      }
      const col = idx % cols
      const row = Math.floor(idx / cols)
      slots.push({
        unitId,
        name: unitName(unitId),
        x: side === 1 ? 40 + col * stepX : 600 - col * stepX,
        y: 30 + row * stepY + (side === 1 ? 0 : 8),
        radius,
        deathRound: death,
      })
      idx++
    }
  }
  return slots
}

export default function BattleReplay({ input, output }: { input: BattleInput; output: BattleOutput }) {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const progressRef = useRef(0)
  const total = Math.max(1, output.rounds.length)

  // 布局必须随 input/output 重算。此前存在 ref 里且只在首次构建，
  // 导致切换战报时画布沿用上一条战斗的舰队布局。
  const { attackers, defenders } = useMemo(
    () => ({
      attackers: buildSideSlots(input.attackerFleets[0] ?? { fleetMissionId: 0, ownerId: 0, units: {} }, output.rounds, 'attackerShips', 1),
      defenders: buildSideSlots(input.defenderFleets[0] ?? { fleetMissionId: 0, ownerId: 1, units: {} }, output.rounds, 'defenderShips', -1),
    }),
    [input, output],
  )

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      progressRef.current = Math.min(total, progressRef.current + dt * speed)
      setProgress(progressRef.current)
      if (progressRef.current >= total) {
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, total])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // HiDPI：CSS 尺寸不变，backing store 按 devicePixelRatio 放大，
    // 之后所有绘制仍使用 640x360 逻辑坐标系（由 setTransform 缩放）。
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = Math.round(640 * dpr)
    const h = Math.round(360 * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const r = Math.min(Math.floor(progress), total - 1)
    const frac = progress - r

    ctx.fillStyle = '#070d1b'
    ctx.fillRect(0, 0, 640, 360)
    ctx.strokeStyle = '#26344f'
    ctx.beginPath()
    ctx.moveTo(320, 0)
    ctx.lineTo(320, 360)
    ctx.stroke()

    const drawSide = (slots: Slot[]) => {
      for (const s of slots) {
        const alive = s.deathRound > r
        const dyingNow = s.deathRound === r + 1 && frac > 0 && progress < total
        if (!alive && !dyingNow) continue

        let scale = 1
        let alpha = 1
        if (dyingNow) {
          const f = Math.min(1, frac * 2)
          scale = 1 + f * 1.5
          alpha = 1 - f
          if (f > 0 && f < 0.6) {
            ctx.fillStyle = `rgba(251, 146, 60, ${0.5 * (1 - f)})`
            ctx.beginPath()
            ctx.arc(s.x, s.y, 14 * (0.5 + f), 0, Math.PI * 2)
            ctx.fill()
          }
        }

        ctx.globalAlpha = alpha
        ctx.fillStyle = SHIP_COLORS[s.unitId] ?? '#e6edf7'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.radius * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    drawSide(attackers)
    drawSide(defenders)

    if (frac < 0.35 && progress < total && output.rounds[r]) {
      const aliveAttackers = attackers.filter((s) => s.deathRound > r)
      const aliveDefenders = defenders.filter((s) => s.deathRound > r)
      const hits = Math.min(14, output.rounds[r].hitsAttacker + output.rounds[r].hitsDefender)
      ctx.lineWidth = 1
      for (let i = 0; i < hits && aliveAttackers.length > 0 && aliveDefenders.length > 0; i++) {
        // ponytail: seeded PRNG per hit keeps BattleReplay animation deterministic — same battle input replays identically.
        const rng = mulberry32(hash32(r, i))
        const a = aliveAttackers[Math.floor(rng() * aliveAttackers.length)]
        const d = aliveDefenders[Math.floor(rng() * aliveDefenders.length)]
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(34, 211, 238, 0.5)' : 'rgba(251, 146, 60, 0.5)'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(d.x, d.y)
        ctx.stroke()
      }
    }

    ctx.fillStyle = '#a3b3cc'
    ctx.font = '12px sans-serif'
    ctx.fillText(progress >= total ? t('replay.finished', { n: total }) : t('replay.round', { n: r + 1 }), 8, 350)
  }, [progress, input, output, total, attackers, defenders])

  const round = output.rounds[Math.min(Math.floor(progress), total - 1)]

  const legendRow = (fleets: FleetInput[], key: 'attackerShips' | 'defenderShips', color: string) => {
    const fleets_ = fleets[0]
    if (!fleets_) return null
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {Object.entries(fleets_.units).map(([idStr, u]) => {
          const id = +idStr
          const alive = round ? (round[key][id] ?? 0) : u.amount
          return (
            <span key={id} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: SHIP_COLORS[id] ?? '#e6edf7' }} />
              <span className={`${color} num`}>{unitName(id)} ×{alive}</span>
              {alive < u.amount && <span className="num text-bad">-{u.amount - alive}</span>}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        role="img"
        aria-label={t('replay.aria')}
        className="w-full max-w-[640px] rounded-lg border border-edge"
      />
      <div className="flex items-center gap-2 text-sm">
        <button
          className="btn btn-primary min-h-11 sm:min-h-0"
          onClick={() => {
            if (progress >= total) {
              progressRef.current = 0
              setProgress(0)
            }
            setPlaying(!playing)
          }}
        >
          {playing ? t('replay.pause') : progress >= total ? t('replay.replay') : t('replay.play')}
        </button>
        <select
          className="field"
          aria-label={t('replay.speedAria')}
          value={speed}
          onChange={(e) => setSpeed(+e.target.value)}
        >
          <option value={1}>x1</option>
          <option value={2}>x2</option>
          <option value={4}>x4</option>
        </select>
        <input
          type="range"
          min={0}
          max={total}
          step={0.01}
          value={progress}
          aria-label={t('replay.progressAria')}
          onChange={(e) => {
            setPlaying(false)
            setProgress(+e.target.value)
          }}
          className="flex-1 accent-accent"
        />
        <span className="num w-16 text-right text-ink-2">
          {Math.min(Math.floor(progress) + 1, total)}/{total}
        </span>
      </div>
      {round && (
        <div className="num space-y-1 text-xs text-ink-2">
          <div>
            {t('replay.attackerHits', { n: round.hitsAttacker })}{t('common.pipe')}{t('replay.defenderHits', { n: round.hitsDefender })}{t('common.pipe')}
            {t('replay.attackerLoss', { n: Object.values(round.attackerLossesInRound).reduce((a, b) => a + b, 0) })}{t('common.pipe')}
            {t('replay.defenderLoss', { n: Object.values(round.defenderLossesInRound).reduce((a, b) => a + b, 0) })}
          </div>
          <div className="space-y-0.5 border-t border-edge pt-1">
            {legendRow(input.attackerFleets, 'attackerShips', 'text-crystal')}
            {legendRow(input.defenderFleets, 'defenderShips', 'text-metal')}
          </div>
        </div>
      )}
    </div>
  )
}
