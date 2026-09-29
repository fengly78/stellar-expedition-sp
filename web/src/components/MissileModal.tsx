import { useState } from 'react'
import Modal from './Modal'
import { distance, flightTime, fmt } from '../game/objects'
import { useGame } from '../game/state'
import type { Coordinate } from '../game/objects'
import NovaIcon from './NovaIcon'
import { formatDuration, translatePlanetName, useLocale } from '../game/i18n'

export default function MissileModal({ planetId, target, onClose }: { planetId: number; target: { coord: Coordinate; name: string }; onClose: () => void }) {
  const { t } = useLocale()
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const dispatchMissiles = useGame((s) => s.dispatchMissiles)
  const [count, setCount] = useState(1)
  const [msg, setMsg] = useState<string | null>(null)

  if (!planet) return null

  const owned = planet.defenses[502] ?? 0
  const silo = planet.buildings[44] ?? 0
  const dist = distance(planet.coords, target.coord)
  const travel = flightTime(dist, 30000)

  return (
    <Modal title={t('missile.strikeTitle', { g: target.coord.galaxy, s: target.coord.system, p: target.coord.position, name: translatePlanetName(target.name) })} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="text-ink-2 num">
          {t('missile.siloStock', { silo })} <span className="font-bold text-warn">{owned}</span>
        </div>
        <div className="text-xs text-ink-2">
          {t('missile.distance')} <span className="num">{fmt(dist)}</span>{t('common.pipe')}{t('missile.flight')} <span className="num">{formatDuration(travel)}</span>{t('common.pipe')}{t('missile.rules')}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={Math.max(1, owned)}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(owned, Math.floor(+e.target.value || 1))))}
            aria-label={t('missile.qtyAria')}
            className="field w-24 num"
          />
          <button onClick={() => setCount(Math.max(1, owned))} className="btn btn-ghost px-2 py-0.5 text-xs">
            {t('common.all')}
          </button>
          <button
            disabled={owned <= 0}
            onClick={() => {
              const err = dispatchMissiles(planetId, target.coord, count)
              setMsg(err)
              if (!err) onClose()
            }}
            className="btn btn-danger min-h-11 sm:min-h-0 ml-auto"
          >
            <NovaIcon name="missile" /> {t('missile.launch')}
          </button>
        </div>
        {msg && <div className="alert-bad" role="alert">{msg}</div>}
        {owned <= 0 && <div className="text-xs text-ink-2">{t('missile.empty')}</div>}
      </div>
    </Modal>
  )
}
