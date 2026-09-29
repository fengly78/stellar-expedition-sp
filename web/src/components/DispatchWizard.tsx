import { useState } from 'react'
import Modal from './Modal'
import { sfx } from '../game/audio'
import { distance, fleetCargo, fleetFuel, flightTime, fmt, shipSpeed } from '../game/objects'
import { useGame, type MissionType } from '../game/state'
import type { Coordinate } from '../game/objects'
import NovaIcon from './NovaIcon'
import { formatDuration, listSep, translatePlanetName, translateTerm, useLocale } from '../game/i18n'

const MISSION_LABEL: Record<MissionType, string> = {
  attack: 'fleet.type.attack', transport: 'fleet.type.transport', deploy: 'fleet.type.deploy', colonize: 'fleet.type.colonize', espionage: 'fleet.type.espionage', recycle: 'fleet.type.recycle', expedition: 'fleet.type.expedition', missile: 'fleet.type.missile',
}

const MISSION_DESC: Record<MissionType, string> = {
  attack: 'fleet.missionDesc.attack',
  transport: 'fleet.missionDesc.transport',
  deploy: 'fleet.missionDesc.deploy',
  colonize: 'fleet.missionDesc.colonize',
  espionage: 'fleet.missionDesc.espionage',
  recycle: 'fleet.missionDesc.recycle',
  expedition: 'fleet.missionDesc.expedition',
  missile: 'fleet.missionDesc.missile',
}

