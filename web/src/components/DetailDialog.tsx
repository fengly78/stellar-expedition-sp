import { useState } from 'react'
import Modal from './Modal'
import { BUILDINGS, DEFENSES, SHIPS, TECHS, buildingCost, buildingTime, fmt, meetsRequires, researchTime, shipBuildTime, techCost } from '../game/objects'
import { useGame } from '../game/state'
import { blueprintAtlasStyle, buildingAtlasStyle } from '../game/novaAssets'
import { findTerm, formatDuration, listSep, translate, translateTerm } from '../game/i18n'

const DESC_KEY: Record<number, string> = {
  1: 'detail.desc.1',
  2: 'detail.desc.2',
  3: 'detail.desc.3',
  4: 'detail.desc.4',
  14: 'detail.desc.14',
  21: 'detail.desc.21',
  22: 'detail.desc.22',
  23: 'detail.desc.23',
  24: 'detail.desc.24',
  31: 'detail.desc.31',
  33: 'detail.desc.33',
  44: 'detail.desc.44',
  41: 'detail.desc.41',
  42: 'detail.desc.42',
  43: 'detail.desc.43',
  106: 'detail.desc.106',
  108: 'detail.desc.108',
  109: 'detail.desc.109',
  110: 'detail.desc.110',
  111: 'detail.desc.111',
  113: 'detail.desc.113',
  115: 'detail.desc.115',
  117: 'detail.desc.117',
  120: 'detail.desc.120',
  121: 'detail.desc.121',
  202: 'detail.desc.202',
  203: 'detail.desc.203',
  204: 'detail.desc.204',
  205: 'detail.desc.205',
  206: 'detail.desc.206',
  207: 'detail.desc.207',
  208: 'detail.desc.208',
  209: 'detail.desc.209',
  210: 'detail.desc.210',
  211: 'detail.desc.211',
  212: 'detail.desc.212',
  214: 'detail.desc.214',
  401: 'detail.desc.401',
  402: 'detail.desc.402',
  403: 'detail.desc.403',
  404: 'detail.desc.404',
  405: 'detail.desc.405',
  406: 'detail.desc.406',
  407: 'detail.desc.407',
  408: 'detail.desc.408',
  502: 'detail.desc.502',
  503: 'detail.desc.503',
}

export type DetailKind = 'building' | 'ship' | 'defense' | 'tech'

