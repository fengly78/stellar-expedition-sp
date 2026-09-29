import { useState } from 'react'
import { fleetFromIntel, runSimulationAsync, SIM_SHIP_IDS, type FleetCounts, type SimulatorResult } from '../game/battleSim'
import { getIntel } from '../game/serverApi'

import { useLocale, translateTerm } from '../game/i18n'

interface Props {
  baseUrl: string
  ownerId: number
  token?: string
  /** 攻方预填（调用方传入在港舰船；组件内可改） */
  attackerPrefill: FleetCounts
}

const OUTCOME_LABEL = {
  'attacker-win': 'sim.outcomeAttacker',
  'defender-win': 'sim.outcomeDefender',
  draw: 'sim.outcomeDraw',
} as const

/**
 * 战斗模拟器（G6）：本地推演编队对抗——使用与线上一致的 battle.ts 引擎与 web 线 SHIPS 数值，
 * 结果确定性可复算。守方可从最新侦察报告一键回填。纯推演：不产生任何命令/资产变更。
 */
export default function BattleSimulator({ baseUrl, ownerId, token, attackerPrefill }: Props) {
  const { t } = useLocale()
  const [attacker, setAttacker] = useState<FleetCounts>(() => {
    const init: FleetCounts = {}
    for (const id of SIM_SHIP_IDS) {
      const n = attackerPrefill[id] ?? 0
      if (n > 0) init[id] = n
    }
    return init
  })
  const [defender, setDefender] = useState<FleetCounts>({})
  const [result, setResult] = useState<SimulatorResult | null>(null)
  /** Worker 优先（大编队不卡主线程），同步回退保证任何环境都有结果。 */
  async function run() {
    if (simBusy) return
    setSimBusy(true)
    try {
      setResult(await runSimulationAsync(attacker, defender))
    } finally {
      setSimBusy(false)
    }
  }
  const [busy, setBusy] = useState(false)
  const [simBusy, setSimBusy] = useState(false)
  const [intelNote, setIntelNote] = useState<string | null>(null)

  const setCount = (side: 'attacker' | 'defender', id: number, n: number) => {
    const v = Math.max(0, Math.floor(n || 0))
    const setter = side === 'attacker' ? setAttacker : setDefender
    setter((prev) => ({ ...prev, [id]: v }))
  }

  /** 从最新侦察快照回填守方编队（fleetFromIntel 做键名归一与未知键登记）。 */
  async function backfillFromIntel() {
    setBusy(true)
    try {
      const snaps = await getIntel(baseUrl, ownerId, token || undefined)
      const hit = snaps.find((s) => s.visible?.ships && Object.keys(s.visible.ships).length > 0)
      if (!hit) {
        setIntelNote(t('sim.noIntelReport'))
        return
      }
      const { counts, note } = fleetFromIntel(hit.visible?.ships)
      setDefender(counts)
      setIntelNote(t('sim.intelSource', { target: hit.target, note, at: hit.observed_at ? new Date(hit.observed_at).toLocaleString() : '?' }))
    } catch (e) {
      setIntelNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const total = (c: FleetCounts) => Object.values(c).reduce((a, b) => a + b, 0)

  return (
    <details className="panel p-3 text-xs" open>
      <summary className="cursor-pointer">{t('sim.summary')}</summary>

      <table className="mt-2 w-full text-left">
        <thead>
          <tr className="text-ink-3">
            <th className="py-1">{t('sim.shipType')}</th>
            <th>{t('sim.attackerCount')}</th>
            <th>{t('sim.defenderCount')}</th>
          </tr>
        </thead>
        <tbody>
          {SIM_SHIP_IDS.map((id) => (
            <tr key={id}>
              <td className="py-1">{translateTerm(id, 'ships')}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  value={attacker[id] ?? 0}
                  aria-label={t('sim.attackerAria', { name: translateTerm(id, 'ships') })}
                  onChange={(e) => setCount('attacker', id, +e.target.value)}
                  className="num w-20 rounded-md border border-edge bg-surface-2 px-2 py-1 text-ink"
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  value={defender[id] ?? 0}
                  aria-label={t('sim.defenderAria', { name: translateTerm(id, 'ships') })}
                  onChange={(e) => setCount('defender', id, +e.target.value)}
                  className="num w-20 rounded-md border border-edge bg-surface-2 px-2 py-1 text-ink"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex gap-2">
        <button className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy} onClick={() => { backfillFromIntel() }}>
          {t('common.fillDefender')}
        </button>
        <button
          className="btn btn-primary min-h-11 flex-1 text-xs"
          disabled={simBusy || busy || (total(attacker) === 0 && total(defender) === 0)}
          onClick={() => { run() }}
        >
          {simBusy ? t('sim.running') : t('sim.run')}
        </button>
      </div>
      {intelNote && <p className="mt-1 text-ink-3" role="status">{intelNote}</p>}

      {result && (
        <div className="mt-3 space-y-1 border-t border-edge pt-2">
          <p className="text-sm font-semibold text-accent-2">
            {t(OUTCOME_LABEL[result.outcome])} · {t('sim.rounds', { n: result.rounds })}
          </p>
          <p className="num">
            {t('sim.attackerStat', { alive: total(result.attackerSurvivors), lost: total(result.attackerLosses) })}
            {t('sim.lostValue', { n: result.attackerLostValue })}
          </p>
          <p className="num">
            {t('sim.defenderStat', { alive: total(result.defenderSurvivors), lost: total(result.defenderLosses) })}
            {t('sim.lostValue', { n: result.defenderLostValue })}
          </p>
          <p className="num text-ink-3">
            {t('sim.debris', { m: result.debrisM, c: result.debrisC })}
          </p>
          <details>
            <summary className="cursor-pointer text-ink-3">{t('sim.details')}</summary>
            <p className="num mt-1">{t('sim.attackerAlive', { n: JSON.stringify(result.attackerSurvivors) })}</p>
            <p className="num">{t('sim.attackerDestroyed', { n: JSON.stringify(result.attackerLosses) })}</p>
            <p className="num">{t('sim.defenderAlive', { n: JSON.stringify(result.defenderSurvivors) })}</p>
            <p className="num">{t('sim.defenderDestroyed', { n: JSON.stringify(result.defenderLosses) })}</p>
          </details>
        </div>
      )}
    </details>
  )
}
