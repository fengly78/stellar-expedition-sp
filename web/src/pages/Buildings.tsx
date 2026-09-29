import { useState } from 'react'
import type { CSSProperties } from 'react'
import { BUILDINGS, buildingCost, buildingTime, diagnoseEnergy, maxFields, meetsRequires, planetProductionForPlanet, siloCapacity, storageCapacity, usedFields } from '../game/objects'
import { BUILD_SLOTS, useGame } from '../game/state'
import { depositPercentage, initialDeposits } from '../game/oreDeposit'
import { findTerm, formatDuration, listSep, translatePlanetName, translateTerm, useLocale } from '../game/i18n'
import DetailDialog, { type DetailKind } from '../components/DetailDialog'
import NovaIcon, { type NovaIconName } from '../components/NovaIcon'
import { buildingAtlasStyle } from '../game/novaAssets'

// 布局对齐设计稿 nova-construction-pc-v2-unified：
// 左列 = 建筑分类 + 建设队列；中列 = 行星场景 + 施工预览（升级前后对比）；右列 = 选中建筑详情。
// 分类名走 i18n 键（2026-09-28 P1）：此前 name 是中文字面量且渲染点直接 {c.name}，
// 切到英文时分类名仍显示中文。en 字段保留作副标。
const PLANET_CATEGORIES: { id: string; nameKey: string; en: string; icon: NovaIconName; ids: number[] }[] = [
  { id: 'resource', nameKey: 'build.cat.resource', en: 'RESOURCE FACILITIES', icon: 'metal', ids: [1, 2, 3] },
  { id: 'energy', nameKey: 'build.cat.energy', en: 'ENERGY FACILITIES', icon: 'energy', ids: [4, 12] },
  { id: 'space', nameKey: 'build.cat.space', en: 'SPACE FACILITIES', icon: 'fleet', ids: [14, 21, 31] },
  { id: 'defense', nameKey: 'build.cat.defense', en: 'DEFENSE FACILITIES', icon: 'defense', ids: [44] },
  { id: 'command', nameKey: 'build.cat.command', en: 'COMMAND & OTHERS', icon: 'base', ids: [22, 23, 24, 33] },
]
const MOON_CATEGORIES: typeof PLANET_CATEGORIES = [
  { id: 'space', nameKey: 'build.cat.space', en: 'SPACE FACILITIES', icon: 'fleet', ids: [14, 21, 44] },
  { id: 'lunar', nameKey: 'build.cat.lunar', en: 'LUNAR FACILITIES', icon: 'moon', ids: [41, 42, 43] },
]

// 功能说明（真实机制，不做数值承诺）：右栏引言与施工预览底部备注共用。
const BUILDING_NOTES: Record<number, string> = {
  1: 'build.note.1',
  2: 'build.note.2',
  3: 'build.note.3',
  4: 'build.note.4',
  12: 'build.note.12',
  14: 'build.note.14',
  21: 'build.note.21',
  22: 'build.note.22',
  23: 'build.note.23',
  24: 'build.note.24',
  31: 'build.note.31',
  33: 'build.note.33',
  41: 'build.note.41',
  42: 'build.note.42',
  43: 'build.note.43',
  44: 'build.note.44',
}

// 预览/造价按设计稿使用完整千分位数字，而不是 k/M 缩写。
const fmtFull = (n: number): string => Math.round(n).toLocaleString('en-US')

interface EffectRow {
  icon: NovaIconName
  label: string
  en: string
  before: string
  after?: string
  delta?: string
  tone?: 'up' | 'down'
  /** 矿脉剩余比例（<100% 时展示储量条） */
  orePct?: number
}

// 产量行标签走 i18n 键（2026-09-28）：此前 label 是中文字面量且渲染点直接 {row.label}，
// 切到英文仍显示中文；更糟的是 oreRemainAria 把它当 i18n 键传给 t()，双重错误。
const PROD_ROWS: { key: 'metal' | 'crystal' | 'deuterium'; icon: NovaIconName; labelKey: string; en: string }[] = [
  { key: 'metal', icon: 'metal', labelKey: 'build.prodMetal', en: 'METAL PRODUCTION' },
  { key: 'crystal', icon: 'crystal', labelKey: 'build.prodCrystal', en: 'CRYSTAL PRODUCTION' },
  { key: 'deuterium', icon: 'fuel', labelKey: 'build.prodDeuterium', en: 'DEUTERIUM PRODUCTION' },
]