export default function DetailDialog({ kind, id, planetId, onClose }: { kind: DetailKind; id: number; planetId: number; onClose: () => void }) {
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const techs = useGame((s) => s.techs)
  const upgradeBuilding = useGame((s) => s.upgradeBuilding)
  const buildShips = useGame((s) => s.buildShips)
  const startResearch = useGame((s) => s.startResearch)
  const [feedback, setFeedback] = useState<string | null>(null)

  if (!planet) return null

  if (kind === 'building') {
    const def = BUILDINGS[id]
    if (!def) return null
    const level = planet.buildings[id] ?? 0
    const cost = buildingCost(def, level)
    const time = buildingTime(def, level, planet.buildings[14] ?? 0)
    const reqOk = meetsRequires(planet.buildings, def.requires)
    const affordable = planet.resources.metal >= cost.metal && planet.resources.crystal >= cost.crystal && planet.resources.deuterium >= cost.deuterium

    return (
      <Modal title={`${translateTerm(id, 'buildings')} Lv.${level}`} onClose={onClose}>
        <div className="nova-detail-asset nova-detail-asset--building"><span className="nova-atlas-thumb" style={buildingAtlasStyle(id)} aria-hidden="true" /><div><b>{translateTerm(id, 'buildings')}</b><small>PLANETARY STRUCTURE · LEVEL {level}</small></div></div>
        <p className="text-sm text-ink-2">{translate(DESC_KEY[id])}</p>
        <div className="mt-3 space-y-1 text-sm text-ink-2 num">
          <div>{translate('detail.upgradeTo', { n: level + 1 })}{translate('common.colon')}{translate('common.metal')} <span className="text-metal">{fmt(cost.metal)}</span> / {translate('common.crystal')} <span className="text-crystal">{fmt(cost.crystal)}</span>{cost.deuterium > 0 && <> / {translate('common.deuterium')} <span className="text-deut">{fmt(cost.deuterium)}</span></>}</div>
          <div>{translate('detail.timeCost', { time: formatDuration(time) })}</div>
          <div>{Object.keys(def.requires).length > 0 ? translate('detail.prereq', { list: Object.entries(def.requires).map(([rid, lv]) => `${findTerm(+rid) ?? `#${rid}`} Lv.${lv}`).join(listSep()) }) : translate('detail.noPrereq')}</div>
          {feedback && <div className="text-warn" role="status">{feedback}</div>}
        </div>
        <button
          disabled={!reqOk || !affordable || planet.buildingQueue.length >= 3}
          onClick={() => setFeedback(upgradeBuilding(planetId, id))}
          className="btn btn-primary min-h-11 sm:min-h-0 mt-4 w-full"
        >
          {translate('detail.upgrade')}
        </button>
      </Modal>
    )
  }

  if (kind === 'tech') {
    const def = TECHS[id]
    if (!def) return null
    const level = techs[id] ?? 0
    const cost = techCost(def, level)
    const home = planet.isHome ? planet : undefined
    const affordable = !!home && home.resources.metal >= cost.metal && home.resources.crystal >= cost.crystal && home.resources.deuterium >= cost.deuterium

    return (
      <Modal title={`${translateTerm(id, 'buildings')} Lv.${level}`} onClose={onClose}>
        <p className="text-sm text-ink-2">{translate(DESC_KEY[id])}</p>
        <div className="mt-3 space-y-1 text-sm text-ink-2 num">
          <div>{translate('detail.researchLv', { n: level + 1 })}{translate('common.colon')}{translate('common.metal')} <span className="text-metal">{fmt(cost.metal)}</span> / {translate('common.crystal')} <span className="text-crystal">{fmt(cost.crystal)}</span>{cost.deuterium > 0 && <> / {translate('common.deuterium')} <span className="text-deut">{fmt(cost.deuterium)}</span></>}</div>
          <div>{translate('detail.timeCost', { time: formatDuration(researchTime(def, level, planet.buildings[31] ?? 0, techs[113] ?? 0)) })}</div>
          <div>{translate('detail.prereq', { list: Object.entries(def.requires).map(([rid, lv]) => `${findTerm(+rid) ?? `#${rid}`} Lv.${lv}`).join(listSep()) })}</div>
          {feedback && <div className="text-warn" role="status">{feedback}</div>}
        </div>
        <button
          disabled={!affordable}
          onClick={() => setFeedback(startResearch(id))}
          className="btn btn-primary min-h-11 sm:min-h-0 mt-4 w-full"
        >
          {translate('detail.researchBtn')}
        </button>
      </Modal>
    )
  }

  const isDef = kind === 'defense'
  const def = isDef ? DEFENSES[id] : SHIPS[id]
  if (!def) return null
  const owned = isDef ? (planet.defenses[id] ?? 0) : (planet.ships[id] ?? 0)
  const count = 1
  const reqOk = meetsRequires({ ...planet.buildings, ...planet.defenses, ...techs }, def.requires)
  const affordable = planet.resources.metal >= def.cost.metal && planet.resources.crystal >= def.cost.crystal && planet.resources.deuterium >= def.cost.deuterium

  return (
    <Modal title={translate('detail.ownedTitle', { name: translateTerm(id, isDef ? 'defenses' : 'ships'), n: owned })} onClose={onClose}>
      <div className="nova-detail-asset"><span className="nova-atlas-thumb" style={blueprintAtlasStyle(id, isDef)} aria-hidden="true" /><div><b>{translateTerm(id, isDef ? 'defenses' : 'ships')}</b><small>{isDef ? 'PLANETARY DEFENSE' : 'ORBITAL VESSEL'} · OWNED {owned}</small></div></div>
      <p className="text-sm text-ink-2">{translate(DESC_KEY[id])}</p>
      <div className="mt-3 grid grid-cols-2 gap-1 text-sm">
        <div>{translate('ship.attack')}{translate('common.colon')}<span className="num text-bad">{def.attack}</span></div>
        <div>{translate('ship.shield')}{translate('common.colon')}<span className="num text-accent-2">{def.shield}</span></div>
        <div>{translate('detail.armor')}<span className="num text-ink">{fmt(def.hull)}</span></div>
        {'speed' in def && <div>{translate('detail.speed')}<span className="num text-ok">{fmt(def.speed)}</span></div>}
      </div>
      <div className="mt-2 text-sm text-ink-2 num">
        {translate('detail.unitPrice')}{translate('common.metal')} <span className="text-metal">{fmt(def.cost.metal)}</span> / {translate('common.crystal')} <span className="text-crystal">{fmt(def.cost.crystal)}</span>
        {def.cost.deuterium > 0 && <> / {translate('common.deuterium')} <span className="text-deut">{fmt(def.cost.deuterium)}</span></>}
        <span className="ml-2">{translate('detail.buildTime', { time: formatDuration(shipBuildTime(id, planet.buildings[21] ?? 0)) })}</span>
      </div>
      {'rapidfire' in def && Object.keys(def.rapidfire).length > 0 && (
        <div className="mt-1 text-xs text-warn num">
          {translate('detail.rapidfire', { list: Object.entries(def.rapidfire).map(([rid, n]) => `${translateTerm(+rid, 'ships')} ×${n}`).join(listSep()) })}
        </div>
      )}
      {feedback && <div className="mt-2 text-sm text-warn" role="status">{feedback}</div>}
      <button
        disabled={!reqOk || !affordable}
        onClick={() => setFeedback(buildShips(planetId, id, count))}
        className="btn btn-primary min-h-11 sm:min-h-0 mt-4 w-full"
      >
        {isDef ? translate('detail.buildDefense') : translate('detail.buildShip')}
      </button>
    </Modal>
  )
}
