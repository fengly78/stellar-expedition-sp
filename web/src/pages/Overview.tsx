import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { BUILDINGS, buildingCost, buildingTime, diagnoseEnergy, fmt, maxFields, planetProductionForPlanet, usedFields } from '../game/objects'
import { TUTORIAL_STEPS, type TutorialTab } from '../game/tutorial'
import { useGame } from '../game/state'
import { formatDuration, translatePlanetName, translateTerm, useLocale } from '../game/i18n'
import Modal, { ConfirmModal } from '../components/Modal'
import NovaIcon from '../components/NovaIcon'
import type { NovaIconName } from '../components/NovaIcon'
import { buildingAtlasStyle } from '../game/novaAssets'

// 主标 label 为中文、副标 en 为英文，属已确认的「中文主标 + EN 副标」设计
// （同页「指挥中继 / Command Relay」，以及 Buildings/Research 分类名）。
// 这里刻意不引入 i18n 键：scene.* 这类键一旦漏进语言包，t() 会把键名原样显示
// 到界面上，而「EN 零 CJK」扫描抓不到（键名是拉丁字符）。详见 missing-i18n-keys.test.ts。
const SCENE_LINKS: Array<{ label: string; en: string; className: string; icon: NovaIconName; buildingId: number }> = [
  { label: '金属矿场', en: 'Metal Mine', className: 'nova-scene-link--metal', icon: 'metal', buildingId: 1 },
  { label: '晶体矿场', en: 'Crystal Mine', className: 'nova-scene-link--crystal', icon: 'crystal', buildingId: 2 },
  { label: '研究实验室', en: 'Research Lab', className: 'nova-scene-link--research', icon: 'research', buildingId: 31 },
  { label: '轨道船坞', en: 'Orbital Shipyard', className: 'nova-scene-link--shipyard', icon: 'fleet', buildingId: 21 },
  { label: '防御雷达', en: 'Radar Array', className: 'nova-scene-link--radar', icon: 'radar', buildingId: 42 },
]

const BUILDING_EN: Record<number, string> = { 1: 'METAL MINE', 2: 'CRYSTAL MINE', 3: 'DEUTERIUM SYNTH', 4: 'SOLAR POWER', 14: 'ROBOTICS FACTORY', 21: 'ORBITAL SHIPYARD', 22: 'METAL STORAGE', 23: 'CRYSTAL STORAGE', 24: 'FUEL STORAGE', 31: 'RESEARCH LAB', 33: 'TERRAFORMER', 41: 'LUNAR BASE', 42: 'SENSOR ARRAY', 43: 'JUMP GATE', 44: 'MISSILE SILO' }
const BUILDING_MOTTO: Record<number, [string, string]> = {
  1: ['“深掘地核，铸造文明。”', 'FROM THE CORE, WE BUILD.'],
  2: ['“折射星光，凝聚未来。”', 'CRYSTAL LIGHTS THE WAY.'],
  14: ['“精密建造，扩展家园。”', 'AUTOMATE TODAY. EXPAND TOMORROW.'],
  21: ['“从轨道启航，驶向群星。”', 'FROM ORBIT, WE REACH THE STARS.'],
  31: ['“知识拓展边界。”', 'KNOWLEDGE EXPANDS BOUNDARIES.'],
  42: ['“洞察黑暗，预见威胁。”', 'SEE FARTHER. RESPOND FASTER.'],
}