// 矿/电站无论单行是否有变化都完整展示四行产出（对齐设计稿的 BEFORE/AFTER 对照）。
const PROD_BUILDINGS = new Set([1, 2, 3, 4])

export default function Buildings({ planetId }: { planetId: number }) {
  const { t } = useLocale()
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const upgradeBuilding = useGame((s) => s.upgradeBuilding)
  const cancelBuildingQueue = useGame((s) => s.cancelBuildingQueue)
  const togglePauseBuildingQueue = useGame((s) => s.togglePauseBuildingQueue)
  const moveBuildingQueue = useGame((s) => s.moveBuildingQueue)
  const techs = useGame((s) => s.techs)
  const now = useGame((s) => s.gameTime)
  const officers = useGame((s) => s.officers)
  const activeEvent = useGame((s) => s.activeEvent)
  const [msg, setMsg] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ kind: DetailKind; id: number } | null>(null)
  const [selectedId, setSelectedId] = useState(1)

  const prod = planet && planetProductionForPlanet(planet, techs, { officers, flare: !!activeEvent })
  const energy = prod && planet && diagnoseEnergy(prod.energyOut, prod.energyIn, planet, techs[113] ?? 0)

  const categories = planet?.isMoon ? MOON_CATEGORIES : PLANET_CATEGORIES
  const order = categories.flatMap((c) => c.ids)
  const [categoryId, setCategoryId] = useState(categories[0].id)

  if (!planet || !prod || !energy) {
    return (
      <div className="nova-page space-y-4">
        <h2 className="page-title hud-rule" data-en="CONSTRUCTION">{t('build.title')}</h2>
        <div className="empty">{t('ship.noPlanet')}</div>
      </div>
    )
  }

  const cmdMul = officers.commander ? 1.1 : 1
  const prodOpts = { officers, flare: !!activeEvent }
  // 矿脉储量（CR-2026-09-27-ORE）：效率经 planetProduction 同口径生效；预览展示剩余百分比
  const oreInitial = initialDeposits(planet.coords)
  const orePct = (res: 'metal' | 'crystal' | 'deuterium') => depositPercentage(planet.oreDeposits, oreInitial, res)
  const activeCategory = categories.find((c) => c.id === categoryId && c.ids.length > 0) ?? categories[0]
  const activeId = order.includes(selectedId) ? selectedId : order[0]
  const selectedDef = BUILDINGS[activeId]
  const levels = { ...planet.buildings, ...techs }

  // —— 选中建筑：等级语义与既有行动保持一致 ——
  // curLevel = 已建成等级；selectedLevel = 含队列目标；右栏/预览展示 curLevel → previewLevel。
  const curLevel = planet.buildings[activeId] ?? 0
  const selectedQueued = planet.buildingQueue.filter((q) => q.objectId === activeId)
  const selectedLevel = Math.max(curLevel, ...selectedQueued.map((q) => q.level), 0)
  const hasQueued = selectedQueued.length > 0
  const previewLevel = hasQueued ? selectedLevel : selectedLevel + 1
  const selectedCost = buildingCost(selectedDef, selectedLevel)
  const selectedTime = buildingTime(selectedDef, selectedLevel, planet.buildings[14] ?? 0) * (officers.commander ? 0.85 : 1)
  const selectedReqOk = meetsRequires(levels, selectedDef.requires)
  const selectedAffordable =
    planet.resources.metal >= selectedCost.metal &&
    planet.resources.crystal >= selectedCost.crystal &&
    planet.resources.deuterium >= selectedCost.deuterium
  const selectedMaxed = selectedDef.maxLevel > 0 && selectedLevel >= selectedDef.maxLevel

  // —— 生产效果行（全部由公式实算，杜绝装饰性假数据） ——
  const afterPlanet = { ...planet, buildings: { ...planet.buildings, [activeId]: previewLevel } }
  const prodAfter = planetProductionForPlanet(afterPlanet, techs, prodOpts)
  const effectRows: EffectRow[] = []
  for (const row of PROD_ROWS) {
    const before = prod[row.key]
    const after = prodAfter[row.key]
    const delta = after - before
    const changed = Math.abs(delta) >= 0.5
    if (!changed && !PROD_BUILDINGS.has(activeId)) continue
    const pct = orePct(row.key)
    effectRows.push({
      icon: row.icon,
      label: row.labelKey,
      en: row.en,
      before: `${fmtFull(before)}/h`,
      after: `${fmtFull(after)}/h`,
      delta: changed ? `${delta > 0 ? '+' : ''}${fmtFull(delta)}/h` : undefined,
      tone: delta > 0 ? 'up' : 'down',
      orePct: pct,
    })
  }
  if (PROD_BUILDINGS.has(activeId) && activeId !== 4) {
    const consDelta = prodAfter.energyIn - prod.energyIn
    effectRows.push({
      icon: 'energy',
      label: 'build.statEnergyUse',
      en: 'ENERGY CONSUMPTION',
      before: `${fmtFull(prod.energyIn)}/h`,
      after: `${fmtFull(prodAfter.energyIn)}/h`,
      delta: consDelta !== 0 ? `${consDelta > 0 ? '+' : ''}${fmtFull(consDelta)}/h` : undefined,
      tone: consDelta > 0 ? 'down' : 'up',
    })
  }
  const energyDelta = prodAfter.energyOut - prod.energyOut
  if (Math.abs(energyDelta) >= 0.5 || activeId === 4) {
    effectRows.push({
      icon: 'energy',
      label: 'build.statEnergyOut',
      en: 'ENERGY OUTPUT',
      before: `${fmtFull(prod.energyOut)}/h`,
      after: `${fmtFull(prodAfter.energyOut)}/h`,
      delta: energyDelta !== 0 ? `${energyDelta > 0 ? '+' : ''}${fmtFull(energyDelta)}/h` : undefined,
      tone: energyDelta > 0 ? 'up' : 'down',
    })
  }
  if (activeId === 22 || activeId === 23 || activeId === 24) {
    const storeKey = activeId === 22 ? 'metal' : activeId === 23 ? 'crystal' : 'deuterium'
    const before = storageCapacity(planet.buildings[activeId] ?? 0) * cmdMul
    const after = storageCapacity(previewLevel) * cmdMul
    effectRows.push({
      icon: storeKey === 'deuterium' ? 'fuel' : storeKey === 'crystal' ? 'crystal' : 'metal',
      label: 'build.statStorage',
      en: 'STORAGE CAPACITY',
      before: fmtFull(before),
      after: fmtFull(after),
      delta: `+${fmtFull(after - before)}`,
      tone: 'up',
    })
  }
  if (activeId === 14 || activeId === 21) {
    effectRows.push({
      icon: 'building',
      label: activeId === 14 ? 'build.statBuildSpeed' : 'build.statShipSpeed',
      en: activeId === 14 ? 'BUILD SPEED' : 'SHIPYARD SPEED',
      before: `×${1 + (planet.buildings[activeId] ?? 0)}`,
      after: `×${1 + previewLevel}`,
      tone: 'up',
    })
  }
  if (activeId === 31) {
    effectRows.push({
      icon: 'research',
      label: 'build.statTechCap',
      en: 'RESEARCH CAP',
      before: `Lv.${planet.buildings[31] ?? 0}`,
      after: `Lv.${previewLevel}`,
      tone: 'up',
    })
  }
  if (activeId === 33) {
    const fieldsBefore = maxFields(planet.buildings, false)
    const buildingsAfter = { ...planet.buildings, [33]: previewLevel }
    effectRows.push({
      icon: 'planet',
      label: 'build.statPlanetSpace',
      en: 'PLANET FIELDS',
      before: fmtFull(fieldsBefore),
      after: fmtFull(maxFields(buildingsAfter, false)),
      delta: `+${fmtFull(maxFields(buildingsAfter, false) - fieldsBefore)}`,
      tone: 'up',
    })
  }
  if (activeId === 41) {
    const fieldsBefore = maxFields(planet.buildings, true)
    const buildingsAfter = { ...planet.buildings, [41]: previewLevel }
    effectRows.push({
      icon: 'moon',
      label: 'build.statMoonSpace',
      en: 'MOON FIELDS',
      before: fmtFull(fieldsBefore),
      after: fmtFull(maxFields(buildingsAfter, true)),
      delta: `+${fmtFull(maxFields(buildingsAfter, true) - fieldsBefore)}`,
      tone: 'up',
    })
  }
  if (activeId === 42) {
    const lv = planet.buildings[42] ?? 0
    effectRows.push({
      icon: 'radar',
      label: 'build.statScanCoverage',
      en: 'PHALANX RANGE',
      before: t('build.scanSystems', { n: lv * lv - 1 }),
      after: t('build.scanSystems', { n: previewLevel * previewLevel - 1 }),
      delta: `+${previewLevel * previewLevel - lv * lv}`,
      tone: 'up',
    })
  }
  if (activeId === 44) {
    effectRows.push({
      icon: 'missile',
      label: 'build.statMissileCap',
      en: 'SILO CAPACITY',
      before: t('build.missileSlot', { n: siloCapacity(planet.buildings[44] ?? 0) }),
      after: t('build.missileSlot', { n: siloCapacity(previewLevel) }),
      delta: `+${siloCapacity(previewLevel) - siloCapacity(planet.buildings[44] ?? 0)}`,
      tone: 'up',
    })
  }

  const fields = usedFields(planet.buildings, planet.defenses)
  const fieldCap = maxFields(planet.buildings, !!planet.isMoon)
  const note = t(BUILDING_NOTES[activeId] ?? 'build.noteDefault')

  // 禁用原因必须精确：前置不满足 ≠ 资源不足。点名缺哪种资源，玩家才知道去补什么。
  // 槽满不再是禁用原因——转入等待预约（批次③）。
  const missingResources = (['metal', 'crystal', 'deuterium'] as const)
    .filter((key) => planet.resources[key] < selectedCost[key])
  const queueFull = planet.buildingQueue.length >= BUILD_SLOTS
  const buildLabel = selectedMaxed
    ? t('build.maxLevel')
    : !selectedReqOk
      ? t('build.prereqBlocked')
      : missingResources.length > 0
        ? `${missingResources.map((r) => t(`build.${r}Short`)).join(listSep())}`
        : queueFull
          ? t('build.queueFull')
          : `${t('build.startLv')} Lv.${selectedLevel + 1}`

  return (
    <div className="nova-page nova-construction-page">
      <h2 className="page-title hud-rule">{t('build.title')}</h2>
      {(orePct('metal') < 0.1 || orePct('crystal') < 0.1 || orePct('deuterium') < 0.1) && (
        <div className="alert-bad" role="alert">
          <span className="font-semibold">
            <NovaIcon name="metal" /> {t('build.oreLow')}
          </span>
          <span className="ml-2 text-warn">
            {(['metal', 'crystal', 'deuterium'] as const)
              .filter((r) => orePct(r) < 0.1)
    .map((r) => `${r === 'metal' ? t('common.metal') : r === 'crystal' ? t('common.crystal') : t('common.deuterium')} ${(orePct(r) * 100).toFixed(0)}%`)
              .join(' · ')}
            {t('build.oreDecayHint')}
          </span>
        </div>
      )}
      {energy.factor < 0.995 && !planet.isMoon && (
        <div className="alert-bad" role="alert">
          <span className="font-semibold">
            <NovaIcon name="energy" /> {t('build.powerShortHead')} <span className="num">{(energy.factor * 100).toFixed(0)}%</span>
          </span>
          <span className="ml-2 text-warn">
            {t('build.powerFixHead')}<span className="num">{energy.solarLevelNeeded || (planet.buildings[4] ?? 0) + 1}</span> {t('build.powerFixTail')}
          </span>
        </div>
      )}
      {msg && (
        <div className="alert-bad" role="alert">
          {msg}
        </div>
      )}

      <section className="nova-construction-stage panel panel-hud" aria-label={t('build.ariaWorkspace')}>
        <header className="nova-workspace-title">
          <h2>{t('build.title')}</h2>
          <b>CONSTRUCTION</b>
          <span>{t('build.subtitle')}</span>
          <small>BUILD A STRONGER TOMORROW ON OUR PLANETS.</small>
        </header>

        {/* 左列：建筑分类 + 建设队列 */}
        <div className="nova-construction-side">
          <section className="nova-workspace-panel nova-construction-cats" aria-label={t('build.ariaCats')}>
            <div className="nova-workspace-panel__title"><NovaIcon name="building" /><b>{t('build.categories')}</b><small>BUILDING CATEGORIES</small></div>
            <div className="nova-construction-cats__list">
              {categories.filter((c) => c.ids.length > 0).map((c) => (
                <button key={c.id} type="button" data-active={activeCategory.id === c.id || undefined} onClick={() => setCategoryId(c.id)}>
                  <span><NovaIcon name={c.icon} /></span>
                  <span>{t(c.nameKey)}<small>{c.en}</small></span>
                  <em>{c.ids.length}</em>
                </button>
              ))}
            </div>
            <div className="nova-construction-cats__items">
              {activeCategory.ids.map((id) => {
                const queued = planet.buildingQueue.some((q) => q.objectId === id)
                return (
                  <button key={id} type="button" data-active={activeId === id || undefined} onClick={() => setSelectedId(id)}>
                    <span className="nova-atlas-thumb" style={buildingAtlasStyle(id)} aria-hidden="true" />
                    <b>{translateTerm(id, 'buildings')}</b>
                    <small>Lv.{planet.buildings[id] ?? 0}{queued ? ` · ${t('build.building')}` : ''}</small>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="nova-workspace-panel nova-construction-queue" aria-label={t('build.ariaQueue')}>
            <div className="nova-workspace-panel__title">
              <NovaIcon name="building" /><b>{t('build.queue')}</b><small>BUILD QUEUE</small>
              <span data-running={planet.buildingQueue.length > 0 || undefined}>
                {planet.buildingQueue.length ? t('build.queueRunning') : t('build.queueIdle')}
              </span>
            </div>
            <div className="nova-construction-queue__list">
              {Array.from({ length: BUILD_SLOTS }, (_, slot) => {
                const q = planet.buildingQueue[slot]
                if (!q) {
                  return (
                    <div key={slot} className="nova-construction-queue__item" data-empty>
                      <strong>{slot + 1}</strong>
                      <span><b>{t('build.idleSlot')}</b><small>IDLE SLOT / {planet.buildingQueue.length}/{BUILD_SLOTS}</small></span>
                    </div>
                  )
                }
                const def = BUILDINGS[q.objectId]
                // 进度基准直接用 startAt→finishAt 的真实时长（含指挥官加速），避免显示与结算两套口径
                const total = Math.max(1, q.finishAt - q.startAt)
                const paused = q.pausedRemaining !== undefined
                const remainingMs = paused ? (q.pausedRemaining ?? 0) : Math.max(0, q.finishAt - now)
                const pct = Math.min(100, Math.max(2, (1 - remainingMs / total) * 100))
                const cost = buildingCost(def, q.level - 1)
                const qIndex = planet.buildingQueue.indexOf(q)
                return (
                  <div key={slot} className="nova-construction-queue__item" data-paused={paused || undefined}>
                    <span className="nova-construction-queue__thumb nova-atlas-thumb" style={buildingAtlasStyle(q.objectId)} aria-hidden="true" />
                    <div className="nova-construction-queue__main">
                      <b>{translateTerm(q.objectId, 'buildings')} Lv.{q.level}</b>
                      <small>{t('build.slot')} {qIndex + 1}/{BUILD_SLOTS} · {paused ? t('build.paused') : `${t('overview.remaining')} ${formatDuration(remainingMs / 1000)}`}</small>
                      <i><u style={{ width: `${pct}%` }} /></i>
                      <div className="nova-construction-queue__cost">
                        <span data-short={planet.resources.metal < cost.metal || undefined}><NovaIcon name="metal" />{fmtFull(cost.metal)}</span>
                        <span data-short={planet.resources.crystal < cost.crystal || undefined}><NovaIcon name="crystal" />{fmtFull(cost.crystal)}</span>
                        <span data-short={planet.resources.deuterium < cost.deuterium || undefined}><NovaIcon name="fuel" />{fmtFull(cost.deuterium)}</span>
                      </div>
                    </div>
                    <div className="nova-construction-queue__pct num">{Math.floor(pct)}%</div>
                    <div className="nova-construction-queue__actions">
                      <button type="button" onClick={() => togglePauseBuildingQueue(planetId, qIndex)}>{paused ? t('build.resume') : t('build.pause')}</button>
                      <button type="button" data-danger onClick={() => cancelBuildingQueue(planetId, qIndex)}>{t('build.cancel')}</button>
                      <button type="button" disabled={qIndex === 0} onClick={() => moveBuildingQueue(planetId, qIndex, -1)}>{t('build.moveUp')}</button>
                      <button type="button" disabled={qIndex === planet.buildingQueue.length - 1} onClick={() => moveBuildingQueue(planetId, qIndex, 1)}>{t('build.moveDown')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* 中列：行星场景 + 施工预览 */}
        <div className="nova-construction-stage__scene" aria-label={t('build.ariaScene')}>
          <div className="nova-city-grid" />
          <div className="nova-city-label"><span className="font-semibold">{translatePlanetName(planet.name)}</span><span className="mono">2.5D COLONY SURFACE / ONLINE</span></div>
          <div className="nova-building-hotspots">
            {order.map((id, index) => {
              const qTop = planet.buildingQueue.find((q) => q.objectId === id)
              return (
                <button key={id} type="button" data-active={activeId === id || undefined} onClick={() => setSelectedId(id)} style={{ '--hotspot-index': index } as CSSProperties}>
                  <span className="nova-hotspot-asset nova-atlas-thumb" style={buildingAtlasStyle(id)}>
                    <em>Lv.{planet.buildings[id] ?? 0}{qTop ? ` → ${qTop.level}` : ''}</em>
                  </span>
                  <b>{translateTerm(id, 'buildings')}</b>
                </button>
              )
            })}
          </div>
        </div>

        <section className="nova-workspace-panel nova-construction-preview" aria-label={t('build.ariaPreview')}>
          <div className="nova-workspace-panel__title"><NovaIcon name="building" /><b>{t('build.preview')}</b><small>CONSTRUCTION PREVIEW</small></div>
          {effectRows.length > 0 ? (
            <div className="nova-construction-compare">
              <div>
                <small>{t('build.before')} <b>BEFORE (Lv.{curLevel})</b></small>
                <span className="nova-construction-compare__thumb nova-atlas-thumb" style={buildingAtlasStyle(activeId)} aria-hidden="true" />
                {effectRows.map((row) => (
                  <div key={`b-${row.label}`}><span>{t(row.label)}<small>{row.en}</small></span><strong>{row.before}</strong></div>
                ))}
              </div>
              <span aria-hidden="true">⟩⟩⟩</span>
              <div data-after>
                <small>{t('build.after')} <b>AFTER (Lv.{previewLevel})</b></small>
                <span className="nova-construction-compare__thumb nova-atlas-thumb" style={buildingAtlasStyle(activeId)} aria-hidden="true" />
                {effectRows.map((row) => (
                  <div key={`a-${row.label}`}>
                    <span>{t(row.label)}<small>{row.en}</small></span>
                    <strong>{row.after}{row.delta && <em data-down={row.tone === 'down' || undefined}>{row.delta}</em>}</strong>
                    {row.orePct !== undefined && (
                      <i className="nova-ore-bar" data-low={row.orePct < 0.05 || undefined} role="img"
                        aria-label={t('build.oreRemainAria', { label: t(row.label), pct: (row.orePct * 100).toFixed(0) })}>
                        <u style={{ width: `${Math.max(2, row.orePct * 100)}%` }} />
                        <small>{(row.orePct * 100).toFixed(0)}%</small>
                      </i>
                    )}                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="nova-construction-compare">
              <div>
                <small>{t('build.before')} <b>BEFORE (Lv.{curLevel})</b></small>
                <span className="nova-construction-compare__thumb nova-atlas-thumb" style={buildingAtlasStyle(activeId)} aria-hidden="true" />
                <p>{note}</p>
              </div>
              <span aria-hidden="true">⟩⟩⟩</span>
              <div data-after>
                <small>{t('build.after')} <b>AFTER (Lv.{previewLevel})</b></small>
                <span className="nova-construction-compare__thumb nova-atlas-thumb" style={buildingAtlasStyle(activeId)} aria-hidden="true" />
                <p>{selectedMaxed ? t('build.maxedNote') : t('build.upgradeGainNote', { n: previewLevel })}</p>
              </div>
            </div>
          )}
          {effectRows.length > 0 && (
            <p className="nova-construction-preview__note"><NovaIcon name="check" /> {note}</p>
          )}
        </section>

        {/* 右列：选中建筑 */}
        <aside className="nova-workspace-panel nova-construction-stage__selected" aria-label={t('build.ariaSelected')}>
          <div className="nova-workspace-panel__title">
            <NovaIcon name="focus" /><b>{t('build.selected')}</b><small>SELECTED BUILDING</small>
            <button type="button" onClick={() => setDetail({ kind: 'building', id: activeId })}>{t('build.detail')}</button>
          </div>
          <div className="nova-construction-hero">
            <span className="nova-atlas-thumb" style={buildingAtlasStyle(activeId)} aria-hidden="true" />
            <div>
              <b>{translateTerm(activeId, 'buildings')}</b>
              <small>LEVEL {curLevel} / STRUCTURE ONLINE</small>
              <p>“{note}”</p>
            </div>
          </div>
          <div className="nova-construction-meta">
            <div><span>{t('build.level')} <small>LEVEL</small></span><b>Lv.{selectedLevel} <em>→</em> <i>{selectedMaxed ? 'MAX' : `Lv.${selectedLevel + 1}`}</i></b></div>
            <div><span>{t('build.buildTime')} <small>BUILD TIME</small></span><b className="num">{selectedMaxed ? '—' : formatDuration(selectedTime)}</b></div>
            <div><span>{t(planet.isMoon ? 'build.statMoonSpace' : 'build.statPlanetSpace')} <small>FIELDS</small></span><b className={fields >= fieldCap ? 'text-bad' : fields >= fieldCap * 0.8 ? 'text-warn' : ''}><span className="num">{fields}</span>/{fieldCap}</b></div>
          </div>
          <div className="nova-construction-block">
            <b>{t('build.prodEffect')} <small>PRODUCTION EFFECT</small></b>
            {effectRows.length > 0 ? effectRows.map((row) => (
              <div key={row.label}>
                <span><NovaIcon name={row.icon} />{t(row.label)}<small>{row.en}</small></span>
                <em data-down={row.tone === 'down' || undefined}>{row.delta ?? row.after ?? row.before}</em>
              </div>
            )) : <div><span><NovaIcon name="check" />{t('build.noDirectOutput')}</span><em>{t('build.structural')}</em></div>}
          </div>
          <div className="nova-construction-block">
            <b>{t('build.prereq')} <small>PREREQUISITES</small></b>
            {Object.keys(selectedDef.requires).length === 0 && <div><span><NovaIcon name="check" />{t('build.noPrereq')}</span><em data-ready>{t('build.met')}</em></div>}
            {Object.entries(selectedDef.requires).map(([rid, required]) => {
              const ok = (levels[+rid] ?? 0) >= required
              const name = findTerm(+rid) ?? `#${rid}`
              return (
                <div key={rid}>
                  <span><NovaIcon name={ok ? 'check' : 'lock'} />{name} Lv.{required}</span>
                  <em data-ready={ok || undefined} data-unmet={!ok || undefined}>{ok ? t('build.met') : t('build.unmet')}</em>
                </div>
              )
            })}
          </div>
          <div className="nova-construction-cost">
            <b>{t('build.materials')} <small>MATERIALS REQUIRED (LOCAL)</small></b>
            <div>
              <span data-short={planet.resources.metal < selectedCost.metal || undefined}><NovaIcon name="metal" />{t('common.metal')}<em>{fmtFull(selectedCost.metal)}</em></span>
              <span data-short={planet.resources.crystal < selectedCost.crystal || undefined}><NovaIcon name="crystal" />{t('common.crystal')}<em>{fmtFull(selectedCost.crystal)}</em></span>
              <span data-short={planet.resources.deuterium < selectedCost.deuterium || undefined}><NovaIcon name="fuel" />{t('common.deuterium')}<em>{fmtFull(selectedCost.deuterium)}</em></span>
              <span><NovaIcon name="energy" />{t('build.buildTimeLabel')}<em>{selectedMaxed ? '—' : formatDuration(selectedTime)}</em></span>
            </div>
          </div>
          {!selectedReqOk && (
            <p className="nova-requirement-warning">
              {t('build.prereqMissing')}{Object.entries(selectedDef.requires).map(([rid, lv]) => `${findTerm(+rid) ?? `#${rid}`} Lv.${lv}`).join(' · ')}
            </p>
          )}
          <button
            type="button"
            className="nova-construction-action"
            data-testid={`upgrade-${activeId}`}
            disabled={selectedMaxed || !selectedReqOk || !selectedAffordable || queueFull}
            onClick={() => setMsg(upgradeBuilding(planetId, activeId))}
          >
            <NovaIcon name="building" />
            {buildLabel}
            <small>
              {selectedMaxed
                ? 'FULLY UPGRADED'
                : !selectedReqOk || missingResources.length > 0
                  ? 'BLOCKED'
                  : queueFull
                    ? 'QUEUE FULL'
                    : 'START BUILD'}
            </small>
          </button>
        </aside>
      </section>
      {detail && <DetailDialog kind={detail.kind} id={detail.id} planetId={planetId} onClose={() => setDetail(null)} />}
    </div>
  )
}
