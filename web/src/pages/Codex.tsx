import { useState } from 'react'
import { BUILDINGS, DEFENSES, SHIPS, TECHS, fmt } from '../game/objects'
import NovaIcon, { type NovaIconName } from '../components/NovaIcon'
import { blueprintAtlasStyle, buildingAtlasStyle } from '../game/novaAssets'
import { useLocale, findTerm, translate } from '../game/i18n'

type ArchiveCategory = 'building' | 'ship' | 'defense' | 'tech'

const CATEGORY_META: Array<{ id: ArchiveCategory; key: string; en: string; icon: NovaIconName }> = [
  { id: 'building', key: 'codex.category.building', en: 'PLANETARY STRUCTURES', icon: 'building' },
  { id: 'ship', key: 'codex.category.ship', en: 'ORBITAL VESSELS', icon: 'fleet' },
  { id: 'defense', key: 'codex.category.defense', en: 'DEFENSE SYSTEMS', icon: 'defense' },
  { id: 'tech', key: 'codex.category.tech', en: 'RESEARCH ARCHIVE', icon: 'research' },
]

const CATEGORY_COPY: Record<ArchiveCategory, string> = {
  building: 'codex.copy.building',
  ship: 'codex.copy.ship',
  defense: 'codex.copy.defense',
  tech: 'codex.copy.tech',
}

const TECH_ICON: Record<number, NovaIconName> = {
  106: 'espionage', 108: 'computing', 109: 'weapon', 110: 'shield', 111: 'armor',
  113: 'reactor', 115: 'engine', 117: 'propulsion', 120: 'laser', 121: 'ion',
}

const CATEGORY_IDS: Record<ArchiveCategory, number[]> = {
  building: Object.keys(BUILDINGS).map(Number),
  ship: Object.keys(SHIPS).map(Number),
  defense: Object.keys(DEFENSES).map(Number),
  tech: Object.keys(TECHS).map(Number),
}
const ARCHIVE_TOTAL = Object.values(CATEGORY_IDS).reduce((sum, ids) => sum + ids.length, 0)

function reqName(id: number): string {
  return findTerm(id) ?? translate('codex.unknownArchive', { id })
}

function archiveCopy(category: ArchiveCategory): string {
  return translate(CATEGORY_COPY[category])
}

function itemAsset(category: ArchiveCategory, id: number, className: string) {
  if (category === 'building') return <span className={`${className} nova-atlas-thumb`} style={buildingAtlasStyle(id)} aria-hidden="true" />
  if (category === 'ship' || category === 'defense') return <span className={`${className} nova-atlas-thumb`} style={blueprintAtlasStyle(id, category === 'defense')} aria-hidden="true" />
  return <span className={`${className} nova-codex-tech-asset`} aria-hidden="true"><NovaIcon name={TECH_ICON[id] ?? 'research'} /></span>
}

