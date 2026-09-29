import { useState } from 'react'
import { fmt } from '../game/objects'
import { useGame, type MissionType } from '../game/state'
import { findTerm, formatDuration, useLocale } from '../game/i18n'
import NovaIcon from '../components/NovaIcon'
import { blueprintAtlasStyle } from '../game/novaAssets'

const TYPE_KEY = {
  attack: 'fleet.type.attack',
  transport: 'fleet.type.transport',
  deploy: 'fleet.type.deploy',
  colonize: 'fleet.type.colonize',
  espionage: 'fleet.type.espionage',
  recycle: 'fleet.type.recycle',
  expedition: 'fleet.type.expedition',
  missile: 'fleet.type.missile',
} as const

export default function Fleet({ onGoShipyard }: { onGoShipyard?: () => void }) {
  const { t } = useLocale()
  const missions = useGame((s) => s.missions)
  const now = useGame((s) => s.gameTime)
  const planet = useGame((s) => s.planets.find((p) => p.id === s.currentPlanet))
  const ownedShips = planet ? Object.values(planet.ships).reduce((sum, n) => sum + n, 0) : 0
  const hasShipyard = (planet?.buildings[21] ?? 0) > 0
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null)

  const typeLabel = (type: MissionType) => t(TYPE_KEY[type])
  const focus = missions.find((mission) => mission.id === selectedMissionId) ?? missions[0]
  const focusEta = focus ? Math.max(0, (focus.phase === 'out' ? focus.arriveAt : (focus.returnAt ?? now)) - now) : 0
  const focusShips = focus ? Object.values(focus.fleet).reduce((sum, count) => sum + count, 0) : 0
  const focusShipId = focus ? +(Object.entries(focus.fleet).find(([, count]) => count > 0)?.[0] ?? 202) : 202
  const totalShips = missions.reduce((total, mission) => total + Object.values(mission.fleet).reduce((sum, count) => sum + count, 0), 0)
  const hostileCount = missions.filter((mission) => mission.npcOwned).length
  const cargoTotal = focus ? focus.cargo.metal + focus.cargo.crystal + focus.cargo.deuterium : 0

  return (
    <div className="nova-page nova-fleet-page">
      <header className="nova-page-head"><h2 className="page-title hud-rule" data-en="FLEET COMMAND">{t('fleet.pageTitle')}</h2><p className="nova-page-sub">{t('fleet.pageSub')}</p></header>
      <section className="nova-fleet-workspace" aria-label={t('fleet.workspaceAria')}>
        <header className="nova-fleet-title">
          <h2>{t('fleet.title')}</h2><b>FLEET COMMAND</b>
          <span>{t('fleet.subtitle')}</span><small>COMMAND THE ROUTE. EXTEND THE FRONTIER.</small>
        </header>

        <aside className="nova-fleet-left">
          <section className="nova-fleet-panel">
            <div className="nova-fleet-panel__title"><NovaIcon name="fleet" /><b>{t('fleet.overview')}<small>FLEET OVERVIEW</small></b><em>{missions.length ? t('common.online') : t('fleet.standby')}</em></div>
            <div className="nova-fleet-metrics">
              <div><NovaIcon name="orbit" /><span>{t('fleet.activeMissions')}<small>ACTIVE MISSIONS</small></span><b>{missions.length}</b></div>
              <div><NovaIcon name="ship" /><span>{t('fleet.shipsInFlight')}<small>SHIPS IN FLIGHT</small></span><b>{fmt(totalShips)}</b></div>
              <div data-alert={hostileCount > 0 || undefined}><NovaIcon name="alert" /><span>{t('fleet.hostileInbound')}<small>HOSTILE INBOUND</small></span><b>{hostileCount}</b></div>
              <div><NovaIcon name="radar" /><span>{t('fleet.commandLink')}<small>COMMAND LINK</small></span><b>{t('fleet.stable')}</b></div>
            </div>
          </section>

          <section className="nova-fleet-panel nova-mission-queue">
            <div className="nova-fleet-panel__title"><NovaIcon name="reports" /><b>{t('fleet.missionQueue')}<small>MISSION QUEUE</small></b><em>{missions.length}/8</em></div>
            <div className="nova-mission-list">
              {missions.length ? missions.map((mission, index) => {
                const eta = Math.max(0, (mission.phase === 'out' ? mission.arriveAt : (mission.returnAt ?? now)) - now)
                const ships = Object.values(mission.fleet).reduce((sum, count) => sum + count, 0)
                return <button key={mission.id} type="button" data-active={focus?.id === mission.id || undefined} data-hostile={mission.npcOwned || undefined} onClick={() => setSelectedMissionId(mission.id)}><strong>{String(index + 1).padStart(2, '0')}</strong><span><b>{t('fleet.missionOf', { type: typeLabel(mission.type) })}</b><small>[{mission.from.galaxy}:{mission.from.system}:{mission.from.position}] → [{mission.to.galaxy}:{mission.to.system}:{mission.to.position}]</small><i><u /></i></span><em>{t('fleet.shipCount', { n: ships })}<small>{formatDuration(eta / 1000)}</small></em></button>
              }) : <div className="nova-mission-empty"><NovaIcon name="orbit" /><b>{t('fleet.standbyRoute')}</b><span>{t('fleet.noMission')}</span><small>{t('fleet.emptyHint')}</small></div>}
            </div>
          </section>
        </aside>

        <main className="nova-fleet-map">
          <div className="nova-fleet-map__header"><span>{focus ? `${t('fleet.routeOf', { type: typeLabel(focus.type) })} · ${focus.phase === 'out' ? t('fleet.outbound') : t('fleet.returning')}` : t('fleet.localOrbit')}<small>LIVE ORBITAL ROUTE</small></span><div><i className="is-friendly" />{t('fleet.friendlyLink')}<i className="is-hostile" />{t('fleet.hostileThreat')}</div></div>
          <div className="nova-fleet-orbit-field" data-empty={!focus || undefined}>
            <div className="nova-fleet-orbit-ring nova-fleet-orbit-ring--one" />
            <div className="nova-fleet-orbit-ring nova-fleet-orbit-ring--two" />
            <div className="nova-fleet-orbit-planet"><span /><b>{focus ? t('fleet.departureBase') : t('fleet.homeOrbit')}</b><small>{focus ? `[${focus.from.galaxy}:${focus.from.system}:${focus.from.position}]` : 'LOCAL ORBIT'}</small></div>
            {focus ? <>
              <div className={`nova-fleet-route-line ${focus.npcOwned ? 'is-hostile' : ''}`}><i /></div>
              <div className={`nova-fleet-vessel ${focus.npcOwned ? 'is-hostile' : ''}`}><NovaIcon name={focus.missileCount ? 'missile' : 'fleet'} /><b>{typeLabel(focus.type)}</b><small>{formatDuration(focusEta / 1000)}</small></div>
              <div className={`nova-fleet-target ${focus.npcOwned ? 'is-hostile' : ''}`}><NovaIcon name="focus" /><b>{t('fleet.missionTarget')}</b><small>[{focus.to.galaxy}:{focus.to.system}:{focus.to.position}]</small></div>
            </> : <div className="nova-fleet-standby"><NovaIcon name="radar" /><b>{t('fleet.noActiveRoute')}</b><small>FLEET CONTROL STANDING BY</small></div>}
          </div>
          <div className="nova-fleet-map__footer"><span><NovaIcon name="radar" />{t('fleet.quantumComms')}<small>ONLINE</small></span><span><NovaIcon name="engine" />{t('fleet.propulsion')}<small>READY</small></span><span><NovaIcon name="shield" />{t('fleet.shieldTelemetry')}<small>STABLE</small></span><em>{t('fleet.updateRate')} <b>LIVE</b></em></div>
        </main>

        <aside className="nova-fleet-right nova-fleet-panel">
          <div className="nova-fleet-panel__title"><NovaIcon name="focus" /><b>{t('fleet.selectedMission')}<small>SELECTED MISSION</small></b><em>{focus ? typeLabel(focus.type) : t('fleet.standby')}</em></div>
          <div className="nova-fleet-blueprint"><span className="nova-atlas-thumb" style={blueprintAtlasStyle(focusShipId, false)}>{!focus && <NovaIcon name="ship" />}</span></div>
          {focus ? <>
            <div className="nova-fleet-selected-name"><NovaIcon name={focus.npcOwned ? 'alert' : 'fleet'} /><span><b>{t('fleet.formationOf', { type: typeLabel(focus.type) })}</b><small>{focus.npcOwned ? 'HOSTILE FORMATION' : 'TASK FORCE'}</small></span></div>
            <div className="nova-fleet-selected-stats"><div><span>{t('fleet.routePhase')}</span><b>{focus.phase === 'out' ? t('fleet.enRoute') : t('fleet.returningNow')}</b></div><div><span>{t('fleet.eta')}</span><b>{formatDuration(focusEta / 1000)}</b></div><div><span>{t('fleet.shipCountLabel')}</span><b>{fmt(focusShips)}</b></div><div><span>{t('fleet.cargoLoad')}</span><b>{fmt(cargoTotal)}</b></div></div>
            <div className="nova-fleet-composition"><b>{t('fleet.composition')}<small>FLEET COMPOSITION</small></b>{Object.entries(focus.fleet).filter(([, count]) => count > 0).map(([id, count]) => <div key={id}><span>{findTerm(+id, 'ships') ?? t('fleet.unknownShip', { id })}</span><em>× {fmt(count)}</em></div>)}{focus.missileCount !== undefined && <div><span>{t('fleet.interstellarMissile')}</span><em>× {focus.missileCount}</em></div>}</div>
            <div className="nova-fleet-cargo"><b>{t('fleet.missionCargo')}<small>MISSION CARGO</small></b><div><span><NovaIcon name="metal" />{t('common.metal')}<em>{fmt(focus.cargo.metal)}</em></span><span><NovaIcon name="crystal" />{t('common.crystal')}<em>{fmt(focus.cargo.crystal)}</em></span><span><NovaIcon name="fuel" />{t('common.deuterium')}<em>{fmt(focus.cargo.deuterium)}</em></span></div></div>
          </> : <div className="nova-fleet-selected-empty"><NovaIcon name="check" /><b>{t('fleet.allReturned')}</b><p>{t('fleet.idleHint')}</p></div>}
        </aside>

        <footer className="nova-fleet-readiness">
          {/* 2026-09-28：原先此处是静态假数据「船坞联动 / 已连接」。改为真实状态，
              并在一艘船都没有时给出去船坞的直接入口——此前「舰队」页没有任何造船入口，
              而船坞页默认切在防御标签，导致新手完全找不到造船的地方（试玩 P1）。 */}
          <button type="button" onClick={onGoShipyard}>
            <NovaIcon name="ship" />
            <span>{t('fleet.shipyardLink')}<small>SHIPYARD LINK</small></span>
            <b>{hasShipyard ? t('fleet.connected') : t('fleet.shipyardLocked')}</b>
          </button>
          <div><NovaIcon name="propulsion" /><span>{t('fleet.jumpSolution')}<small>JUMP SOLUTION</small></span><b>{focus ? t('fleet.locked') : t('fleet.standby')}</b></div>
          <div><NovaIcon name="radar" /><span>{t('fleet.routeScan')}<small>ROUTE SCAN</small></span><b>{t('fleet.safe')}</b></div>
          <div><NovaIcon name="energy" /><span>{t('fleet.energyReserve')}<small>ENERGY RESERVE</small></span><b>{fmt(ownedShips)}</b></div>
        </footer>
        {ownedShips === 0 && onGoShipyard && (
          <div className="alert-bad" role="alert">
            <span className="font-semibold">{t('fleet.noShipsTitle')}</span>
            <p className="ml-2 text-ink-2">{t('fleet.noShipsHint')}</p>
            <button type="button" className="btn btn-primary mt-2" onClick={onGoShipyard}>{t('fleet.goShipyard')}</button>
          </div>
        )}
      </section>
    </div>
  )
}
