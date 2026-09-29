import { useCallback, useEffect, useRef, useState } from 'react'
import { TECHS, canResearch, fmt, meetsRequires, researchTime, techCost } from '../game/objects'
import { RESEARCH_SLOTS, useGame } from '../game/state'
import { formatDuration, translateTerm, useLocale } from '../game/i18n'
import DetailDialog from '../components/DetailDialog'
import NovaIcon, { type NovaIconName } from '../components/NovaIcon'

const ORDER = [113, 117, 115, 118, 114, 108, 106, 109, 110, 111, 120, 121]
const CATEGORIES = [
  { id: 'energy', labelKey: 'research.cat.energy', en: 'ENERGY', icon: 'reactor' as NovaIconName, techs: [113, 114] },
  { id: 'propulsion', labelKey: 'research.cat.propulsion', en: 'PROPULSION', icon: 'propulsion' as NovaIconName, techs: [115, 117, 118] },
  { id: 'computing', labelKey: 'research.cat.computing', en: 'COMPUTING', icon: 'computing' as NovaIconName, techs: [108, 106] },
  { id: 'military', labelKey: 'research.cat.military', en: 'MILITARY', icon: 'military' as NovaIconName, techs: [109, 110, 111] },
  { id: 'science', labelKey: 'research.cat.science', en: 'SCIENCE', icon: 'science' as NovaIconName, techs: [120, 121] },
] as const
const TECH_ICONS: NovaIconName[] = ['reactor', 'thermal', 'propulsion', 'computing', 'espionage', 'weapon', 'shield', 'armor', 'laser', 'ion', 'reactor', 'propulsion']

// 科技效果全部来自 objects.ts 的真实公式口径，不做装饰性文案：
// 113 太阳能电站产出与研究速度各 +5%/级（solarOutput / researchTime）；
// 115/117 燃烧/脉冲引擎舰速 +10%/+20% 每级（shipSpeed）；108 舰队槽位与殖民地上限 +1/级
// （fleetSlots / colonyCap）；109/110/111 武器/护盾/装甲 +10%/级（shipSpec）；
// 106 侦察揭示与反侦察等级（espionageReveal）；120/121 无百分比加成，价值在解锁线。
type T = ReturnType<typeof useLocale>['t']
const pct = (per: number, level: number) => `+${Math.round(per * level * 100)}%`
const unlocked = (need: number, level: number, t: T) => (level >= need ? t('research.unlocked') : t('research.notUnlocked'))
function techEffectRows(id: number, level: number, t: T): { label: string; before: string; after: string }[] {
  switch (id) {
    case 113: return [
      { label: t('research.effect.solarOutput'), before: pct(0.05, level), after: pct(0.05, level + 1) },
      { label: t('research.effect.researchSpeed'), before: pct(0.05, level), after: pct(0.05, level + 1) },
    ]
    case 115: return [{ label: t('research.effect.combustionSpeed'), before: pct(0.1, level), after: pct(0.1, level + 1) }]
    case 114: return [
      { label: t('research.effect.hyperTechReq'), before: unlocked(3, level, t), after: unlocked(3, level + 1, t) },
      { label: t('research.effect.hyperShipReq'), before: unlocked(5, level, t), after: unlocked(5, level + 1, t) },
    ]
    case 118: return [{ label: t('research.effect.hyperSpeed'), before: pct(0.3, level), after: pct(0.3, level + 1) }]
    case 117: return [{ label: t('research.effect.impulseSpeed'), before: pct(0.2, level), after: pct(0.2, level + 1) }]
    case 108: return [
      { label: t('research.effect.fleetSlots'), before: `${Math.min(5, 1 + level)}`, after: `${Math.min(5, 2 + level)}` },
      { label: t('research.effect.colonyCap'), before: `${3 + level}`, after: `${4 + level}` },
    ]
    case 109: return [{ label: t('research.effect.weaponPower'), before: pct(0.1, level), after: pct(0.1, level + 1) }]
    case 110: return [{ label: t('research.effect.shieldPower'), before: pct(0.1, level), after: pct(0.1, level + 1) }]
    case 111: return [{ label: t('research.effect.armour'), before: pct(0.1, level), after: pct(0.1, level + 1) }]
    case 106: return [
      { label: t('research.effect.reconDepth'), before: `Lv.${level}`, after: `Lv.${level + 1}` },
      { label: t('research.effect.counterRecon'), before: `Lv.${level}`, after: `Lv.${level + 1}` },
    ]
    case 120: return [
      { label: t('research.effect.lightLaserReq'), before: unlocked(3, level, t), after: unlocked(3, level + 1, t) },
      { label: t('research.effect.heavyLaserReq'), before: unlocked(6, level, t), after: unlocked(6, level + 1, t) },
    ]
    case 121: return [
      { label: t('research.effect.cruiserReq'), before: unlocked(2, level, t), after: unlocked(2, level + 1, t) },
      { label: t('research.effect.ionCannonReq'), before: unlocked(4, level, t), after: unlocked(4, level + 1, t) },
      { label: t('research.effect.bomberReq'), before: unlocked(5, level, t), after: unlocked(5, level + 1, t) },
      { label: t('research.effect.plasmaReq'), before: unlocked(7, level, t), after: unlocked(7, level + 1, t) },
    ]
    default: return []
  }
}

