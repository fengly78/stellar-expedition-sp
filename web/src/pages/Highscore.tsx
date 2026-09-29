import { useMemo } from 'react'
import { fmt } from '../game/objects'
import { npcScore, playerScore, useGame } from '../game/state'
import { useLocale, translatePlanetName } from '../game/i18n'

export default function Highscore() {
  const { t } = useLocale()
  const planets = useGame((s) => s.planets)
  const techs = useGame((s) => s.techs)
  const npcs = useGame((s) => s.npcs)

  // playerScore / npcScore 是 O(Σ levels) 的逐级 buildingCost 重算，键里只取依赖的标量
  const entries = useMemo(
    () => {
      const myScore = playerScore({ planets, techs })
      return [
        { name: t('rank.you'), score: myScore, me: true, loc: t('rank.planetCountValue', { n: planets.length }) },
        ...Object.values(npcs).map((n) => ({
          name: translatePlanetName(n.name),
          score: npcScore(n),
          me: false,
          loc: `${translatePlanetName(n.name)} [${n.coords.galaxy}:${n.coords.system}:${n.coords.position}]`,
        })),
      ].sort((a, b) => b.score - a.score)
    },
    [planets, techs, npcs],
  )

  const myRank = entries.findIndex((e) => e.me) + 1
  const myScore = entries.find((e) => e.me)?.score ?? 0

  return (
    <div className="nova-page space-y-4">
      <h2 className="page-title hud-rule" data-en="HIGHSCORE">{t('rank.title')}</h2>
      <section className="nova-highscore-stage panel panel-hud" aria-label={t('rank.ariaStage')}><div><div className="sec-title">{t('rank.titleFull')}</div><div className="mono text-[10px] text-ink-3">IMPERIAL RANKING / SEASONAL</div><p className="mt-3 text-xs text-ink-2">{t('rank.desc')}</p></div><div className="nova-rank-medal">#{myRank}<span>RANK</span></div><div className="nova-highscore-stage__stats"><span>{t('rank.myScore')} <b className="num text-accent-2">{fmt(myScore)}</b></span><span>{t('rank.factions')} <b className="num">{entries.length}</b></span><span>{t('rank.planetCount')} <b className="num">{planets.length}</b></span></div></section>
      <section className="panel p-3 text-sm">
        {t('rank.myRank')}{t('common.colon')}<span className="num text-lg font-bold text-accent-2">#{myRank}</span>
        <span className="ml-3 text-ink-2">
          {t('rank.myScore')} <span className="num text-ink">{fmt(myScore)}</span>
        </span>
        <span className="ml-2 text-xs text-ink-3">{t('rank.scoreFormula')}</span>
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs text-ink-2">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{t('rank.faction')}</th>
              <th className="px-3 py-2">{t('rank.location')}</th>
              <th className="px-3 py-2 text-right">{t('rank.score')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 50).map((e, i) => (
              <tr key={i} className={`border-t border-edge ${e.me ? 'bg-surface-3 font-semibold text-accent-2' : ''}`}>
                <td className="num px-3 py-1.5">{i + 1}</td>
                <td className="px-3 py-1.5">{e.name}</td>
                <td className="num px-3 py-1.5 text-xs text-ink-2">{e.loc}</td>
                <td className="num px-3 py-1.5 text-right">{fmt(e.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {myRank > 50 && <p className="text-xs text-ink-2">{t('rank.below50')}</p>}
    </div>
  )
}