export default function DispatchWizard({
  originId,
  target,
  allowedTypes,
  onClose,
}: {
  originId: number
  target: { coord: Coordinate; name: string; kind: string }
  allowedTypes: MissionType[]
  onClose: () => void
}) {
  const { t } = useLocale()
  const origin = useGame((s) => s.planets.find((p) => p.id === originId))
  const techs = useGame((s) => s.techs)
  const dispatchMission = useGame((s) => s.dispatchMission)

  const [step, setStep] = useState(0)
  const [fleet, setFleet] = useState<Record<number, number>>({})
  const [type, setType] = useState<MissionType>(allowedTypes[0])
  const [cargo, setCargo] = useState({ metal: 0, crystal: 0, deuterium: 0 })
  const [msg, setMsg] = useState<string | null>(null)

  if (!origin) return null

  // 太阳能卫星是静止发电单元（速度 1），不参与任何航行任务，不列入派遣
  const ownedShips = Object.entries(origin.ships).filter(([id, n]) => n > 0 && +id !== 212)
  const activeIds = Object.keys(fleet).filter((id) => fleet[+id] > 0)
  const effectiveType = allowedTypes.includes(type) ? type : allowedTypes[0]

  const targetPlanet = useGame.getState().planets.find(
    (p) => p.coords.galaxy === target.coord.galaxy && p.coords.system === target.coord.system && p.coords.position === target.coord.position,
  )
  const gameTime = useGame.getState().gameTime
  const jumpReady =
    effectiveType === 'deploy' &&
    !!origin.isMoon &&
    !!targetPlanet?.isMoon &&
    (origin.buildings[43] ?? 0) >= 1 &&
    (targetPlanet.buildings[43] ?? 0) >= 1 &&
    gameTime >= (origin.lastJumpAt ?? 0) + 3600000 &&
    gameTime >= (targetPlanet.lastJumpAt ?? 0) + 3600000

  const preview = activeIds.length > 0
    ? (() => {
        const dist = distance(origin.coords, target.coord)
        const slowest = Math.min(...activeIds.map((id) => shipSpeed(+id, techs)))
        return { dist, travel: jumpReady ? 0 : flightTime(dist, slowest), fuel: jumpReady ? 0 : fleetFuel(fleet, dist), cargoCap: fleetCargo(fleet) }
      })()
    : null

  const submit = () => {
    const err = dispatchMission(originId, target.coord, effectiveType, fleet, cargo)
    if (err) {
      setMsg(err)
      sfx('error')
    } else {
      sfx('complete')
      onClose()
    }
  }

  return (
    <Modal title={t('fleet.dispatchTitle', { g: target.coord.galaxy, s: target.coord.system, p: target.coord.position, name: translatePlanetName(target.name) })} onClose={onClose} wide>
      <div className="mb-3 flex gap-1">
        {[t('fleet.stepShips'), t('fleet.stepCargo'), t('fleet.stepConfirm')].map((label, i) => (
          <span key={i} className={`chip ${step === i ? 'border-edge-hot text-accent-2' : ''}`}>
            {label}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-1 text-sm">
          {ownedShips.length === 0 && <div className="empty">{t('fleet.noShips')}</div>}
          {ownedShips.map(([id, owned]) => (
            <div key={id} className="flex items-center gap-2">
              <span className="w-28">{translateTerm(+id, 'ships')}</span>
              <span className="w-16 text-xs text-ink-3">{t('fleet.ownedNow')} <span className="num">{owned}</span></span>
              <input
                type="number"
                min={0}
                max={owned}
                value={fleet[+id] ?? ''}
                onChange={(e) => setFleet({ ...fleet, [+id]: Math.min(owned, Math.max(0, Math.floor(+e.target.value || 0))) })}
                aria-label={t('fleet.dispatchQtyAria', { name: translateTerm(+id, 'ships') })}
                className="field w-20 num"
              />
              <button onClick={() => setFleet({ ...fleet, [+id]: owned })} className="btn btn-ghost px-2 py-0.5 text-xs">
                {t('common.all')}
              </button>
            </div>
          ))}
          {ownedShips.length > 0 && (
            <button
              onClick={() => {
                const full: Record<number, number> = {}
                for (const [id, n] of ownedShips) full[+id] = n
                setFleet(full)
              }}
              className="btn btn-ghost px-2 py-1 text-xs"
            >
              {t('common.selectAllShips')}
            </button>
          )}
          <div className="flex justify-end pt-2">
            <button
              disabled={activeIds.length === 0}
              onClick={() => {
                setStep(1)
                sfx('click')
              }}
              className="btn btn-primary min-h-11 sm:min-h-0"
            >
              {t('common.nextStep')}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {allowedTypes.map((mt) => (
              <button
                key={mt}
                aria-pressed={effectiveType === mt}
                onClick={() => {
                  setType(mt)
                  sfx('click')
                }}
                className={`rounded-md border px-3 py-2 text-left ${effectiveType === mt ? 'border-edge-hot bg-surface-3 shadow-glow' : 'border-edge bg-surface/60 hover:border-edge-2'}`}
              >
                <div className={`font-semibold ${effectiveType === mt ? 'text-accent-2' : ''}`}>{t(MISSION_LABEL[mt])}</div>
                <div className="mt-0.5 text-xs text-ink-2">{t(MISSION_DESC[mt])}</div>
              </button>
            ))}
          </div>

          {effectiveType === 'transport' && (
            <div className="flex flex-wrap gap-3">
              {(['metal', 'crystal', 'deuterium'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1 text-sm">
                  {k === 'metal' ? t('common.metal') : k === 'crystal' ? t('common.crystal') : t('common.deuterium')}
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(origin.resources[k])}
                    aria-label={t('fleet.cargoAria', { res: k === 'metal' ? t('common.metal') : k === 'crystal' ? t('common.crystal') : t('common.deuterium') })}
                    value={cargo[k] || ''}
                    onChange={(e) => setCargo({ ...cargo, [k]: Math.max(0, Math.floor(+e.target.value || 0)) })}
                    className="field w-24 num"
                  />
                  <button
                    onClick={() => setCargo({ ...cargo, [k]: Math.floor(origin.resources[k]) })}
                    className="btn btn-ghost px-2 py-0.5 text-xs"
                  >
                    {t('common.max')}
                  </button>
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(0)} className="btn btn-ghost">
              {t('common.prevStep')}
            </button>
            <button
              onClick={() => {
                setStep(2)
                sfx('click')
              }}
              className="btn btn-primary min-h-11 sm:min-h-0"
            >
              {t('common.nextStep')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-edge bg-surface-3 p-3">
            <div className="font-semibold">{t(MISSION_LABEL[effectiveType])} → {translatePlanetName(target.name)}</div>
            <div className="mt-1 text-xs text-ink-2 num">
              {activeIds.map((id) => `${translateTerm(+id, 'ships')} ×${fleet[+id]}`).join(listSep())}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-ink-2 sm:grid-cols-4 num">
              <div>{t('fleet.distance', { n: fmt(preview.dist) })}</div>
              <div>{jumpReady ? <span className="text-accent-2"><NovaIcon name="energy" /> {t('fleet.jumpInstant')}</span> : t('fleet.flightTime', { time: formatDuration(preview.travel) })}</div>
              <div>{t('fleet.fuelCost', { n: preview.fuel })}</div>
              <div>{t('fleet.cargoCap', { n: fmt(preview.cargoCap) })}</div>
            </div>
            {effectiveType === 'transport' && (cargo.metal + cargo.crystal + cargo.deuterium > 0) && (
              <div className="mt-1 text-xs text-warn num">
                {t('fleet.cargoSummary', { m: fmt(cargo.metal), c: fmt(cargo.crystal), d: fmt(cargo.deuterium) })}
              </div>
            )}
          </div>
          {msg && <div className="alert-bad" role="alert">{msg}</div>}
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn btn-ghost">
              {t('common.prevStep')}
            </button>
            <button onClick={submit} className="btn btn-primary min-h-11 sm:min-h-0 px-6 font-semibold">
              <NovaIcon name="fleet" /> {t('fleet.depart')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
