import { useState } from 'react'
import type { CSSProperties } from 'react'
import BattleReplay from '../components/BattleReplay'
import { fmt } from '../game/objects'
import { useGame, type Report } from '../game/state'
import { useLocale, listSep, translateTerm } from '../game/i18n'
import NovaIcon, { type NovaIconName } from '../components/NovaIcon'

type T = ReturnType<typeof useLocale>['t']
type ReportFilter = 'all' | Report['kind']

const KIND_LABEL: Record<Report['kind'], string> = { battle: 'report.kind.battle', espionage: 'report.kind.espionage', expedition: 'report.kind.expedition', missile: 'report.kind.missile' }
const KIND_ICON: Record<Report['kind'], NovaIconName> = { battle: 'fleet', espionage: 'radar', expedition: 'galaxy', missile: 'missile' }

function reportName(report: Report, t: T) {
  if (report.kind === 'expedition') return t('report.titleExpedition')
  return report.targetName
}

function reportSummary(report: Report, t: T) {
  if (report.kind === 'battle') return `${t(report.defense ? 'report.battleDefence' : 'report.battleAttack')} · ${t(report.result === 'win' ? 'report.win' : report.result === 'loss' ? 'report.loss' : 'report.stalemate')}`
  if (report.kind === 'espionage') return t('report.espionageSummary', { d: report.depth, f: report.fleetTotal ?? t('report.markUnknown'), df: report.defenseTotal ?? t('report.markUnknown') })
  if (report.kind === 'missile') return t('report.missileSummary', { f: report.fired, i: report.intercepted })
  return report.outcome
}

