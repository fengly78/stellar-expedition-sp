import { useState } from 'react'
import { BUILDINGS, DEFENSES, DEFENSE_FIELDS, SHIPS, TECHS, fmt, isMissile, maxFields, meetsRequires, shipBuildTime, usedFields } from '../game/objects'
import { SHIP_SLOTS, useGame } from '../game/state'
import { findTerm, formatDuration, translateTerm, useLocale } from '../game/i18n'
import DetailDialog, { type DetailKind } from '../components/DetailDialog'
import NovaIcon from '../components/NovaIcon'
import { blueprintAtlasStyle } from '../game/novaAssets'

// 2026-09-27 补 215/213/218（超空批次新舰漏入序——此前新舰在船坞造不了，bug 排查修复）
const SHIP_ORDER = [204, 205, 206, 207, 215, 213, 211, 218, 214, 202, 203, 208, 209, 210, 212]
const DEF_ORDER = [401, 402, 403, 404, 405, 406, 407, 408, 502, 503]

export default function Shipyard({ planetId, defaultFamily = 'ships', onNavigate }: { planetId: number; defaultFamily?: 'ships' | 'defense'; onNavigate?: (tab: 'buildings' | 'research') => void }) {
  const { t } = useLocale()
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const techs = useGame((s) => s.techs)
  const buildShips = useGame((s) => s.buildShips)
  const scrapDefense = useGame((s) => s.scrapDefense)
  const cancelShipQueueItem = useGame((s) => s.cancelShipQueueItem)
  const now = useGame((s) => s.gameTime)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<'ships' | 'defense'>(defaultFamily)
  const [selectedId, setSelectedId] = useState(defaultFamily === 'defense' ? DEF_ORDER[0] : SHIP_ORDER[0])
  const [detail, setDetail] = useState<{ kind: DetailKind; id: number } | null>(null)

  if (!planet) return <div className="empty">{t('ship.noPlanet')}</div>

  const isDefense = selectedId >= 400
  const selected = isDefense ? DEFENSES[selectedId] : SHIPS[selectedId]
  const owned = isDefense ? planet.defenses[selectedId] ?? 0 : planet.ships[selectedId] ?? 0
  const count = counts[selectedId] ?? 1
  const levels = { ...planet.buildings, ...planet.defenses, ...techs }
  const reqOk = meetsRequires(levels, selected.requires)
  const totalCost = { metal: selected.cost.metal * count, crystal: selected.cost.crystal * count, deuterium: selected.cost.deuterium * count }
  const affordable = planet.resources.metal >= totalCost.metal && planet.resources.crystal >= totalCost.crystal && planet.resources.deuterium >= totalCost.deuterium
  const capHit = 'maxCount' in selected && selected.maxCount > 0 && owned >= selected.maxCount
  const fieldsUsed = usedFields(planet.buildings, planet.defenses)
  const fieldCap = maxFields(planet.buildings, !!planet.isMoon)
  const selectedFieldCost = isDefense ? DEFENSE_FIELDS[selectedId] ?? 0 : 0
  const catalogItems = catalog === 'ships' ? SHIP_ORDER : DEF_ORDER

  const selectCatalog = (next: 'ships' | 'defense') => {
    setCatalog(next)
    setSelectedId(next === 'ships' ? SHIP_ORDER[0] : DEF_ORDER[0])
  }

  return (
    <div className="nova-page nova-manufacturing-page">
      {msg && <div className="alert-bad nova-workspace-alert" role="alert">{msg}</div>}
      <section className="nova-manufacturing-workspace" aria-label={t('ship.title')}>
        <header className="nova-workspace-title"><h2>{t('ship.title')}</h2><b>MANUFACTURING THREAD WORKSPACE</b><span>{t('ship.subtitle')}</span><small>THREE THREADS. A GREATER TOMORROW.</small></header>

        <aside className="nova-manufacturing-threads">
          {Array.from({ length: SHIP_SLOTS }, (_, slot) => {
            const queue = planet.shipQueue[slot]
            if (!queue) return <div className="nova-thread-card nova-workspace-panel" key={slot}><div className="nova-workspace-panel__title"><b>{t('ship.thread')} {slot + 1}</b><small>THREAD {slot + 1}</small><span>{t('ship.standby')}</span></div><div className="nova-thread-empty"><strong>{slot + 1}</strong><span>{t('ship.awaiting')}<small>AWAITING BLUEPRINT</small></span></div></div>
            const unitTime = Math.max(.01, shipBuildTime(queue.shipId, planet.buildings[21] ?? 0))
            const remaining = Math.max(0, (queue.finishAt - now) / 1000)
            const pct = Math.min(100, Math.max(3, (1 - (remaining % unitTime) / unitTime) * 100))
            return <div className="nova-thread-card nova-workspace-panel" key={slot}><div className="nova-workspace-panel__title"><b>{t('ship.thread')} {slot + 1}</b><small>THREAD {slot + 1}</small><span>{t('ship.running')}</span></div><div className="nova-thread-product"><span className="nova-thread-product__thumb nova-atlas-thumb" style={blueprintAtlasStyle(queue.shipId, queue.shipId >= 400)} /><div><b>{translateTerm(queue.shipId, queue.shipId >= 400 ? 'defenses' : 'ships')}</b><small>{t('ship.qty')} {queue.count} · {t('overview.remaining')} {formatDuration(remaining)}</small><i><u style={{ width: `${pct}%` }} /></i></div></div><button type="button" className="nova-thread-cancel" onClick={() => cancelShipQueueItem(planetId, slot)}>{t('ship.cancelQueue')}</button></div>
          })}
        </aside>

        <main className="nova-blueprint-workspace nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('ship.blueprint')}</b><small>BLUEPRINT DEPENDENCY GRAPH</small><span>{isDefense ? t('ship.defense') : t('ship.shipBuilding')}</span></div>
          <div className="nova-blueprint-field">
            <div className="nova-blueprint-component nova-blueprint-component--hull"><span><NovaIcon name="hull" /></span><b>{t('ship.hull')}</b><small>HULL / READY</small></div>
            <div className="nova-blueprint-component nova-blueprint-component--engine"><span><NovaIcon name="engine" /></span><b>{t('ship.engine')}</b><small>ENGINE / READY</small></div>
            <div className="nova-blueprint-component nova-blueprint-component--weapon"><span><NovaIcon name="weapon" /></span><b>{t('ship.weapon')}</b><small>WEAPONS</small></div>
            <div className="nova-blueprint-component nova-blueprint-component--shield"><span><NovaIcon name="shield" /></span><b>{t('ship.shieldModule')}</b><small>SHIELD</small></div>
            <div className="nova-blueprint-core"><span className="nova-blueprint-core__asset nova-atlas-thumb" style={blueprintAtlasStyle(selectedId, isDefense)} aria-hidden="true" /><b>{translateTerm(selectedId, isDefense ? 'defenses' : 'ships')}</b><small>{isDefense ? 'DEFENSE PLATFORM' : 'TACTICAL HULL'}</small></div>
          </div>
          <div className="nova-production-status"><span><i className="is-ready" />{t('ship.structIntact')}</span><span><i className="is-ready" />{t('ship.materialsOnline')}</span><span><i className={reqOk ? 'is-ready' : 'is-missing'} />{reqOk ? t('ship.unlocked') : t('ship.techMissing')}</span><span>{t('ship.baseSpace')} {fieldsUsed}/{fieldCap}{selectedFieldCost ? ` · ${t('ship.landUse')} ${selectedFieldCost}` : ''}</span></div>
        </main>

        <aside className="nova-blueprint-detail nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('ship.details')}</b><small>BLUEPRINT DETAILS</small><button type="button" onClick={() => setDetail({ kind: isDefense ? 'defense' : 'ship', id: selectedId })}>{t('build.detail')}</button></div>
          <div className="nova-selected-blueprint"><span className="nova-atlas-thumb" style={blueprintAtlasStyle(selectedId, isDefense)} aria-hidden="true" /><div><b>{translateTerm(selectedId, isDefense ? 'defenses' : 'ships')}</b><small>{isDefense ? 'PLANETARY DEFENSE' : 'ORBITAL VESSEL'}</small></div></div>
          <div className="nova-blueprint-stats"><div><span>{t('ship.attack')}</span><b>{fmt(selected.attack)}</b></div><div><span>{t('ship.shield')}</span><b>{fmt(selected.shield)}</b></div><div><span>{t('ship.hullStat')}</span><b>{fmt(selected.hull)}</b></div>{'speed' in selected && <><div><span>{t('ship.speed')}</span><b>{fmt(selected.speed)}</b></div><div><span>{t('ship.cargo')}</span><b>{fmt(selected.cargo)}</b></div></>}</div>
          <div className="nova-blueprint-cost"><b>{t('ship.materials')}<small>MATERIALS REQUIRED</small></b><div><span data-short={planet.resources.metal < totalCost.metal || undefined}><NovaIcon name="metal" />{t('research.metal')}<em>{fmt(totalCost.metal)}</em></span><span data-short={planet.resources.crystal < totalCost.crystal || undefined}><NovaIcon name="crystal" />{t('research.crystal')}<em>{fmt(totalCost.crystal)}</em></span><span data-short={planet.resources.deuterium < totalCost.deuterium || undefined}><NovaIcon name="fuel" />{t('research.fuel')}<em>{fmt(totalCost.deuterium)}</em></span></div></div>
          <div className="nova-blueprint-requires"><b>{t('ship.unlocks')}<small>UNLOCKS</small></b>{Object.entries(selected.requires).map(([id, required]) => <div key={id}><span>{findTerm(+id) ?? `#${id}`}</span><em data-ready={(levels[+id] ?? 0) >= required || undefined}>Lv.{required}</em><small className="text-ink-3">{BUILDINGS[+id] ? t('ship.upgradeAtBase') : TECHS[+id] ? t('ship.researchAtLab') : ''}</small></div>)}{!reqOk && <p className="text-xs text-warn">{t('ship.unlockHint')}</p>}</div>
          {!reqOk && onNavigate && <div className="flex gap-2 pb-1"><button type="button" className="btn btn-ghost min-h-11 flex-1 text-xs" onClick={() => onNavigate('buildings')}>{t('ship.goBase')}</button><button type="button" className="btn btn-ghost min-h-11 flex-1 text-xs" onClick={() => onNavigate('research')}>{t('ship.goResearch')}</button></div>}
          <div className="nova-build-controls"><button type="button" onClick={() => setCounts({ ...counts, [selectedId]: Math.max(1, count - 1) })}>{t('common.minus')}</button><input type="number" min={1} value={count} aria-label={t('ship.buildQty', { name: translateTerm(selectedId, isDefense ? 'defenses' : 'ships') })} onChange={(event) => setCounts({ ...counts, [selectedId]: Math.max(1, Math.floor(+event.target.value || 1)) })} /><button type="button" onClick={() => setCounts({ ...counts, [selectedId]: count + 1 })}>{t('common.fullPlus')}</button></div>
          <button type="button" className="nova-build-action" disabled={!reqOk || !affordable || capHit || planet.shipQueue.length >= SHIP_SLOTS} onClick={() => setMsg(buildShips(planetId, selectedId, count))}>{capHit ? t('ship.capHit') : isDefense ? t('ship.buildDefense') : t('ship.startBuild')}<small>{isDefense ? 'BUILD DEFENSE' : 'BUILD SHIP'}</small></button>
          {isDefense && !isMissile(selectedId) && owned > 0 && <button type="button" className="nova-scrap-action" disabled={count > owned} onClick={() => setMsg(scrapDefense(planetId, selectedId, count))}>{t('ship.scrap')}</button>}
        </aside>

        <nav className="nova-blueprint-catalog" aria-label={t('ship.blueprint')}>
          <div className="nova-blueprint-tabs"><button type="button" data-active={catalog === 'ships' || undefined} onClick={() => selectCatalog('ships')}>{t('ship.shipsTab')}</button><button type="button" data-active={catalog === 'defense' || undefined} onClick={() => selectCatalog('defense')}>{t('ship.defenseTab')}</button></div>
          <div className="nova-blueprint-list">{catalogItems.map((id) => { const amount = catalog === 'ships' ? planet.ships[id] ?? 0 : planet.defenses[id] ?? 0; return <button key={id} type="button" data-active={selectedId === id || undefined} onClick={() => setSelectedId(id)}><span className="nova-atlas-thumb" style={blueprintAtlasStyle(id, catalog === 'defense')} /><b>{translateTerm(id, catalog === 'defense' ? 'defenses' : 'ships')}</b><small>{t('ship.owned')} {amount}</small></button> })}</div>
        </nav>
      </section>
      {detail && <DetailDialog kind={detail.kind} id={detail.id} planetId={planetId} onClose={() => setDetail(null)} />}
    </div>
  )
}
