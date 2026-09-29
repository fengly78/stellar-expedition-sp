import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { fmt } from '../game/objects'
import { npcKey } from '../game/npc'
import { PHALANX_SCAN_COST, phalanxLevel, useGame, type EspionageReportData, type MissionType } from '../game/state'
import DispatchWizard from '../components/DispatchWizard'
import MissileModal from '../components/MissileModal'
import { sfx } from '../game/audio'
import { toast } from '../game/toasts'
import NovaIcon from '../components/NovaIcon'
import { useLocale, findTerm, listSep, translatePlanetName } from '../game/i18n'

interface Target {
  coord: { galaxy: number; system: number; position: number }
  kind: 'npc' | 'empty' | 'own' | 'space'
  name: string
}

const KIND_ALLOWED: Record<Target['kind'], MissionType[]> = {
  npc: ['attack', 'espionage', 'transport'],
  own: ['transport', 'deploy'],
  empty: ['colonize'],
  space: ['expedition'],
}

// npc 是通用缩写，两语同形，不入语言包
const KIND_LABEL_KEY: Record<Target['kind'], string | null> = {
  own: 'galaxy.own',
  npc: null,
  space: 'galaxy.spaceLabel',
  empty: 'galaxy.emptySlot',
}

// 侦察到什么就显示什么。未揭示的字段一律显示「？」，
// 绝不回退到直接读 npc.fleet / npc.defenses —— 那是本页此前最大的信息泄露点。
function IntelCell({ report }: { report: EspionageReportData }) {
  const { t } = useLocale()
  // 一档都没揭示时不能渲染成空白，否则玩家会以为侦察功能坏了。
  const revealed =
    report.fleetTotal !== undefined || report.defenseTotal !== undefined || report.resources !== undefined || report.fleet !== undefined
  if (!revealed) {
    return (
      <div className="text-xs">
        <span className="text-bad">{t('galaxy.scanFailed')}</span>
        <div className="text-[10px] text-ink-2">{t('galaxy.scanFailedHint')}</div>
        {report.probesLost ? <div className="text-[10px] text-bad num">{t('galaxy.probesLost', { n: report.probesLost })}</div> : null}
      </div>
    )
  }
  const fleetText =
    report.fleetTotal !== undefined ? t('galaxy.fleetCount', { n: report.fleetTotal }) : t('galaxy.fleetUnknown')
  const defText =
    report.defenseTotal !== undefined ? t('galaxy.defenseCount', { n: report.defenseTotal }) : t('galaxy.defenseUnknown')
  const composition = report.fleet
    ? Object.entries(report.fleet)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${findTerm(+id, 'ships') ?? t('galaxy.unknownShip', { id })}×${n}`)
        .join(listSep())
    : ''
  return (
    <div className="text-xs">
      <span className={`num ${report.fleetTotal !== undefined ? 'text-warn' : 'text-ink-2'}`}>{fleetText}</span>
      <span className="mx-1 text-ink-3">·</span>
      <span className={`num ${report.defenseTotal !== undefined ? 'text-warn' : 'text-ink-2'}`}>{defText}</span>
      {composition && <div className="text-[10px] text-ink-2 num">{t('galaxy.composition', { c: composition })}</div>}
      {report.resources && (
        <div className="text-[10px]">
          {t('galaxy.stock')}{' '}
          <span className="text-metal num">{t('common.metal')}{fmt(report.resources.metal)}</span>{' '}
          <span className="text-crystal num">{t('common.crystal')}{fmt(report.resources.crystal)}</span>{' '}
          <span className="text-deut num">{t('common.deuterium')}{fmt(report.resources.deuterium)}</span>
        </div>
      )}
      {report.probesLost ? <div className="text-[10px] text-bad num">{t('galaxy.probesLost', { n: report.probesLost })}</div> : null}
    </div>
  )
}

export default function Galaxy({ planetId }: { planetId: number }) {
  const { t } = useLocale()
  const planets = useGame((s) => s.planets)
  const npcs = useGame((s) => s.npcs)
  const debrisFields = useGame((s) => s.debrisFields)
  const reports = useGame((s) => s.reports)
  const missions = useGame((s) => s.missions)
  const phalanxScan = useGame((s) => s.phalanxScan)

  const [galaxy, setGalaxy] = useState(1)
  const [system, setSystem] = useState(8)
  const [target, setTarget] = useState<Target | null>(null)
  const [missileTarget, setMissileTarget] = useState<Target | null>(null)
  const [scanned, setScanned] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState(3)
  const [mapCamera, setMapCamera] = useState({ x: 0, y: 0, scale: 1 })
  const dragStart = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null)

  // 每个坐标只保留最新一份侦察报告（放在早退 return 之前，hooks 顺序无条件稳定）
  const latestReport = useMemo(() => {
    const map = new Map<string, EspionageReportData>()
    for (const r of reports) {
      if (r.kind !== 'espionage') continue
      const k = npcKey(r.coords)
      const cur = map.get(k)
      if (!cur || r.time > cur.time) map.set(k, r)
    }
    return map
  }, [reports])

  const origin = planets.find((p) => p.id === planetId)
  if (!origin) {
    return (
      <div className="nova-page space-y-4">
        <h2 className="page-title hud-rule" data-en="GALAXY VIEW">{t('galaxy.title')}</h2>
        <div className="empty">{t('galaxy.noPlanet')}</div>
      </div>
    )
  }
  const kindLabel = (kind: Target['kind']) => {
    const key = KIND_LABEL_KEY[kind]
    return key ? t(key) : 'NPC'
  }
  const phalanx = phalanxLevel(planets, galaxy, system)

  const rows: Target[] = []
  for (let pos = 1; pos <= 15; pos++) {
    const own = planets.find((p) => p.coords.galaxy === galaxy && p.coords.system === system && p.coords.position === pos)
    const npc = npcs[npcKey({ galaxy, system, position: pos })]
    if (own) rows.push({ coord: own.coords, kind: 'own', name: own.name })
    else if (npc) rows.push({ coord: npc.coords, kind: 'npc', name: npc.name })
    else rows.push({ coord: { galaxy, system, position: pos }, kind: 'empty', name: t('galaxy.emptyName') })
  }
  rows.push({ coord: { galaxy, system, position: 16 }, kind: 'space', name: t('galaxy.deepSpace') })

  // 表格与卡片两套布局共用同一份行数据，避免残骸/军情/月球判定写两遍
  const rowInfos = rows.map((row) => {
    const debris = debrisFields[npcKey(row.coord)]
    return {
      row,
      debris,
      hasDebris: !!(debris && (debris.metal > 0 || debris.crystal > 0)),
      report: row.kind === 'npc' ? latestReport.get(npcKey(row.coord)) : undefined,
      hasMoon: planets.some(
        (p) =>
          p.isMoon &&
          p.coords.galaxy === row.coord.galaxy &&
          p.coords.system === row.coord.system &&
          p.coords.position === row.coord.position,
      ),
    }
  })
  const selectedInfo = rowInfos.find((info) => info.row.coord.position === selectedPosition) ?? rowInfos[0]
  // 护盾状态真实化（2026-09-25）：己方星球按穹顶实数（407/408），不再写死 98.6%
  const selectedOwn =
    selectedInfo.row.kind === 'own'
      ? planets.find(
          (p) =>
            !p.isMoon &&
            p.coords.galaxy === selectedInfo.row.coord.galaxy &&
            p.coords.system === selectedInfo.row.coord.system &&
            p.coords.position === selectedInfo.row.coord.position,
        )
      : undefined
  const selectedDomes = selectedOwn ? (selectedOwn.defenses[407] ?? 0) + (selectedOwn.defenses[408] ?? 0) : 0
  // 月直径展示（经典公式生成的 moonDiameter；旧档/无月球为 undefined）
  const selectedMoon = planets.find(
    (p) =>
      p.isMoon &&
      p.coords.galaxy === selectedInfo.row.coord.galaxy &&
      p.coords.system === selectedInfo.row.coord.system &&
      p.coords.position === selectedInfo.row.coord.position,
  )
  const selectedMoonDiameter = selectedMoon?.moonDiameter
  const discoveredCount = rowInfos.filter((info) => info.row.kind !== 'empty').length
  const colonyCount = rowInfos.filter((info) => info.row.kind === 'own').length
  const hostileCount = rowInfos.filter((info) => info.row.kind === 'npc').length
  const scanPercent = Math.round((discoveredCount / rowInfos.length) * 100)

  // 传感器阵列只呈现「移动中的舰队」：来源、目标、到达时间。
  // 原版（OGameX PhalanxService）明确不显示驻军，此前本页用它透视驻军是错的。
  const scanKey = `${galaxy}:${system}`
  const incoming = missions.filter((m) => m.phase === 'out' && m.to.galaxy === galaxy && m.to.system === system)

  const doScan = () => {
    const err = phalanxScan(galaxy, system)
    if (err) {
      toast(err, 'warn')
      return
    }
    setScanned(scanKey)
    sfx('click')
  }

  const openWizard = (row: Target) => {
    setTarget(row)
    sfx('click')
  }
  const openMissile = (row: Target) => {
    setMissileTarget(row)
    sfx('click')
  }

  const startMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Planet nodes remain clickable; only the empty map surface starts a camera drag.
    if (event.target instanceof Element && event.target.closest('button')) return
    dragStart.current = { x: event.clientX, y: event.clientY, cameraX: mapCamera.x, cameraY: mapCamera.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    setMapCamera((current) => ({ ...current, x: Math.max(-90, Math.min(90, dragStart.current!.cameraX + event.clientX - dragStart.current!.x)), y: Math.max(-55, Math.min(55, dragStart.current!.cameraY + event.clientY - dragStart.current!.y)) }))
  }
  const endMapDrag = () => { dragStart.current = null }
  const zoomMap = (delta: number) => setMapCamera((current) => ({ ...current, scale: Math.max(.9, Math.min(1.35, current.scale + delta)) }))
  const wheelMap = (event: ReactWheelEvent<HTMLDivElement>) => { event.preventDefault(); zoomMap(event.deltaY < 0 ? .1 : -.1) }

  return (
    <div className="nova-page nova-galaxy-page">
      <section className="nova-galaxy-workspace" aria-label={t('galaxy.mapAria', { g: galaxy, s: system })}>
        <header className="nova-galaxy-title">
          <h2>{t('galaxy.title')}</h2><b>GALAXY</b>
          <span>{t('galaxy.subtitle')}</span><small>EXPLORE THE VAST UNIVERSE. CONNECT A BRIGHTER TOMORROW.</small>
        </header>

        <aside className="nova-galaxy-left">
          <section className="nova-galaxy-panel">
            <div className="nova-galaxy-panel__title"><NovaIcon name="galaxy" /><b>{t('galaxy.overview')}<small>GALAXY OVERVIEW</small></b></div>
            <div className="nova-galaxy-metrics">
              <div><NovaIcon name="planet" /><span>{t('galaxy.discovered')}<small>DISCOVERED</small></span><b>{discoveredCount}/16</b></div>
              <div><NovaIcon name="base" /><span>{t('galaxy.colonies')}<small>COLONIES</small></span><b>{colonyCount}</b></div>
              <div><NovaIcon name="fleet" /><span>{t('galaxy.activeFleets')}<small>ACTIVE FLEETS</small></span><b>{incoming.length}</b></div>
              <div data-alert={hostileCount > 0 || undefined}><NovaIcon name="alert" /><span>{t('galaxy.hostile')}<small>HOSTILE</small></span><b>{hostileCount}</b></div>
            </div>
            <div className="nova-galaxy-scan-meter"><span>{t('galaxy.scanCompletion')}<small>SCAN COMPLETION</small></span><b>{scanPercent}%</b><i><u style={{ width: `${scanPercent}%` }} /></i></div>
          </section>

          <section className="nova-galaxy-panel nova-galaxy-navigation">
            <div className="nova-galaxy-panel__title"><NovaIcon name="radar" /><b>{t('galaxy.navigation')}<small>GALAXY NAVIGATION</small></b></div>
            <div className="nova-galaxy-tier-list">
              {[1, 2, 3].map((g) => <button key={g} type="button" data-active={galaxy === g || undefined} onClick={() => { setGalaxy(g); setSystem(1); setSelectedPosition(1); setScanned(null); sfx('click') }}><NovaIcon name="galaxy" /><span>{t('galaxy.milkyway')} {g}<small>{g === 1 ? t('galaxy.zone1') : g === 2 ? t('galaxy.zone2') : t('galaxy.zone3')}</small></span><em>{g === 1 ? t('galaxy.safe') : g === 2 ? t('galaxy.midRisk') : t('galaxy.highRisk')}</em></button>)}
            </div>
            <div className="nova-system-grid" aria-label={t('galaxy.pickSystem')}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((s) => <button key={s} type="button" data-active={system === s || undefined} onClick={() => { setSystem(s); setSelectedPosition(1); setScanned(null); sfx('click') }}>{s.toString().padStart(2, '0')}</button>)}
            </div>
          </section>

          <section className="nova-galaxy-panel nova-scan-status">
            <div className="nova-galaxy-panel__title"><NovaIcon name="radar" /><b>{t('galaxy.scanStatus')}<small>SCAN STATUS</small></b></div>
            <div><span>{t('galaxy.systemScan')}</span><b>{scanned === scanKey ? t('galaxy.done') : t('galaxy.standby')}</b></div>
            <div><span>{t('galaxy.sensorArray')}</span><b>Lv.{phalanx}</b></div>
            {phalanx > 0 ? <button type="button" onClick={doScan}><NovaIcon name="radar" />{t('galaxy.scanHere')} <small>{fmt(PHALANX_SCAN_COST)} {t('galaxy.fuel')}</small></button> : <p>{t('galaxy.scanHint')}</p>}
            {scanned === scanKey && <p>{incoming.length ? t('galaxy.detected', { n: incoming.length }) : t('galaxy.noneDetected')}</p>}
          </section>
        </aside>

        <main className="nova-galaxy-center">
          <div className="nova-galaxy-center__header"><span>{t('galaxy.tacticalView')} {galaxy} · {t('galaxy.system')} {system}<small>GALAXY TACTICAL VIEW</small></span><div><i className="is-own" />{t('galaxy.own')}<i className="is-hostile" />{t('galaxy.legendHostile')}<i />{t('galaxy.emptySlot')}</div></div>
          <div className="nova-galaxy-map" onPointerDown={startMapDrag} onPointerMove={moveMapDrag} onPointerUp={endMapDrag} onPointerCancel={endMapDrag} onWheel={wheelMap}>
            <div className="nova-galaxy-map__camera" style={{ '--galaxy-x': `${mapCamera.x}px`, '--galaxy-y': `${mapCamera.y}px`, '--galaxy-scale': mapCamera.scale } as CSSProperties}>
              <div className="nova-galaxy-orbit nova-galaxy-orbit--outer" aria-hidden="true" />
              <div className="nova-galaxy-orbit nova-galaxy-orbit--inner" aria-hidden="true" />
              <div className="nova-galaxy-orbit nova-galaxy-orbit--mid" aria-hidden="true" />
              <div className="nova-galaxy-star"><span /><b>{galaxy}:{system}</b></div>
              {rowInfos.map((info, index) => {
                const angle = (index / 16) * Math.PI * 2 - Math.PI / 2
                const radius = index % 3 === 0 ? 31 : index % 2 === 0 ? 40 : 23
                const x = 50 + Math.cos(angle) * radius
                const y = 50 + Math.sin(angle) * radius * .72
                return <button key={`orbit-${info.row.coord.position}`} type="button" data-active={selectedInfo.row.coord.position === info.row.coord.position || undefined} className={`nova-galaxy-planet nova-galaxy-planet--${info.row.kind}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={(event) => { event.stopPropagation(); setSelectedPosition(info.row.coord.position); sfx('click') }} aria-label={t('galaxy.positionAria', { n: info.row.coord.position, name: translatePlanetName(info.row.name) })}><span className="nova-galaxy-planet__shield"><i>{info.row.coord.position === 16 ? <NovaIcon name="galaxy" /> : info.row.coord.position}</i></span><b>{translatePlanetName(info.row.name)}</b><small>[{galaxy}:{system}:{info.row.coord.position}]</small>{info.hasMoon && <NovaIcon name="moon" />}{info.hasDebris && <em className="nova-galaxy-debris">{t('galaxy.debris')}</em>}</button>
              })}
            </div>
          </div>
          <div className="nova-galaxy-controls"><span>{t('galaxy.viewControl')}<small>GALAXY VIEW CONTROL</small></span><button type="button" onClick={() => zoomMap(.1)}><NovaIcon name="zoom" />{t('galaxy.zoomIn')}</button><button type="button" onClick={() => zoomMap(-.1)}><NovaIcon name="zoom" />{t('galaxy.zoomOut')}</button><button type="button" onClick={() => setMapCamera({ x: 0, y: 0, scale: 1 })}><NovaIcon name="focus" />{t('galaxy.resetView')}</button><em>{t('galaxy.curCoord')} <b>{galaxy}:{system}:{selectedInfo.row.coord.position}</b></em></div>
        </main>

        <aside className="nova-galaxy-right nova-galaxy-panel">
          <div className="nova-galaxy-panel__title"><NovaIcon name="focus" /><b>{t('galaxy.selectedTarget')}<small>SELECTED TARGET</small></b></div>
          <div className={`nova-target-portrait nova-target-portrait--${selectedInfo.row.kind}`}><span><i /></span></div>
          <div className="nova-target-name"><NovaIcon name={selectedInfo.row.kind === 'own' ? 'base' : selectedInfo.row.kind === 'npc' ? 'alert' : selectedInfo.row.kind === 'space' ? 'galaxy' : 'planet'} /><span><b>{translatePlanetName(selectedInfo.row.name)}</b><small>{kindLabel(selectedInfo.row.kind)} · POSITION {selectedInfo.row.coord.position}</small></span></div>
          <div className="nova-target-coordinates"><span>{t('galaxy.coordLabel')}<small>COORDINATES</small></span><b>({galaxy}, {system}, {selectedInfo.row.coord.position})</b></div>
          <div className="nova-target-stats"><div><span>{t('galaxy.targetType')}</span><b>{kindLabel(selectedInfo.row.kind)}</b></div><div><span>{t('galaxy.shieldState')}</span><b>{selectedInfo.row.kind === 'own' ? (selectedDomes > 0 ? t('galaxy.domeCount', { n: selectedDomes }) : t('galaxy.noDome')) : selectedInfo.row.kind === 'npc' ? t('galaxy.unknown') : t('galaxy.none')}</b></div><div><span>{t('galaxy.orbitPos')}</span><b>{t('galaxy.orbitN', { n: selectedInfo.row.coord.position })}</b></div><div><span>{t('galaxy.moonSignal')}</span><b>{selectedInfo.hasMoon ? `${t('galaxy.moonFound')}${selectedMoonDiameter ? t('galaxy.moonDiameter', { n: selectedMoonDiameter }) : ''}` : t('galaxy.moonNotFound')}</b></div></div>
          <div className="nova-target-intel"><b>{t('galaxy.intel')}<small>TARGET INTELLIGENCE</small></b>{selectedInfo.row.kind === 'npc' ? selectedInfo.report ? <IntelCell report={selectedInfo.report} /> : <p>{t('galaxy.intelUnknown')}</p> : <p>{selectedInfo.row.kind === 'own' ? t('galaxy.ownColonyLink') : selectedInfo.row.kind === 'empty' ? t('galaxy.emptyOrbitHint') : t('galaxy.deepSpaceHint')}</p>}{selectedInfo.hasDebris && selectedInfo.debris && <p className="text-warn">{t('galaxy.debrisLine', { m: fmt(selectedInfo.debris.metal), c: fmt(selectedInfo.debris.crystal) })}</p>}</div>
          <div className="nova-target-actions"><button type="button" className="is-primary" onClick={() => openWizard(selectedInfo.row)}><NovaIcon name="fleet" />{t('galaxy.sendFleet')}<small>SEND FLEET</small></button>{selectedInfo.row.kind === 'npc' && <button type="button" onClick={() => openWizard(selectedInfo.row)}><NovaIcon name="radar" />{t('galaxy.scan')}<small>SCAN</small></button>}{selectedInfo.row.kind === 'npc' && <button type="button" className="is-danger" onClick={() => openMissile(selectedInfo.row)}><NovaIcon name="missile" />{t('galaxy.missile')}<small>MISSILE</small></button>}</div>
        </aside>
      </section>

      {target && (
        <DispatchWizard
          originId={planetId}
          target={target}
          allowedTypes={(() => {
            const base = KIND_ALLOWED[target.kind]
            const debris = debrisFields[npcKey(target.coord)]
            const hasDebris = debris && (debris.metal > 0 || debris.crystal > 0)
            return hasDebris && target.kind !== 'space' ? [...base, 'recycle' as MissionType] : base
          })()}
          onClose={() => setTarget(null)}
        />
      )}
      {missileTarget && <MissileModal planetId={planetId} target={missileTarget} onClose={() => setMissileTarget(null)} />}
    </div>
  )
}