export default function Reports() {
  const { t } = useLocale()
  const reports = useGame((s) => s.reports)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<ReportFilter>('all')

  const newestFirst = [...reports].reverse()
  const selected = reports.find((report) => report.id === selectedId) ?? newestFirst[0]
  const filtered = filter === 'all' ? newestFirst : newestFirst.filter((report) => report.kind === filter)
  const battleCount = reports.filter((report) => report.kind === 'battle').length
  const intelCount = reports.filter((report) => report.kind === 'espionage').length
  const expeditionCount = reports.filter((report) => report.kind === 'expedition').length
  const threatCount = reports.filter((report) => report.kind === 'missile' || (report.kind === 'battle' && report.result === 'loss')).length
  // 底栏全部实算（2026-09-25 假数据清理：删除"传感器网络在线/加密启用"等无功能装饰）
  const battleReports = reports.filter((report) => report.kind === 'battle')
  const winCount = battleReports.filter((report) => report.result === 'win').length
  const lossCount = battleReports.filter((report) => report.result === 'loss').length
  const latest = newestFirst[0]

  return (
    <div className="nova-page nova-report-page">
      <header className="nova-page-head"><h2 className="page-title hud-rule" data-en="REPORTS">{t('report.pageTitle')}</h2><p className="nova-page-sub">{t('report.pageSub')}</p></header>
      <section className="nova-report-workspace" aria-label={t('report.ariaWorkspace')}>
        <header className="nova-report-title">
          <h2>{t('report.title')}</h2><b>INTELLIGENCE COMMAND</b>
          <span>{t('report.subtitle')}</span><small>SEE THE SIGNAL. UNDERSTAND THE BATTLESPACE.</small>
        </header>

        <aside className="nova-report-left">
          <section className="nova-report-panel">
            <div className="nova-report-panel__title"><NovaIcon name="reports" /><b>{t('report.overview')}<small>INTELLIGENCE OVERVIEW</small></b><em>{reports.length ? t('report.sync') : t('report.standby')}</em></div>
            <div className="nova-report-metrics">
              <div><NovaIcon name="fleet" /><span>{t('report.battleReports')}<small>BATTLE REPORTS</small></span><b>{battleCount}</b></div>
              <div><NovaIcon name="radar" /><span>{t('report.espionageIntel')}<small>ESPIONAGE INTEL</small></span><b>{intelCount}</b></div>
              <div><NovaIcon name="galaxy" /><span>{t('report.expeditions')}<small>EXPEDITIONS</small></span><b>{expeditionCount}</b></div>
              <div data-alert={threatCount > 0 || undefined}><NovaIcon name="alert" /><span>{t('report.threats')}<small>THREAT RECORDS</small></span><b>{threatCount}</b></div>
            </div>
          </section>

          <section className="nova-report-panel nova-report-filters">
            <div className="nova-report-panel__title"><NovaIcon name="radar" /><b>{t('report.filters')}<small>ARCHIVE FILTERS</small></b><em>{filtered.length}</em></div>
            <div>{([
              ['all', t('report.filterAll'), 'reports'], ['battle', t('report.filterBattle'), 'fleet'], ['espionage', t('report.filterEspionage'), 'radar'], ['expedition', t('report.filterExpedition'), 'galaxy'], ['missile', t('report.filterMissile'), 'missile'],
            ] as [ReportFilter, string, NovaIconName][]).map(([value, label, icon]) => <button key={value} type="button" data-active={filter === value || undefined} onClick={() => setFilter(value)}><NovaIcon name={icon} /><span>{label}<small>{value === 'all' ? 'ALL INTELLIGENCE' : value.toUpperCase()}</small></span><b>{value === 'all' ? reports.length : reports.filter((report) => report.kind === value).length}</b></button>)}</div>
          </section>
        </aside>

        <main className="nova-report-center">
          <div className="nova-report-center__header"><span>{t('report.timeline')}<small>INTELLIGENCE TIMELINE</small></span><div><i />{t('report.liveSync')}<i className="is-alert" />{t('report.threatMark')}</div></div>
          <div className="nova-report-radar-field" data-empty={!reports.length || undefined}>
            <div className="nova-report-radar-grid"><i /><i /><i /></div>
            <div className="nova-report-radar-sweep" />
            {newestFirst.slice(0, 6).map((report, index) => <button key={report.id} type="button" data-kind={report.kind} data-active={selected?.id === report.id || undefined} style={{ '--intel-x': `${24 + (index * 19) % 62}%`, '--intel-y': `${25 + (index * 27) % 52}%` } as CSSProperties} onClick={() => setSelectedId(report.id)}><NovaIcon name={KIND_ICON[report.kind]} /><span>{t(KIND_LABEL[report.kind])}</span></button>)}
            {!reports.length && <div className="nova-report-standby"><NovaIcon name="radar" /><b>{t('report.standbyTitle')}</b><span>{t('report.standbyEmpty')}</span><small>INTELLIGENCE ARRAY STANDING BY</small></div>}
          </div>
          <div className="nova-report-stream">
            {filtered.length ? filtered.map((report) => <button key={report.id} type="button" data-active={selected?.id === report.id || undefined} data-alert={report.kind === 'missile' || undefined} onClick={() => setSelectedId(report.id)}><span><NovaIcon name={KIND_ICON[report.kind]} /></span><div><b>{reportName(report, t)}</b><small>{reportSummary(report, t)}</small></div><em>{new Date(report.wallAt).toLocaleString()}</em></button>) : <div className="nova-report-stream__empty"><NovaIcon name="reports" /><span>{reports.length ? t('report.noMatchShort') : t('report.emptyShort')}</span></div>}
          </div>
          {expanded !== null && selected?.kind === 'battle' && selected.id === expanded && <div className="nova-report-replay"><BattleReplay key={selected.id} input={selected.input} output={selected.output} /></div>}
        </main>

        <aside className="nova-report-right nova-report-panel">
          <div className="nova-report-panel__title"><NovaIcon name="focus" /><b>{t('report.selected')}<small>SELECTED INTEL</small></b><em>{selected ? t(KIND_LABEL[selected.kind]) : t('report.standby')}</em></div>
          <div className={`nova-report-emblem-v2 ${selected ? `is-${selected.kind}` : ''}`}><NovaIcon name={selected ? KIND_ICON[selected.kind] : 'reports'} /></div>
          {selected ? <>
            <div className="nova-report-selected-name"><NovaIcon name={KIND_ICON[selected.kind]} /><span><b>{reportName(selected, t)}</b><small>{t(KIND_LABEL[selected.kind])} · ARCHIVE #{selected.id}</small></span></div>
            <div className="nova-report-selected-meta"><div><span>{t('report.recordTime')}</span><b>{new Date(selected.wallAt).toLocaleString()}</b></div><div><span>{t('report.coordLabel')}</span><b>[{selected.coords.galaxy}:{selected.coords.system}:{selected.coords.position}]</b></div></div>
            {selected.kind === 'battle' && <div className="nova-report-detail"><b>{t('report.battleResult')}<small>BATTLE RESULT</small></b><div><span>{t('report.result')}</span><em data-result={selected.result}>{t(selected.result === 'win' ? 'report.win' : selected.result === 'loss' ? 'report.loss' : 'report.stalemate')}</em></div><div><span>{t('report.rounds')}</span><em>{selected.output.rounds.length}</em></div><div><span>{t('report.loot')}</span><em>{fmt(selected.loot.metal + selected.loot.crystal + selected.loot.deuterium)}</em></div><div><span>{t('report.debrisScale')}</span><em>{fmt(selected.debris.metal + selected.debris.crystal)}</em></div></div>}
            {selected.kind === 'espionage' && <div className="nova-report-detail"><b>{t('report.espionageResult')}<small>ESPIONAGE RESULT</small></b><div><span>{t('report.depth')}</span><em>Lv.{selected.depth}</em></div><div><span>{t('report.fleetScale')}</span><em>{selected.fleetTotal ?? t('report.unknown')}</em></div><div><span>{t('report.defenseScale')}</span><em>{selected.defenseTotal ?? t('report.unknown')}</em></div><div><span>{t('report.probesLost')}</span><em>{selected.probesLost ?? 0}</em></div>{selected.fleet && <p>{t('report.composition', { c: Object.entries(selected.fleet).filter(([, count]) => count > 0).map(([id, count]) => `${translateTerm(+id, 'ships')}×${count}`).join(listSep()) || t('report.emptyList') })}</p>}</div>}
            {selected.kind === 'missile' && <div className="nova-report-detail"><b>{t('report.missileResult')}<small>MISSILE STRIKE</small></b><div><span>{t('report.fired')}</span><em>{selected.fired}</em></div><div><span>{t('report.intercepted')}</span><em>{selected.intercepted}</em></div><div><span>{t('report.hits')}</span><em>{selected.fired - selected.intercepted}</em></div><p>{t('report.destroyed', { list: Object.entries(selected.destroyed).map(([id, count]) => `${translateTerm(+id, 'defenses')}×${count}`).join(listSep()) || t('report.emptyList') })}</p></div>}
            {selected.kind === 'expedition' && <div className="nova-report-detail"><b>{t('report.expeditionResult')}<small>EXPEDITION RESULT</small></b><p>{selected.outcome}</p>{selected.gained && <div><span>{t('report.gained')}</span><em>{fmt(selected.gained.metal + selected.gained.crystal + selected.gained.deuterium)}</em></div>}{selected.gainedShips && <p>{t('report.recruited', { list: Object.entries(selected.gainedShips).map(([id, count]) => `${translateTerm(+id, 'ships')}×${count}`).join(listSep()) })}</p>}{selected.shipsLost ? <div><span>{t('report.shipsLost')}</span><em>{selected.shipsLost}</em></div> : null}</div>}
            {selected.kind === 'battle' && <button type="button" className="nova-report-replay-button" onClick={() => setExpanded(expanded === selected.id ? null : selected.id)}><NovaIcon name="reports" />{expanded === selected.id ? t('report.closeReplay') : t('report.openReplay')}<small>{expanded === selected.id ? 'CLOSE REPLAY' : 'OPEN BATTLE REPLAY'}</small></button>}
          </> : <div className="nova-report-selected-empty"><NovaIcon name="check" /><b>{t('report.archiveReady')}</b><p>{t('report.awaitFirst')}</p></div>}
        </aside>

        <footer className="nova-report-status"><div><NovaIcon name="fleet" /><span>{t('report.winLoss')}<small>WIN / LOSS</small></span><b>{winCount} {t('report.wins')} {lossCount} {t('report.losses')}</b></div><div><NovaIcon name="reports" /><span>{t('report.totalArchives')}<small>TOTAL ARCHIVES</small></span><b>{reports.length}</b></div><div><NovaIcon name="galaxy" /><span>{t('report.latest')}<small>LATEST INTEL</small></span><b>{latest ? new Date(latest.wallAt).toLocaleString() : t('report.standby')}</b></div><div><NovaIcon name="alert" /><span>{t('report.openThreats')}<small>OPEN THREATS</small></span><b>{threatCount}</b></div></footer>
      </section>
    </div>
  )
}