export default function Codex() {
  const { t } = useLocale()
  const [category, setCategory] = useState<ArchiveCategory>('building')
  const [selectedId, setSelectedId] = useState(CATEGORY_IDS.building[0])
  const ids = CATEGORY_IDS[category]
  const safeId = ids.includes(selectedId) ? selectedId : ids[0]
  const selected = category === 'building' ? BUILDINGS[safeId]
    : category === 'ship' ? SHIPS[safeId]
      : category === 'defense' ? DEFENSES[safeId]
        : TECHS[safeId]
  const selectedMeta = CATEGORY_META.find((item) => item.id === category)!

  const chooseCategory = (next: ArchiveCategory) => {
    setCategory(next)
    setSelectedId(CATEGORY_IDS[next][0])
  }

  return (
    <div className="nova-page nova-codex-page">
      <header className="nova-page-head"><h2 className="page-title hud-rule" data-en="NOVA CODEX">{t('codex.pageTitle')}</h2><p className="nova-page-sub">{t('codex.pageSub')}</p></header>
      <section className="nova-codex-workspace" aria-label={t('codex.workspaceAria')}>
        <header className="nova-codex-title">
          <div><h2>{t('codex.title')}</h2><b>NOVA CODEX</b><span>{t('codex.subtitle')}</span><small>EVERY BLUEPRINT. ONE IMPERIAL ARCHIVE.</small></div>
          <div className="nova-codex-title__seal"><NovaIcon name="codex" /><span>ARCHIVE<br />ONLINE</span></div>
        </header>

        <aside className="nova-codex-left nova-archive-panel">
          <div className="nova-archive-panel__title"><NovaIcon name="codex" /><b>{t('codex.archiveIndex')}<small>ARCHIVE INDEX</small></b><em>{ARCHIVE_TOTAL}</em></div>
          <div className="nova-codex-categories">
            {CATEGORY_META.map((item) => <button key={item.id} type="button" data-active={category === item.id || undefined} onClick={() => chooseCategory(item.id)}><NovaIcon name={item.icon} /><span>{t(item.key)}<small>{item.en}</small></span><b>{CATEGORY_IDS[item.id].length}</b></button>)}
          </div>
          <div className="nova-codex-integrity"><b>{t('codex.integrity')}<small>ARCHIVE INTEGRITY</small></b><span><i /></span><em>100%</em></div>
          <div className="nova-codex-legend"><b>{t('codex.legend')}<small>ARCHIVE NOTES</small></b><p>{t('codex.legendCopy')}</p><div><NovaIcon name="check" />{t('codex.verified')}</div><div><NovaIcon name="save" />{t('codex.synced')}</div></div>
        </aside>

        <main className="nova-codex-browser nova-archive-panel">
          <div className="nova-archive-panel__title"><NovaIcon name={selectedMeta.icon} /><b>{t(selectedMeta.key)}<small>{selectedMeta.en}</small></b><em>{ids.length} ITEMS</em></div>
          <div className="nova-codex-grid">
            {ids.map((id) => {
              const def = category === 'building' ? BUILDINGS[id] : category === 'ship' ? SHIPS[id] : category === 'defense' ? DEFENSES[id] : TECHS[id]
              return <button key={id} type="button" data-active={safeId === id || undefined} onClick={() => setSelectedId(id)}>
                {itemAsset(category, id, 'nova-codex-card__asset')}
                <span className="nova-codex-card__code">NOVA / {String(id).padStart(3, '0')}</span>
                <b>{findTerm(id) ?? t('codex.unknownArchive', { id })}</b>
                <small>{category === 'building' ? t('codex.cardCost', { n: BUILDINGS[id].factor }) : category === 'tech' ? t('codex.cardTechCost', { n: TECHS[id].factor }) : t('codex.cardAttack', { n: fmt((category === 'ship' ? SHIPS[id] : DEFENSES[id]).attack) })}</small>
                <em><NovaIcon name="metal" />{fmt(def.cost.metal)} <NovaIcon name="crystal" />{fmt(def.cost.crystal)}</em>
              </button>
            })}
          </div>
        </main>

        <aside className="nova-codex-detail nova-archive-panel">
          <div className="nova-archive-panel__title"><NovaIcon name="focus" /><b>{t('codex.selected')}<small>SELECTED BLUEPRINT</small></b><em>#{safeId}</em></div>
          <div className="nova-codex-detail__asset">{itemAsset(category, safeId, 'nova-codex-detail__visual')}</div>
          <div className="nova-codex-detail__name"><NovaIcon name={selectedMeta.icon} /><span><b>{findTerm(safeId) ?? t('codex.unknownArchive', { id: safeId })}</b><small>{selectedMeta.en} · NOVA-{safeId}</small></span></div>
          <p className="nova-codex-detail__copy">{archiveCopy(category)}</p>
          <div className="nova-codex-detail__stats">
            {category === 'building' && <><div><span>{t('codex.buildFactor')}</span><b>×{BUILDINGS[safeId].factor}</b></div><div><span>{t('codex.maxLevel')}</span><b>{BUILDINGS[safeId].maxLevel || '∞'}</b></div></>}
            {category === 'tech' && <><div><span>{t('codex.techFactor')}</span><b>×{TECHS[safeId].factor}</b></div><div><span>{t('codex.maxLevel')}</span><b>{TECHS[safeId].maxLevel || '∞'}</b></div></>}
            {category === 'ship' && <><div><span>{t('ship.attack')}</span><b>{fmt(SHIPS[safeId].attack)}</b></div><div><span>{t('ship.shield')}</span><b>{fmt(SHIPS[safeId].shield)}</b></div><div><span>{t('ship.hullStat')}</span><b>{fmt(SHIPS[safeId].hull)}</b></div><div><span>{t('ship.speed')}</span><b>{fmt(SHIPS[safeId].speed)}</b></div><div><span>{t('ship.cargo')}</span><b>{fmt(SHIPS[safeId].cargo)}</b></div><div><span>{t('common.deuterium')}</span><b>{fmt(SHIPS[safeId].fuel)}</b></div></>}
            {category === 'defense' && <><div><span>{t('ship.attack')}</span><b>{fmt(DEFENSES[safeId].attack)}</b></div><div><span>{t('ship.shield')}</span><b>{fmt(DEFENSES[safeId].shield)}</b></div><div><span>{t('ship.hullStat')}</span><b>{fmt(DEFENSES[safeId].hull)}</b></div><div><span>{t('codex.buildCap')}</span><b>{DEFENSES[safeId].maxCount || '∞'}</b></div></>}
          </div>
          <div className="nova-codex-detail__cost"><b>{t('codex.baseCost')}<small>BASE COST</small></b><div><span><NovaIcon name="metal" />{t('common.metal')}<em>{fmt(selected.cost.metal)}</em></span><span><NovaIcon name="crystal" />{t('common.crystal')}<em>{fmt(selected.cost.crystal)}</em></span><span><NovaIcon name="fuel" />{t('common.deuterium')}<em>{fmt(selected.cost.deuterium)}</em></span></div></div>
          <div className="nova-codex-detail__requires"><b>{t('codex.requires')}<small>UNLOCK REQUIREMENTS</small></b>{Object.entries(selected.requires).length ? Object.entries(selected.requires).map(([id, level]) => <div key={id}><span>{reqName(+id)}</span><em>Lv.{level}</em></div>) : <p><NovaIcon name="check" /> {t('codex.noRequires')}</p>}</div>
        </aside>

        <footer className="nova-codex-status"><div><NovaIcon name="codex" /><span>{t('codex.nodes')}<small>ARCHIVE NODES</small></span><b>{ARCHIVE_TOTAL} / {ARCHIVE_TOTAL}</b></div><div><NovaIcon name="building" /><span>{t('codex.assetSlices')}<small>ASSET SLICES</small></span><b>37</b></div><div><NovaIcon name="computing" /><span>{t('codex.dataSync')}<small>DATA SYNC</small></span><b>{t('codex.realtime')}</b></div><div><NovaIcon name="shield" /><span>{t('codex.accessLevel')}<small>ACCESS LEVEL</small></span><b>{t('codex.commander')}</b></div></footer>
      </section>
    </div>
  )
}
