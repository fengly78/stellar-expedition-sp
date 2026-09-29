import { useState } from 'react'
import { OFFICERS, fmt } from '../game/objects'
import { useGame } from '../game/state'
import { formatDuration, translatePlanetName, useLocale } from '../game/i18n'
import { ConfirmModal } from '../components/Modal'
import NovaIcon, { type NovaIconName } from '../components/NovaIcon'

const OFFICER_ICON: Record<string, NovaIconName> = { commander: 'officer', geologist: 'metal', engineer: 'building', tactician: 'campaign', diplomat: 'galaxy' }

export default function Officers() {
  const { t, locale } = useLocale()
  const en = locale === 'en'
  const officers = useGame((s) => s.officers)
  const planets = useGame((s) => s.planets)
  const hireOfficer = useGame((s) => s.hireOfficer)
  const fireOfficer = useGame((s) => s.fireOfficer)
  const now = useGame((s) => s.gameTime)
  const [msg, setMsg] = useState<string | null>(null)
  const [fireTarget, setFireTarget] = useState<string | null>(null)

  const home = planets.find((p) => p.isHome)

  return (
    <div className="nova-page space-y-4">
      <h2 className="page-title hud-rule" data-en="OFFICER CORPS">{t('officer.title')}</h2>
      <section className="nova-officer-stage panel panel-hud" aria-label={t('officer.ariaStage')}><div><div className="sec-title">{t('officer.network')}</div><div className="mono text-[10px] text-ink-3">OFFICER NETWORK / IMPERIAL BONUS</div><p className="mt-3 text-xs text-ink-2">{t('officer.networkDesc')}</p></div><div className="nova-officer-core"><NovaIcon name="officer" /><span>COMMAND</span></div><div className="nova-officer-stage__stats"><span>{t('officer.active')} <b className="num text-accent-2">{Object.keys(officers).length}/{Object.keys(OFFICERS).length}</b></span><span>{t('officer.planets')} <b className="num">{planets.length}</b></span><span>{t('officer.home')} <b>{translatePlanetName(home?.name ?? t('officer.notFound'))}</b></span></div></section>
      {msg && (
        <div className="alert-bad" role="alert">
          {msg}
        </div>
      )}
      <p className="text-sm text-ink-2">{t('officer.globalHint')}</p>
      {Object.values(OFFICERS).map((def) => {
        const hired = officers[def.id]
        const affordable =
          !!home && home.resources.metal >= def.hireCost.metal && home.resources.crystal >= def.hireCost.crystal && home.resources.deuterium >= def.hireCost.deuterium
        return (
          <div key={def.id} className={`panel p-3${hired ? ' bg-surface-2' : ''}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl" aria-hidden="true"><NovaIcon name={OFFICER_ICON[def.id] ?? 'officer'} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-ink">{en ? def.nameEn : def.name}</span>
                  {hired ? <span className="chip chip-warn">{t('officer.onDuty')}</span> : <span className="chip">{t('officer.notHired')}</span>}
                </div>
                <div className="mt-0.5 text-sm text-ink-2">{en ? def.descEn : def.desc}</div>
                <div className="num mt-1 text-xs text-ink-2">
                  {t('officer.hireCost')}{t('common.colon')}{t('research.metal')} <span className="text-metal">{fmt(def.hireCost.metal)}</span> / {t('research.crystal')}{' '}
                  <span className="text-crystal">{fmt(def.hireCost.crystal)}</span> / {t('research.fuel')}{' '}
                  <span className="text-deut">{fmt(def.hireCost.deuterium)}</span>
                  <span className="ml-2">
                    {t('officer.weeklyCost')}{t('common.colon')}{t('research.metal')} <span className="text-metal">{fmt(def.weeklyCost.metal)}</span> / {t('research.crystal')}{' '}
                    <span className="text-crystal">{fmt(def.weeklyCost.crystal)}</span> / {t('research.fuel')}{' '}
                    <span className="text-deut">{fmt(def.weeklyCost.deuterium)}</span>
                  </span>
                </div>
                {hired && (
                  <div className="num mt-1 text-xs text-accent-2">{t('officer.nextCharge')}{t('common.colon')}{formatDuration((hired.nextUpkeepAt - now) / 1000)}</div>
                )}
              </div>
              {hired ? (
                <button onClick={() => setFireTarget(def.id)} className="btn btn-danger min-h-11 sm:min-h-0 shrink-0">
                  {t('officer.fire')}
                </button>
              ) : (
                <button disabled={!affordable} onClick={() => setMsg(hireOfficer(def.id))} className="btn btn-primary min-h-11 sm:min-h-0 shrink-0">
                  {t('officer.hire')}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {fireTarget && (
        <ConfirmModal
          title={t('officer.fireTitle')}
          message={t('officer.fireConfirm', { name: (OFFICERS[fireTarget] ? (en ? OFFICERS[fireTarget]!.nameEn : OFFICERS[fireTarget]!.name) : '') })}
          danger
          onConfirm={() => {
            fireOfficer(fireTarget)
            setFireTarget(null)
          }}
          onCancel={() => setFireTarget(null)}
        />
      )}
    </div>
  )
}