export default function Overview({ planetId, onJumpTo }: { planetId: number; onJumpTo?: (tab: TutorialTab) => void }) {
  const { t, locale } = useLocale()
  const en = locale === 'en'
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const techs = useGame((s) => s.techs)
  const officers = useGame((s) => s.officers)
  const activeEvent = useGame((s) => s.activeEvent)
  const now = useGame((s) => s.gameTime)
  const tutorialDone = useGame((s) => s.tutorialDone)
  const tutorialSkipped = useGame((s) => s.tutorialSkipped)
  const skipTutorial = useGame((s) => s.skipTutorial)
  const renamePlanet = useGame((s) => s.renamePlanet)
  const abandonPlanet = useGame((s) => s.abandonPlanet)
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  // 默认选中「教程当前这一步要造的建筑」。引导条说金属矿、详情卡却默认机器人工厂，
  // 是新手开局最直接的方向割裂（2026-09-28 试玩发现）。玩家在场景上点过之后即改用玩家选择。
  const [pickedBuildingId, setPickedBuildingId] = useState<number | null>(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1, orbit: 0 })
  const dragStart = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null)

  const prod = planet && planetProductionForPlanet(planet, techs, { officers, flare: !!activeEvent })
  const energy = prod && planet && diagnoseEnergy(prod.energyOut, prod.energyIn, planet, techs[113] ?? 0)

  if (!planet || !prod || !energy) return <div className="empty">{t('overview.noData')}</div>

  const fields = usedFields(planet.buildings, planet.defenses)
  const fieldCap = maxFields(planet.buildings, !!planet.isMoon)
  // 设施种类按天体口径：行星 12 种 / 月球 6 种。分母用全 BUILDINGS 表会把月面建筑算进行星。
  const bodyBuildingIds = planet.isMoon ? [41, 14, 21, 42, 43, 44] : [1, 2, 3, 4, 12, 14, 21, 22, 23, 24, 31, 44, 33]
  const structureCount = bodyBuildingIds.filter((id) => (planet.buildings[id] ?? 0) > 0).length
  const defenseCount = Object.values(planet.defenses).reduce((sum, count) => sum + count, 0)
  // 护盾穹顶（407 小型 / 408 大型）——唯一护盾来源；零穹顶 = 无护盾（2026-09-24 假数据修复）
  const domeCount = (planet.defenses[407] ?? 0) + (planet.defenses[408] ?? 0)
  // 选中口径：玩家点过就用玩家的；没点过就跟随教程当前步骤的 focus 建筑；
  // 教程已完成/跳过或该步没有 focus 时兜底到机器人工厂（14，与历史行为一致）。
  const tutorialFocus = TUTORIAL_STEPS.find((step) => !tutorialDone.includes(step.id) && step.focus)?.focus
  const selectedBuildingId = pickedBuildingId ?? tutorialFocus ?? 14
  const selectedId = BUILDINGS[selectedBuildingId] ? selectedBuildingId : 14
  const selectedDef = BUILDINGS[selectedId] ?? BUILDINGS[14]
  const selectedLevel = planet.buildings[selectedId] ?? 0
  const selectedCost = buildingCost(selectedDef, selectedLevel)
  const selectedTime = buildingTime(selectedDef, selectedLevel, planet.buildings[14] ?? 0)
  const fleetTotal = Object.values(planet.ships).reduce((sum, count) => sum + count, 0)
  // 选中详情只显示可从状态推导的真实指标（2026-09-24 假数据清理：删 99.8% 完整度/编造加成等）
  const selectedStats: Array<[string, string]> = (() => {
    if (selectedId === 1) return [[t('overview.statMetalProd'), `${fmt(prod.metal)}/h`], [t('overview.statCurrentLv'), `Lv.${selectedLevel}`], [t('overview.statNextCost'), `${fmt(selectedCost.metal)} M`]]
    if (selectedId === 2) return [[t('overview.statCrystalProd'), `${fmt(prod.crystal)}/h`], [t('overview.statCurrentLv'), `Lv.${selectedLevel}`], [t('overview.statNextCost'), `${fmt(selectedCost.crystal)} C`]]
    if (selectedId === 31) return [[t('overview.statResearchCap'), `Lv.${selectedLevel}`], [t('overview.statResearchTime'), `÷${1 + selectedLevel}`], [t('overview.statResearchThread'), '2']]
    if (selectedId === 21) return [[t('overview.statManufactureLv'), `Lv.${selectedLevel}`], [t('overview.statActiveShips'), fmt(fleetTotal)]]
    if (selectedId === 42) return [[t('overview.statScanCoverage'), t('overview.scanCoverageValue', { n: Math.max(0, selectedLevel * selectedLevel - 1) })], [t('overview.statCurrentLv'), `Lv.${selectedLevel}`]]
    if (selectedId === 3) return [[t('overview.statDeutProd'), `${fmt(prod.deuterium)}/h`], [t('overview.statCurrentLv'), `Lv.${selectedLevel}`]]
    if (selectedId === 4) return [[t('overview.statEnergyCap'), `${fmt(prod.energyOut)} MW`], [t('overview.statCurrentLv'), `Lv.${selectedLevel}`]]
    return [[t('overview.statCurrentLv'), `Lv.${selectedLevel}`]]
  })()
  const nextStep = TUTORIAL_STEPS.find((step) => !tutorialDone.includes(step.id))

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const x = Math.max(-110, Math.min(110, dragStart.current.cameraX + event.clientX - dragStart.current.x))
    const y = Math.max(-55, Math.min(55, dragStart.current.cameraY + event.clientY - dragStart.current.y))
    setCamera((current) => ({ ...current, x, y }))
  }
  const endDrag = () => { dragStart.current = null }
  const zoomScene = (direction: number) => setCamera((current) => ({ ...current, scale: Math.max(1, Math.min(1.35, current.scale + direction * .1)) }))
  const wheelScene = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    zoomScene(event.deltaY < 0 ? 1 : -1)
  }

  return (
    <div className="nova-page nova-home-page">
      <section className="nova-home-stage" aria-label={`${translatePlanetName(planet.name)} ${t('overview.title')}`}>
        <div className="nova-home-scene" aria-hidden="true" style={{ '--camera-x': `${camera.x}px`, '--camera-y': `${camera.y}px`, '--camera-scale': camera.scale, '--camera-orbit': `${camera.orbit}deg` } as CSSProperties} />
        <div className="nova-orbit-surface" role="application" aria-label={t('overview.ariaScene')} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={wheelScene} />

        <header className="nova-home-title">
          <h2>{t('overview.title')}</h2>
          <p>HOME PLANET</p>
          <span>{t('overview.subtitle')}</span>
          <small>A STRONG HOME, A BRIDGE TO A BRIGHTER TOMORROW.</small>
        </header>

        <aside className="nova-hud-panel nova-home-overview panel-hud">
          <div className="nova-hud-title"><span>{t('overview.planetOverview')}</span><small>PLANET OVERVIEW</small></div>
          <div className="nova-shield-readout">
            <span className="nova-shield-icon"><NovaIcon name="shield" /></span>
            <span><b>{t('overview.shieldDome')}</b><small>SHIELD DOME</small></span>
            <strong className="num">{domeCount > 0 ? `×${domeCount}` : t('overview.shieldNone')}</strong>
          </div>
          {domeCount === 0 && <div className="nova-meter"><span style={{ width: '0%' }} /></div>}
          <div className="nova-overview-grid">
            <div><small>{t('overview.fields')}</small><b className="num">{fields} / {fieldCap}</b></div>
            <div><small>{t('overview.energyOut')}</small><b className="num">{fmt(prod.energyOut)} MW</b></div>
            <div><small>{t('overview.structureTypes')}</small><b className="num">{structureCount} / {bodyBuildingIds.length}</b></div>
            <div><small>{t('overview.defenses')}</small><b className="num">{defenseCount}</b></div>
          </div>
        </aside>

        <aside className="nova-hud-panel nova-home-queue panel-hud">
          <div className="nova-hud-title"><span>{t('overview.buildQueue')}</span><small>BUILD QUEUE</small><em>{planet.buildingQueue.length ? t('overview.building') : t('overview.idle')}</em></div>
          <div className="nova-queue-list">
            {planet.buildingQueue.length ? planet.buildingQueue.slice(0, 3).map((q, index) => {
              const def = BUILDINGS[q.objectId]
              const total = def ? buildingTime(def, q.level - 1, planet.buildings[14] ?? 0) : 1
              const remaining = Math.max(0, (q.finishAt - now) / 1000)
              const pct = Math.min(100, Math.max(4, (1 - remaining / total) * 100))
              return (
                <div className="nova-queue-row" key={`${q.objectId}-${index}`}>
                  <span className="nova-queue-thumb nova-atlas-thumb" style={buildingAtlasStyle(q.objectId)} aria-hidden="true" />
                  <span><b>{translateTerm(q.objectId, 'buildings')} Lv.{q.level}</b><small>{index === 0 ? `${t('overview.remaining')} ${formatDuration(remaining)}` : t('overview.waiting')}</small><i><span style={{ width: `${pct}%` }} /></i></span>
                  <strong className="num">{Math.round(pct)}%</strong>
                </div>
              )
            }) : <div className="nova-queue-empty">{t('overview.noTasks')}</div>}
          </div>
          {nextStep && !tutorialSkipped && (
            <div className="nova-guide-line">
              <span>{t('overview.nextGoal')}{t('common.colon')}{en ? nextStep.titleEn : nextStep.title}</span>
              {/* 无 tab 时不渲染「前往」：此前 nextStep.tab && onJumpTo?.(...) 会短路，
                  按钮看起来可点却毫无反应（2026-09-28 教程 13/14/15 步即因此静默失效）。
                  TutorialStep.tab 现为必填，这里只是 UI 侧的兜底。 */}
              {nextStep.tab && <button type="button" onClick={() => onJumpTo?.(nextStep.tab!)}>{t('overview.go')}</button>}
              <button type="button" onClick={skipTutorial}>{t('overview.skip')}</button>
            </div>
          )}
        </aside>

        <aside className="nova-hud-panel nova-home-detail panel-hud">
          <div className="nova-hud-title"><span>{t('overview.selectedBuilding')}</span><small>SELECTED BUILDING</small></div>
          <div className="nova-selected-building">
            <div className="nova-selected-building__image nova-atlas-thumb" style={buildingAtlasStyle(selectedId)} aria-hidden="true" />
            <div><b>{translateTerm(selectedId, 'buildings')}</b><small>{BUILDING_EN[selectedId] ?? 'PLANETARY STRUCTURE'}</small></div>
            <strong>Lv.{selectedLevel}</strong>
          </div>
          <blockquote>{(BUILDING_MOTTO[selectedId] ?? ['“连接星系，统御未来。”', 'COMMAND TODAY. A GREATER TOMORROW.'])[0]}<small>{(BUILDING_MOTTO[selectedId] ?? ['“连接星系，统御未来。”', 'COMMAND TODAY. A GREATER TOMORROW.'])[1]}</small></blockquote>
          <div className="nova-detail-stats">
            {selectedStats.map(([label, value]) => <div key={label}><span>{label}</span><b className="num">{value}</b></div>)}
          </div>
          <div className="nova-upgrade-cost">
            <span>{t('overview.upgradeNeeds')}<small>UPGRADE REQUIREMENTS</small></span>
            <div><b data-short={planet.resources.metal < selectedCost.metal || undefined}><NovaIcon name="metal" />{t('common.metal')} <em className="num">{fmt(selectedCost.metal)}</em></b><b data-short={planet.resources.crystal < selectedCost.crystal || undefined}><NovaIcon name="crystal" />{t('common.crystal')} <em className="num">{fmt(selectedCost.crystal)}</em></b><b data-short={planet.resources.deuterium < selectedCost.deuterium || undefined}><NovaIcon name="fuel" />{t('common.deuterium')} <em className="num">{fmt(selectedCost.deuterium)}</em></b></div>
            <p>{t('overview.buildTime')} <strong className="num">{formatDuration(selectedTime)}</strong></p>
          </div>
          <button type="button" className="nova-upgrade-button" onClick={() => onJumpTo?.(selectedId === 31 ? 'research' : selectedId === 21 || selectedId === 42 ? 'shipyard' : 'buildings')}><NovaIcon name={selectedId === 31 ? 'research' : selectedId === 21 || selectedId === 42 ? 'fleet' : 'building'} /> {selectedId === 31 ? t('overview.enterResearch') : selectedId === 21 || selectedId === 42 ? t('overview.enterShipyard') : <>{t('build.startLv')} {translateTerm(selectedId, 'buildings')}</>}<small>{selectedId === 31 ? 'OPEN RESEARCH' : selectedId === 21 || selectedId === 42 ? 'OPEN MANUFACTURING' : 'UPGRADE BUILDING'}</small></button>
          <div className="nova-detail-actions">
            <button type="button" onClick={() => { setRenameText(planet.name); setRenaming(true) }}>{t('overview.rename')}</button>
            {!planet.isHome && <button type="button" onClick={() => setConfirmAbandon(true)}>{t('overview.abandon')}</button>}
          </div>
        </aside>

        <button type="button" data-active={selectedId === 14 || undefined} onClick={() => setPickedBuildingId(14)} className="nova-scene-label nova-scene-label--command"><b>指挥中继</b><small>Command Relay</small></button>
        {SCENE_LINKS.map((link) => (
          <button key={link.buildingId} type="button" data-active={selectedId === link.buildingId || undefined} onClick={() => setPickedBuildingId(link.buildingId)} className={`nova-scene-link ${link.className}`}>
            <NovaIcon name={link.icon} /><b>{link.label}</b><small>{link.en}</small>
          </button>
        ))}

        <div className="nova-view-controls">
          <span>{t('overview.planetViewControl')}<small>PLANET VIEW CONTROL</small></span>
          <button type="button" data-active={camera.x !== 0 || camera.y !== 0 || undefined} onClick={() => setCamera((current) => ({ ...current, x: current.x ? 0 : 45 }))}><NovaIcon name="drag" /> {t('overview.drag')}<small>DRAG</small></button>
          <button type="button" data-active={camera.scale > 1 || undefined} onClick={() => zoomScene(camera.scale >= 1.3 ? -3 : 1)}><NovaIcon name="zoom" /> {t('overview.zoom')}<small>ZOOM</small></button>
          <button type="button" data-active={camera.orbit !== 0 || undefined} onClick={() => setCamera((current) => ({ ...current, orbit: (current.orbit + 4) % 12 }))}><NovaIcon name="orbit" /> {t('overview.orbit')}<small>ORBIT</small></button>
          <button type="button" onClick={() => setCamera({ x: 0, y: 0, scale: 1.18, orbit: 0 })}><NovaIcon name="focus" /> {t('overview.focus')}<small>FOCUS</small></button>
        </div>

        {energy.factor < 0.995 && <div className="nova-power-alert"><NovaIcon name="energy" /> {t('overview.powerShortage')} · {t('overview.currentOutput', { n: (energy.factor * 100).toFixed(0) + '%' })}</div>}
      </section>

      {renaming && (
        <Modal title={t('overview.renameTitle')} onClose={() => setRenaming(false)}>
          <input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} maxLength={24} aria-label={t('overview.ariaRename')} className="field w-full" />
          <div className="mt-3 flex gap-2">
            <button onClick={() => { renamePlanet(planet.id, renameText); setRenaming(false) }} className="btn btn-primary flex-1">{t('overview.confirm')}</button>
            <button onClick={() => setRenaming(false)} className="btn btn-ghost flex-1">{t('overview.cancel')}</button>
          </div>
        </Modal>
      )}
      {confirmAbandon && (
        <ConfirmModal title={t('overview.abandonTitle')} message={t('overview.abandonConfirm', { name: planet.name })} danger
          onConfirm={() => { abandonPlanet(planet.id); setConfirmAbandon(false) }} onCancel={() => setConfirmAbandon(false)} />
      )}
    </div>
  )
}