export default function Research() {
  const { t } = useLocale()
  const planets = useGame((s) => s.planets)
  const techs = useGame((s) => s.techs)
  const researchQueue = useGame((s) => s.researchQueue)
  const startResearch = useGame((s) => s.startResearch)
  const cancelResearchQueue = useGame((s) => s.cancelResearchQueue)
  const now = useGame((s) => s.gameTime)
  const [msg, setMsg] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(113)
  const [activeCategory, setActiveCategory] = useState('energy')
  const [detailId, setDetailId] = useState<number | null>(null)

  // G5 对齐设计稿：科技树依赖连线（按 TECHS[].requires 自动生成，窗口变化重算）
  const treeRef = useRef<HTMLDivElement>(null)
  const [wires, setWires] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; ready: boolean }>>([])
  const computeWires = useCallback(() => {
    const field = treeRef.current
    if (!field) return
    const fr = field.getBoundingClientRect()
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; ready: boolean }> = []
    for (const id of ORDER) {
      for (const depId of Object.keys(TECHS[id].requires).map(Number)) {
        if (!ORDER.includes(depId)) continue
        const a = field.querySelector(`[data-node="${depId}"]`)
        const b = field.querySelector(`[data-node="${id}"]`)
        if (!a || !b) continue
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        lines.push({
          x1: ar.left + ar.width / 2 - fr.left, y1: ar.top + ar.height / 2 - fr.top,
          x2: br.left + br.width / 2 - fr.left, y2: br.top + br.height / 2 - fr.top,
          ready: (techs[depId] ?? 0) > 0,
        })
      }
    }
    setWires(lines)
  }, [techs])

  useEffect(() => {
    computeWires()
    window.addEventListener('resize', computeWires)
    return () => window.removeEventListener('resize', computeWires)
  }, [computeWires])

  const home = planets.find((p) => p.isHome)
  if (!home) return <div className="empty">{t('research.noHome')}</div>

  const labLevel = home.buildings[31] ?? 0
  const selected = TECHS[selectedId]
  const level = techs[selectedId] ?? 0
  const cost = techCost(selected, level)
  const time = researchTime(selected, level, labLevel, techs[113] ?? 0)
  const requirements = { ...home.buildings, ...techs }
  const reqOk = meetsRequires(requirements, selected.requires)
  const labOk = canResearch(level, labLevel)
  const affordable = home.resources.metal >= cost.metal && home.resources.crystal >= cost.crystal && home.resources.deuterium >= cost.deuterium
  const maxed = selected.maxLevel > 0 && level >= selected.maxLevel
  const queuedIndex = researchQueue.findIndex((q) => q.objectId === selectedId)
  const effects = techEffectRows(selectedId, level, t)

  const chooseCategory = (id: string, firstTech: number) => {
    setActiveCategory(id)
    setSelectedId(firstTech)
  }

  return (
    <div className="nova-page nova-research-page">
      {msg && <div className="alert-bad nova-workspace-alert" role="alert">{msg}</div>}
      <section className="nova-research-workspace" aria-label={t('research.ariaWorkspace')}>
        <header className="nova-workspace-title">
          <h2>{t('research.title')}</h2><b>RESEARCH WORKSPACE</b>
          <span>{t('research.subtitle')}</span><small>KNOWLEDGE EXPANDS BOUNDARIES. TECHNOLOGY DRIVES TOMORROW.</small>
        </header>

        <aside className="nova-research-categories nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('research.categories')}</b><small>RESEARCH CATEGORIES</small></div>
          <div className="nova-research-category-list">
            {CATEGORIES.map((category) => <button key={category.id} type="button" data-active={activeCategory === category.id || undefined} onClick={() => chooseCategory(category.id, category.techs[0])}><span><NovaIcon name={category.icon} /></span><b>{t(category.labelKey)}<small>{category.en}</small></b><em>{category.techs.filter((id) => (techs[id] ?? 0) > 0).length}/{category.techs.length}</em></button>)}
          </div>
        </aside>

        <aside className="nova-research-queue nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('research.queue')}</b><small>RESEARCH QUEUE · {researchQueue.length}/{RESEARCH_SLOTS}</small></div>
          <p className="px-2 pb-1 text-[10px] leading-4 text-ink-3">{t('research.queueTip')}</p>
          <div className="nova-research-queue-list">
            {Array.from({ length: RESEARCH_SLOTS }, (_, slot) => {
              const queue = researchQueue[slot]
              // 空槽也要渲染一个 0% 的进度槽：有内容的槽位有 <i><u> 占一行高度，
              // 空槽只有两行文字，两者容器高度都是 min-height:4.1rem 但内容行数不同，
              // 导致队列两个窗口视觉高度不一致（2026-09-28 实机发现）。
              if (!queue) return <div className="nova-research-queue-empty" key={slot}><strong>0{slot + 1}</strong><span><b>{t('research.idleThread')}</b><small>AVAILABLE THREAD</small><i><u style={{ width: '0%' }} /></i></span></div>
              const remaining = Math.max(0, (queue.finishAt - now) / 1000)
              const total = researchTime(TECHS[queue.objectId], queue.level - 1, labLevel, techs[113] ?? 0)
              const pct = Math.min(100, Math.max(3, (1 - remaining / total) * 100))
              return <div className="nova-research-queue-item" key={slot}><strong>0{slot + 1}</strong><span><b>{translateTerm(queue.objectId, 'techs')} Lv.{queue.level}</b><small>{t('overview.remaining')} {formatDuration(remaining)}</small><i><u style={{ width: `${pct}%` }} /></i></span><button type="button" onClick={() => cancelResearchQueue(slot)} aria-label={t('build.cancel') + translateTerm(queue.objectId, 'techs')}>×</button></div>
            })}
          </div>
          <div className="nova-lab-status"><span>{t('research.localLab')}<small>LOCAL RESEARCH LAB</small></span><b>{t('research.labLevel')} Lv.{labLevel}</b></div>
        </aside>

        <main className="nova-research-tree nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('research.tree')}</b><small>RESEARCH TREE</small><span>{ORDER.filter((id) => (techs[id] ?? 0) > 0).length}/{ORDER.length} {t('research.unlocked')}</span></div>
          <div className="nova-research-tree__field" ref={treeRef}>
            <svg className="nova-research-wires" aria-hidden="true">
              {wires.map((w, i) => <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className={w.ready ? 'is-ready' : undefined} />)}
            </svg>
            <div className="nova-research-planet" aria-hidden="true"><span>文明核心</span><small>CIVILIZATION CORE</small></div>
            {ORDER.map((id, index) => <button key={id} type="button" data-node={id} className={`nova-tech-node nova-tech-node--${index + 1}`} data-active={selectedId === id || undefined} data-locked={!meetsRequires(requirements, TECHS[id].requires) || undefined} onClick={() => setSelectedId(id)}><span><NovaIcon name={TECH_ICONS[index]} /></span><b>{translateTerm(id, 'techs')}</b><small>LEVEL {techs[id] ?? 0}</small></button>)}
          </div>
        </main>

        <section className="nova-research-preview nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('research.preview')}</b><small>RESEARCH PREVIEW</small></div>
          <div className="nova-research-compare"><div><small>{t('research.currentLevel')}</small><strong>Lv.{level}</strong><b>{translateTerm(selectedId, 'techs')}</b><p>{effects.length ? effects.map((row) => `${row.label} ${row.before}`).join(t('common.semicolon')) : t('research.baseProject')}</p></div><span>{t('common.compareArrow')}</span><div><small>{t('research.nextLevel')}</small><strong>Lv.{level + 1}</strong><b>{translateTerm(selectedId, 'techs')}</b><p>{effects.length ? effects.map((row) => `${row.label} ${row.after}`).join(t('common.semicolon')) : t('research.unlockFollowUp')}</p></div></div>
        </section>

        <aside className="nova-research-selected nova-workspace-panel">
          <div className="nova-workspace-panel__title"><b>{t('research.selected')}</b><small>SELECTED RESEARCH</small><button type="button" onClick={() => setDetailId(selectedId)}>{t('build.detail')}</button></div>
          <div className="nova-selected-tech"><span><NovaIcon name={TECH_ICONS[ORDER.indexOf(selectedId)]} /></span><div><b>{translateTerm(selectedId, 'techs')}</b><small>LEVEL {level} → {level + 1}</small></div></div>
          <div className="nova-research-effect"><b>{t('research.effects')}<small>TECH EFFECTS</small></b>{effects.map((row) => <div key={row.label}><span>{row.label}</span><em>{row.before} → {row.after}</em></div>)}{effects.length === 0 && <div><span>前置研究</span><em>—</em></div>}</div>
          <div className="nova-research-requires"><b>{t('research.prereqTech')}<small>PREREQUISITES</small></b>{Object.entries(selected.requires).length ? Object.entries(selected.requires).map(([id, required]) => <div key={id}><span>{+id === 31 ? t('research.researchLab') : translateTerm(+id, 'techs')}</span><em data-ready={(requirements[+id] ?? 0) >= required || undefined}>Lv.{required}</em></div>) : <div><span>基础研究项目</span><em data-ready>{t('build.met')}</em></div>}</div>
          <div className="nova-research-cost"><b>{t('research.cost')}<small>RESEARCH COST</small></b><div><span data-short={home.resources.metal < cost.metal || undefined}><NovaIcon name="metal" />{t('research.metal')}<em>{fmt(cost.metal)}</em></span><span data-short={home.resources.crystal < cost.crystal || undefined}><NovaIcon name="crystal" />{t('research.crystal')}<em>{fmt(cost.crystal)}</em></span><span data-short={home.resources.deuterium < cost.deuterium || undefined}><NovaIcon name="fuel" />{t('research.fuel')}<em>{fmt(cost.deuterium)}</em></span></div><p>{t('research.eta')} <strong>{formatDuration(time)}</strong></p></div>
          {queuedIndex >= 0 ? <button type="button" className="nova-research-action is-running" onClick={() => cancelResearchQueue(queuedIndex)}>{t('research.cancel')}<small>CANCEL RESEARCH</small></button> : <button type="button" className="nova-research-action" disabled={maxed || !reqOk || !labOk || !affordable || researchQueue.length >= 2} onClick={() => setMsg(startResearch(selectedId))}>{maxed ? t('research.maxed') : t('research.start')}<small>START RESEARCH</small></button>}
          {(!reqOk || !labOk) && <div className="nova-research-lock">{t('research.locked')}</div>}
        </aside>
      </section>
      {detailId !== null && <DetailDialog kind="tech" id={detailId} planetId={home.id} onClose={() => setDetailId(null)} />}
    </div>
  )
}
