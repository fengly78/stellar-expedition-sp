import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CAMPAIGN_STAGES, CAMPAIGN_ELITE_STAGES, type CampaignStage } from '../game/campaign'
import { fmt } from '../game/objects'
import { useGame } from '../game/state'
import Modal from '../components/Modal'
import { sfx } from '../game/audio'
import NovaIcon from '../components/NovaIcon'
import { blueprintAtlasStyle } from '../game/novaAssets'
import { useLocale, listSep, translatePlanetName, translateTerm } from '../game/i18n'

type CampaignMode = 'normal' | 'elite'

const STAGE_POSITIONS: Array<[number, number]> = [
  [16, 23], [37, 39], [59, 23], [81, 39], [81, 72], [59, 57], [37, 72], [16, 57],
]

export default function Campaign({ planetId }: { planetId: number }) {
  const { t, locale } = useLocale()
  const en = locale === 'en'
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const campaignDone = useGame((s) => s.campaignDone)
  const campaignEliteDone = useGame((s) => s.campaignEliteDone)
  const playCampaign = useGame((s) => s.playCampaign)
  const playCampaignElite = useGame((s) => s.playCampaignElite)
  const [deployStage, setDeployStage] = useState<CampaignStage | null>(null)
  const [mode, setMode] = useState<CampaignMode>('normal')
  const [selectedStageId, setSelectedStageId] = useState(1)
  const [fleet, setFleet] = useState<Record<number, number>>({})
  const [msg, setMsg] = useState<string | null>(null)

  if (!planet) return <div className="nova-page"><div className="empty">{t('campaign.noPlanet')}</div></div>

  // 太阳能卫星是静止发电单元，不参与战役出击（与 DispatchWizard 同口径）
  const ownedShips = Object.entries(planet.ships).filter(([id, count]) => count > 0 && +id !== 212)
  const ownedShipCount = ownedShips.reduce((sum, [, count]) => sum + count, 0)
  const stages = mode === 'normal' ? CAMPAIGN_STAGES : CAMPAIGN_ELITE_STAGES
  const doneList = mode === 'normal' ? campaignDone : campaignEliteDone
  const selected = stages.find((stage) => stage.id === selectedStageId) ?? stages[0]
  const selectedDone = doneList.includes(selected.id)
  const selectedLocked = mode === 'normal' ? selected.id > campaignDone.length + 1 : !campaignDone.includes(selected.id)
  const firstEnemyShipId = +(Object.keys(selected.enemyFleet)[0] ?? 204)
  const progress = Math.round((doneList.length / stages.length) * 100)

  const openDeployment = () => {
    setDeployStage(selected)
    setFleet({})
    setMsg(null)
    sfx('click')
  }

  const submit = () => {
    if (!deployStage) return
    const fn = mode === 'elite' ? playCampaignElite : playCampaign
    const err = fn(planetId, deployStage.id, fleet)
    setMsg(err)
    if (!err) {
      setDeployStage(null)
      setFleet({})
    }
  }

  return (
    <div className="nova-page nova-campaign-page">
      <section className="nova-campaign-workspace" aria-label={t('campaign.workspaceAria')}>
        <header className="nova-campaign-title">
          <h2>{t('campaign.title')}</h2><b>CAMPAIGN COMMAND</b>
          <span>{t('campaign.subtitle')}</span><small>CHOOSE THE FRONT. COMMAND THE OUTCOME.</small>
        </header>

        <aside className="nova-campaign-left">
          <section className="nova-campaign-panel">
            <div className="nova-campaign-panel__title"><NovaIcon name="campaign" /><b>{t('campaign.overview')}<small>CAMPAIGN OVERVIEW</small></b><em>{ownedShipCount ? t('campaign.ready') : t('campaign.muster')}</em></div>
            <div className="nova-campaign-metrics">
              <div><NovaIcon name="campaign" /><span>{t('campaign.normalProgress')}<small>NORMAL PROGRESS</small></span><b>{campaignDone.length}/8</b></div>
              <div><NovaIcon name="alert" /><span>{t('campaign.eliteProgress')}<small>ELITE PROGRESS</small></span><b>{campaignEliteDone.length}/8</b></div>
              <div><NovaIcon name="ship" /><span>{t('campaign.availableShips')}<small>AVAILABLE SHIPS</small></span><b>{fmt(ownedShipCount)}</b></div>
              <div><NovaIcon name="reports" /><span>{t('campaign.theaterArchive')}<small>THEATER ARCHIVE</small></span><b>{campaignDone.length + campaignEliteDone.length}</b></div>
            </div>
            <div className="nova-campaign-progress"><span>{t('campaign.theaterCompletion')}<small>THEATER COMPLETION</small></span><b>{progress}%</b><i><u style={{ width: `${progress}%` }} /></i></div>
          </section>

          <section className="nova-campaign-panel nova-campaign-theater">
            <div className="nova-campaign-panel__title"><NovaIcon name="galaxy" /><b>{t('campaign.theaterSelect')}<small>THEATER SELECT</small></b></div>
            <div className="nova-campaign-mode-tabs"><button type="button" data-active={mode === 'normal' || undefined} onClick={() => { setMode('normal'); setSelectedStageId(Math.min(campaignDone.length + 1, 8)); sfx('click') }}><NovaIcon name="campaign" /><span>{t('campaign.normalCampaign')}<small>NORMAL CAMPAIGN</small></span><b>{campaignDone.length}/8</b></button><button type="button" data-active={mode === 'elite' || undefined} onClick={() => { setMode('elite'); setSelectedStageId(Math.max(1, Math.min(campaignDone.length, 8))); sfx('click') }}><NovaIcon name="alert" /><span>{t('campaign.eliteCampaign')}<small>ELITE CAMPAIGN</small></span><b>{campaignEliteDone.length}/8</b></button></div>
            <div className="nova-campaign-rules"><b>{t('campaign.engagementRules')}<small>ENGAGEMENT RULES</small></b><p>{mode === 'normal' ? t('campaign.rulesNormal') : t('campaign.rulesElite')}</p><div><NovaIcon name="check" />{t('campaign.instantSettle')}</div><div><NovaIcon name="reports" />{t('campaign.autoReport')}</div><div><NovaIcon name="shield" />{t('campaign.noProgressLoss')}</div></div>
          </section>
        </aside>

        <main className="nova-campaign-map">
          <div className="nova-campaign-map__header"><span>{mode === 'normal' ? t('campaign.theaterNormal') : t('campaign.theaterElite')} · {t('campaign.frontRoute')}<small>CAMPAIGN THEATER MAP</small></span><div><i className="is-done" />{t('campaign.legendDone')}<i className="is-open" />{t('campaign.legendReady')}<i />{t('campaign.legendLocked')}</div></div>
          <div className={`nova-campaign-route-field is-${mode}`}>
            <div className="nova-campaign-route-path" />
            <div className="nova-campaign-command-core"><NovaIcon name={mode === 'elite' ? 'alert' : 'campaign'} /><b>{mode === 'elite' ? 'ELITE' : 'CAMPAIGN'}</b><small>COMMAND LINK</small></div>
            {stages.map((stage, index) => {
              const done = doneList.includes(stage.id)
              const locked = mode === 'normal' ? stage.id > campaignDone.length + 1 : !campaignDone.includes(stage.id)
              const [x, y] = STAGE_POSITIONS[index]
              return <button key={stage.id} type="button" data-active={selected.id === stage.id || undefined} data-done={done || undefined} data-locked={locked || undefined} style={{ '--stage-x': `${x}%`, '--stage-y': `${y}%` } as CSSProperties} onClick={() => { setSelectedStageId(stage.id); sfx('click') }}><span>{done ? <NovaIcon name="check" /> : locked ? <NovaIcon name="lock" /> : String(stage.id).padStart(2, '0')}</span><b>{en ? stage.nameEn : stage.name}</b><small>{done ? 'CLEARED' : locked ? 'LOCKED' : 'READY'}</small></button>
            })}
          </div>
          <div className="nova-campaign-map__footer"><span><NovaIcon name="radar" />{t('campaign.theaterScan')}<small>ACTIVE</small></span><span><NovaIcon name="fleet" />{t('campaign.fleetLink')}<small>{ownedShipCount ? 'READY' : 'EMPTY'}</small></span><span><NovaIcon name="reports" />{t('campaign.reportSync')}<small>ONLINE</small></span><em>{t('campaign.stage')} <b>{selected.id}/8</b></em></div>
        </main>

        <aside className="nova-campaign-right nova-campaign-panel">
          <div className="nova-campaign-panel__title"><NovaIcon name="focus" /><b>{t('campaign.briefing')}<small>MISSION BRIEFING</small></b><em>{selectedDone ? t('campaign.cleared') : selectedLocked ? t('campaign.locked') : t('campaign.ready')}</em></div>
          <div className="nova-campaign-enemy-preview"><span className="nova-atlas-thumb" style={blueprintAtlasStyle(firstEnemyShipId, false)} /></div>
          <div className="nova-campaign-selected-name"><NovaIcon name={selectedLocked ? 'lock' : mode === 'elite' ? 'alert' : 'campaign'} /><span><b>{t('campaign.stageTitle', { stage: t('campaign.stageOf', { n: selected.id }), name: en ? selected.nameEn : selected.name })}</b><small>{mode === 'elite' ? 'ELITE OPERATION' : 'FRONTLINE OPERATION'}</small></span></div>
          <p className="nova-campaign-description">{en ? selected.descEn : selected.desc}</p>
          <div className="nova-campaign-enemy-list"><b>{t('campaign.enemyFormation')}<small>ENEMY FORMATION</small></b>{Object.entries(selected.enemyFleet).map(([id, count]) => <div key={id}><span>{translateTerm(+id, 'ships')}</span><em>× {count}</em></div>)}{Object.entries(selected.enemyDefenses).map(([id, count]) => <div key={id} data-defense><span>{translateTerm(+id, 'defenses')}</span><em>× {count}</em></div>)}</div>
          <div className="nova-campaign-rewards"><b>{t('campaign.firstClear')}<small>FIRST CLEAR REWARD</small></b><div><span><NovaIcon name="metal" />{t('common.metal')}<em>{fmt(selected.reward.metal)}</em></span><span><NovaIcon name="crystal" />{t('common.crystal')}<em>{fmt(selected.reward.crystal)}</em></span><span><NovaIcon name="fuel" />{t('common.deuterium')}<em>{fmt(selected.reward.deuterium)}</em></span></div>{selected.rewardShips && <p>{t('campaign.shipReward', { list: Object.entries(selected.rewardShips).map(([id, count]) => `${translateTerm(+id, 'ships')}×${count}`).join(listSep()) })}</p>}</div>
          <button type="button" className="nova-campaign-deploy" disabled={selectedLocked} onClick={openDeployment}><NovaIcon name={selectedLocked ? 'lock' : 'fleet'} />{selectedDone ? t('campaign.redeploy') : selectedLocked ? t('campaign.missionLocked') : t('campaign.configureDeploy')}<small>{selectedLocked ? 'MISSION LOCKED' : 'CONFIGURE TASK FORCE'}</small></button>
        </aside>

        <footer className="nova-campaign-status"><div><NovaIcon name="base" /><span>{t('campaign.originBase')}<small>ORIGIN BASE</small></span><b>{translatePlanetName(planet.name)}</b></div><div><NovaIcon name="ship" /><span>{t('campaign.availableShips')}<small>AVAILABLE SHIPS</small></span><b>{fmt(ownedShipCount)}</b></div><div><NovaIcon name="campaign" /><span>{t('campaign.nextNormalStage')}<small>NEXT NORMAL STAGE</small></span><b>{campaignDone.length < 8 ? t('campaign.stageOf', { n: campaignDone.length + 1 }) : t('campaign.allDone')}</b></div><div><NovaIcon name="alert" /><span>{t('campaign.theaterThreat')}<small>THEATER THREAT</small></span><b>{mode === 'elite' ? t('campaign.threatExtreme') : t('campaign.threatNormal')}</b></div></footer>
      </section>

      {deployStage && <Modal title={`${mode === 'elite' ? t('campaign.eliteDeploy') : t('campaign.deploy')}${t('common.colon')}${t('campaign.stageTitle', { stage: t('campaign.stageOf', { n: deployStage.id }), name: en ? deployStage.nameEn : deployStage.name })}`} onClose={() => setDeployStage(null)} wide><div className="space-y-3 text-sm">{ownedShips.length === 0 && <div className="empty">{t('campaign.noShipsHint')}</div>}{ownedShips.map(([id, owned]) => <div key={id} className="flex items-center gap-2"><span className="w-28 text-ink">{translateTerm(+id, 'ships')}</span><span className="num w-16 text-xs text-ink-2">{t('campaign.ownedCount', { n: owned })}</span><input type="number" min={0} max={owned} aria-label={t('campaign.dispatchQtyAria', { name: translateTerm(+id, 'ships') })} value={fleet[+id] ?? ''} onChange={(event) => setFleet({ ...fleet, [+id]: Math.min(owned, Math.max(0, Math.floor(+event.target.value || 0))) })} className="field num w-20" /><button onClick={() => setFleet({ ...fleet, [+id]: owned })} className="btn btn-ghost px-2 py-0.5 text-xs">{t('campaign.allQty')}</button></div>)}{msg && <div className="alert-bad" role="alert">{msg}</div>}<button disabled={ownedShips.length === 0} onClick={submit} className="btn btn-primary min-h-11 sm:min-h-0 w-full py-2 font-semibold"><NovaIcon name={mode === 'elite' ? 'alert' : 'campaign'} /> {mode === 'elite' ? t('campaign.eliteStart') : t('campaign.start')}</button></div></Modal>}
    </div>
  )
}
