import { ACHIEVEMENTS } from '../game/achievements'
import { fmt } from '../game/objects'
import { useGame } from '../game/state'
import { useLocale } from '../game/i18n'
import NovaIcon from '../components/NovaIcon'

export default function Achievements() {
  const { t, locale } = useLocale()
  const en = locale === 'en'
  const unlocked = useGame((s) => s.achievements)
  const stats = useGame((s) => s.stats)
  const planets = useGame((s) => s.planets)
  const techs = useGame((s) => s.techs)
  const officers = useGame((s) => s.officers)
  const campaignDone = useGame((s) => s.campaignDone)

  const totalShips = planets.reduce((sum, p) => sum + Object.values(p.ships).reduce((a, b) => a + b, 0), 0)
  const totalDefenses = planets.reduce((sum, p) => sum + Object.values(p.defenses).reduce((a, b) => a + b, 0), 0)

  const progressOf = (id: number): string => {
    switch (id) {
      case 1: return t('ach.goal.colony', { n: planets.length - 1 })
      case 2: return t('ach.goal.win', { n: stats.battlesWon })
      case 3: return t('ach.goal.ships', { n: totalShips })
      case 4: return t('ach.goal.metalMine', { n: Math.max(0, ...planets.map((p) => p.buildings[1] ?? 0)) })
      case 5: return t('ach.goal.topTech', { n: Math.max(0, ...Object.values(techs)) })
      case 6: return t('ach.goal.loot', { n: fmt(stats.totalLoot) })
      case 7: return t('ach.goal.debris', { n: fmt(stats.totalDebris) })
      case 9: return t('ach.goal.battleship', { n: planets.reduce((a, p) => a + (p.ships[207] ?? 0), 0) })
      case 10: return t('ach.goal.defenses', { n: totalDefenses })
      case 11: return t('ach.goal.missiles', { n: stats.missilesFired })
      case 12: return t('ach.goal.trades', { n: stats.trades })
      case 13: return t('ach.goal.officers', { n: Object.keys(officers).length })
      case 14: return t('ach.goal.expeditions', { n: stats.expeditions })
      case 16: return t('ach.goal.destroyed', { n: stats.defensesDestroyed })
      case 17: return t('ach.goal.moon', { n: planets.some((p) => p.isMoon) ? 1 : 0 })
      case 18: return t('ach.goal.moons', { n: stats.moonsDestroyed })
      case 19: return t('ach.goal.stages', { n: campaignDone.length })
      default: return ''
    }
  }

  const pct = `${(unlocked.length / ACHIEVEMENTS.length) * 100}%`

  return (
    <div className="nova-page space-y-4">
      <h2 className="page-title hud-rule" data-en="ACHIEVEMENTS">{t('ach.title')}</h2>
      <section className="nova-achievement-stage panel panel-hud" aria-label={t('ach.ariaStage')}><div><div className="sec-title">{t('ach.network')}</div><div className="mono text-[10px] text-ink-3">ACHIEVEMENT NETWORK / VERIFIED</div><p className="mt-3 text-xs text-ink-2">{t('ach.networkDesc')}</p></div><div className="nova-achievement-ring"><span className="num">{unlocked.length}</span><small>/{ACHIEVEMENTS.length}<br />UNLOCKED</small></div><div className="nova-achievement-stage__stats"><span>{t('ach.battleWins')} {stats.battlesWon} {t('report.wins')}</span><span>{t('ach.ships')} {totalShips}</span><span>{t('ach.defense')} {totalDefenses}</span><span>{t('ach.campaign')} {campaignDone.length}</span></div></section>
      <section className="panel p-3">
        <div className="panel-hd">
          <h3 className="sec-title">{t('ach.progress')}</h3>
          <span className="num text-sm text-ink-2">
            <span className="text-ok">{unlocked.length}</span>/{ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-surface-3" role="progressbar" aria-label={t('ach.progressAria')} aria-valuenow={unlocked.length} aria-valuemin={0} aria-valuemax={ACHIEVEMENTS.length}>
          <div className="h-2 rounded bg-ok" style={{ width: pct }} />
        </div>
      </section>
      {ACHIEVEMENTS.map((a) => {
        const has = unlocked.includes(a.id)
        return (
          <div key={a.id} className={`panel flex items-center gap-3 px-3 py-2.5${has ? '' : ' bg-surface-2'}`}>
            <span className="text-xl" aria-hidden="true"><NovaIcon name={has ? 'achievement' : 'lock'} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`font-semibold ${has ? 'text-ink' : 'text-ink-2'}`}>{en ? a.nameEn : a.name}</span>
                {has ? <span className="chip chip-ok">{t('ach.unlocked')}</span> : <span className="chip">{t('ach.locked')}</span>}
                <span className="text-xs text-ink-2">{en ? a.descEn : a.desc}</span>
              </div>
              <div className="num mt-0.5 text-xs text-ink-2">
                {has ? t('ach.done') : `${(en ? a.hintEn : a.hint)} · ${t('ach.progress')} ${progressOf(a.id)}`}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
