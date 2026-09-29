import { useEffect, useRef, useState } from 'react'
import { sfx } from '../game/audio'
import { diagnoseEnergy, fmt, planetProductionForPlanet, storageCapacity } from '../game/objects'
import { SLOT_NAMES, useGame } from '../game/state'
import { toast } from '../game/toasts'
import Achievements from '../pages/Achievements'
import Buildings from '../pages/Buildings'
import Campaign from '../pages/Campaign'
import Codex from '../pages/Codex'
import Fleet from '../pages/Fleet'
import Galaxy from '../pages/Galaxy'
import Highscore from '../pages/Highscore'
import Officers from '../pages/Officers'
import Overview from '../pages/Overview'
import Reports from '../pages/Reports'
import Research from '../pages/Research'
import Shipyard from '../pages/Shipyard'
import MerchantModal from './MerchantModal'
import NovaIcon, { type NovaIconName } from './NovaIcon'
import { TUTORIAL_STEPS } from '../game/tutorial'
import { translatePlanetName, useLocale } from '../game/i18n'

// 12 个页签按职能分组：桌面侧栏分组渲染，移动端底栏用分隔线分组
const TAB_GROUPS = [
  {
    label: 'nav.combat',
    tabs: [
    { key: 'overview', label: 'nav.base', icon: 'base' as NovaIconName },
    { key: 'buildings', label: 'nav.buildings', icon: 'building' as NovaIconName },
    { key: 'shipyard', label: 'nav.shipyard', icon: 'defense' as NovaIconName },
    { key: 'research', label: 'nav.research', icon: 'research' as NovaIconName },
    ],
  },
  {
    label: 'nav.military',
    tabs: [
    { key: 'galaxy', label: 'nav.galaxy', icon: 'galaxy' as NovaIconName },
    { key: 'campaign', label: 'nav.campaign', icon: 'campaign' as NovaIconName },
    { key: 'fleet', label: 'nav.fleet', icon: 'fleet' as NovaIconName },
    ],
  },
  {
    label: 'nav.archives',
    tabs: [
    { key: 'reports', label: 'nav.reports', icon: 'reports' as NovaIconName },
    { key: 'achievements', label: 'nav.achievements', icon: 'achievement' as NovaIconName },
    { key: 'officers', label: 'nav.officers', icon: 'officer' as NovaIconName },
    { key: 'highscore', label: 'nav.highscore', icon: 'ranking' as NovaIconName },
    { key: 'codex', label: 'nav.codex', icon: 'codex' as NovaIconName },
    ],
  },
] as const

const TABS = [...TAB_GROUPS[0].tabs, ...TAB_GROUPS[1].tabs, ...TAB_GROUPS[2].tabs]

type TabKey = (typeof TABS)[number]['key']

/**
 * 教程全局引导条（P1-①，2026-09-27 体验修复）：
 * 之前"下一目标"卡片只渲染在基地页，玩家跟着「前往」跳到建筑/科研页后引导就消失了。
 * 改为悬浮条常驻所有页面：当前步骤 + 前往 + 跳过，位置在底栏上方、不遮挡内容。
 */
function TutorialBar({ currentTab, onJumpTo }: { currentTab: TabKey; onJumpTo: (tab: TabKey) => void }) {
  const { t, locale } = useLocale()
  const tutorialDone = useGame((s) => s.tutorialDone)
  const tutorialSkipped = useGame((s) => s.tutorialSkipped)
  const skipTutorial = useGame((s) => s.skipTutorial)
  const planet = useGame((s) => s.planets.find((p) => p.id === s.currentPlanet) ?? s.planets[0])
  const techs = useGame((s) => s.techs)
  const officers = useGame((s) => s.officers)
  const activeEvent = useGame((s) => s.activeEvent)
  if (tutorialSkipped) return null
  const step = TUTORIAL_STEPS.find((s) => !tutorialDone.includes(s.id))
  if (!step) return null
  // P1-②：步骤2（保障供能）的提示与电力横幅同源（diagnoseEnergy）——缺电时直接报
  // "需升到 Lv.N"，教程数字与横幅数字永不打架；满产时回落到通用文案。
  const en = locale === 'en'
  let hint = en ? step.hintEn : step.hint
  if (step.id === 2 && planet) {
    const prod = planetProductionForPlanet(planet, techs, { officers, flare: !!activeEvent })
    const diag = diagnoseEnergy(prod.energyOut, prod.energyIn, planet, techs[113] ?? 0)
    if (diag.factor < 0.995 && diag.solarLevelNeeded > 0) {
      hint = t('shell.diagHint', { pct: (diag.factor * 100).toFixed(0) + '%', lv: diag.solarLevelNeeded })
    }
  }
  const target = (step.tab ?? 'buildings') as TabKey
  return (
    <div className="nova-tutorial-bar" role="status" aria-label={t('shell.tutorialNow', { title: en ? step.titleEn : step.title })}>
      <span className="nova-tutorial-bar__title">
        {t('shell.nextGoal')}<b>{en ? step.titleEn : step.title}</b>
        <small>{hint}</small>
      </span>
      <button
        type="button"
        onClick={() => {
          onJumpTo(target)
          sfx('click')
        }}
        data-current={currentTab === target || undefined}
      >
        {t('common.go')}
      </button>
      <button type="button" onClick={skipTutorial} className="nova-tutorial-bar__skip">
        {t('common.skip')}
      </button>
    </div>
  )
}

// 全平台共用一套底部模块导航；低频页面统一收进“更多”抽屉，避免桌面侧栏和移动底栏出现两套语言。
// 底栏顺序对齐 nova-construction 设计稿：基地 → 研究 → 防御 → 舰队 → 报告 → 更多（星系在抽屉）。
const NAV_ORDER: TabKey[] = ['overview', 'research', 'shipyard', 'fleet', 'reports']
const PRIMARY_NAV_KEYS = new Set<TabKey>(NAV_ORDER)

const SPEEDS = [
  { value: 0, label: '⏸' },
  { value: 1, label: '1x' },
  { value: 10, label: '10x' },
  { value: 20, label: '20x' },
] as const

export default function GameScreen({ onExit }: { onExit: () => void }) {
  const { t } = useLocale()
  const [tab, setTab] = useState<TabKey>('overview')
  const [showSave, setShowSave] = useState(false)
  const [showMerchant, setShowMerchant] = useState(false)
  const [showMobileMore, setShowMobileMore] = useState(false)
  const tick = useGame((s) => s.tick)
  const planets = useGame((s) => s.planets)
  const techs = useGame((s) => s.techs)
  const officers = useGame((s) => s.officers)
  const currentPlanet = useGame((s) => s.currentPlanet)
  const selectPlanet = useGame((s) => s.selectPlanet)
  const timeScale = useGame((s) => s.timeScale)
  const setTimeScale = useGame((s) => s.setTimeScale)
  const saveToSlot = useGame((s) => s.saveToSlot)
  const claimDaily = useGame((s) => s.claimDaily)
  const missions = useGame((s) => s.missions)
  const activeEvent = useGame((s) => s.activeEvent)

  useEffect(() => {
    tick()
    claimDaily()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [tick, claimDaily])

  useEffect(() => {
    const before = useGame.getState().planets.reduce(
      (acc, p) => ({ metal: acc.metal + p.resources.metal, crystal: acc.crystal + p.resources.crystal, deuterium: acc.deuterium + p.resources.deuterium }),
      { metal: 0, crystal: 0, deuterium: 0 },
    )
    const timer = setTimeout(() => {
      const after = useGame.getState().planets.reduce(
        (acc, p) => ({ metal: acc.metal + p.resources.metal, crystal: acc.crystal + p.resources.crystal, deuterium: acc.deuterium + p.resources.deuterium }),
        { metal: 0, crystal: 0, deuterium: 0 },
      )
      const dm = Math.floor(after.metal - before.metal)
      const dc = Math.floor(after.crystal - before.crystal)
      const dd = Math.floor(after.deuterium - before.deuterium)
      if (dm + dc + dd > 1000) toast(t('shell.offlineGain', { m: fmt(dm), c: fmt(dc), d: fmt(dd) }), 'success')
    }, 2500)
    return () => clearTimeout(timer)
  }, [])

  const planet = planets.find((p) => p.id === currentPlanet) ?? planets[0]
  const prod = planetProductionForPlanet(planet, techs, { officers, flare: !!activeEvent })
  const rates = { metal: prod?.metal, crystal: prod?.crystal, deuterium: prod?.deuterium }
  // 倍速只加快游戏时钟，不改「每游戏小时」产量；玩家看的是真实时间到账速率，必须乘上 timeScale
  // 才能对倍速按钮给出即时反馈。详见 doc/numbers-audit-2026-09-19.md §倍速感知。
  const paused = timeScale === 0
  const realRate = (k: 'metal' | 'crystal' | 'deuterium') => (rates[k] ?? 0) * timeScale
  const energy = diagnoseEnergy(prod.energyOut, prod.energyIn, planet, techs[113] ?? 0)
  const cmdMul = officers.commander ? 1.1 : 1
  const caps = {
    metal: storageCapacity(planet.buildings[22] ?? 0) * cmdMul,
    crystal: storageCapacity(planet.buildings[23] ?? 0) * cmdMul,
    deuterium: storageCapacity(planet.buildings[24] ?? 0) * cmdMul,
  }
  const fullKeys = (['metal', 'crystal', 'deuterium'] as const).filter(
    (k) => caps[k] > 0 && planet.resources[k] >= caps[k] * 0.999 && prod[k] > 0,
  )
  const alerts = missions.filter((m) => m.npcOwned && m.phase === 'out').length
  const stellarDay = Math.max(1, Math.floor(useGame.getState().gameTime / 86_400_000) + 1)

  function rateTooltip(k: 'metal' | 'crystal' | 'deuterium', icon: string): string {
    if (fullKeys.includes(k)) {
      return t('shell.storageFullTip', { icon, n: fmt(caps[k]) })
    }
    if (paused) return t('shell.pausedTip', { icon })
    return t('shell.rateTip', { icon, rate: fmt(rates[k] ?? 0), scale: timeScale, real: fmt(realRate(k)) })
  }

  // 刚跌进缺电时提示一次，避免每秒刷屏
  const prevPowered = useRef(true)
  useEffect(() => {
    const powered = energy.factor >= 0.995
    if (prevPowered.current && !powered) {
      toast(
        t('shell.energyShortTip', { name: planet.name, pct: (energy.factor * 100).toFixed(0) + '%', lv: energy.solarLevelNeeded || '—' }),
        'warn',
      )
    }
    prevPowered.current = powered
  }, [energy.factor, energy.solarLevelNeeded, planet.name])

  // 切页时内容回到顶部，保证移动端从新页面的标题开始阅读。
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const energyTip = `${t('shell.energyTip', { out: fmt(prod.energyOut), in: fmt(prod.energyIn) })}${energy.factor < 0.995 ? t('shell.energyShortGap', { n: fmt(energy.shortfall) }) : ''}`

  // 参数名刻意用 item 而非 t：外层已解构出 useLocale 的 t，同名会遮蔽翻译函数
  const navButton = (item: (typeof TABS)[number], vertical: boolean) => (
    <button
      key={item.key}
      onClick={() => {
        setTab(item.key)
        sfx('click')
      }}
      data-active={tab === item.key || undefined}
      aria-current={tab === item.key ? 'page' : undefined}
      className={`nav-tab flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        vertical ? 'w-full text-left' : 'flex-col shrink-0 gap-0 px-2 py-1 text-[10px]'
      } ${tab === item.key ? 'bg-accent-3 font-semibold text-white shadow-glow' : 'text-ink-2 hover:bg-surface-3 hover:text-ink active:bg-edge-2'}`}
    >
      <NovaIcon name={item.icon} aria-hidden="true" />
      <span>{t(item.label)}</span>
      {item.key === 'fleet' && alerts > 0 && (
        <span className="ml-auto rounded-full bg-bad px-1.5 text-[10px] text-white num">{alerts}</span>
      )}
    </button>
  )

  return (
    <div className="nova-shell min-h-screen text-ink">
      <div className="flex min-h-screen w-full flex-col">
        <header className="nova-header border-b border-edge bg-surface/60 backdrop-blur-sm">
          <div className="hud-strip" aria-hidden="true" />
          <div className="nova-resource-dock flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
            <div className="nova-brand hidden shrink-0 items-center gap-2 sm:flex">
              <span className="nova-brand__mark" aria-hidden="true"><NovaIcon name="logo" /></span>
              <span><strong>NOVA ORBITALS</strong><small>A HIGHER HUMANITY</small></span>
            </div>
            <span className="text-lg font-bold text-accent-2 sm:hidden">NOVA</span>
            <div className="nova-resource-grid flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {/* 系统状态灯：正常=绿；暂停=黄；缺电=红 */}
              <span
                className={`led shrink-0 ${paused ? 'led-warn' : energy.factor < 0.995 ? 'led-bad' : ''}`}
                role="img"
                aria-label={paused ? t('shell.paused') : energy.factor < 0.995 ? t('shell.powerShort') : t('shell.systemOk')}
                title={paused ? t('shell.paused') : energy.factor < 0.995 ? t('shell.powerShort') : t('shell.systemOk')}
              />
              {([
                { key: 'metal' as const, icon: 'metal' as NovaIconName, color: 'text-metal', name: t('common.metal') },
                { key: 'crystal' as const, icon: 'crystal' as NovaIconName, color: 'text-crystal', name: t('common.crystal') },
                { key: 'deuterium' as const, icon: 'fuel' as NovaIconName, color: 'text-deut', name: t('common.deuterium') },
              ]).map((r) => {
                const full = fullKeys.includes(r.key)
                return (
                  <span
                    key={r.key}
                    className="nova-resource-cell flex items-center gap-1.5 border border-edge/70 bg-surface-2/60 px-2 py-1"
                    tabIndex={0}
                    title={rateTooltip(r.key, r.name)}
                    aria-label={`${r.name} ${fmt(planet.resources[r.key])}${t('common.period')}${rateTooltip(r.key, r.name)}`}
                  >
                    <span aria-hidden="true"><NovaIcon name={r.icon} /></span>
                    <span className="nova-resource-name">{r.name}<small>{r.key === 'deuterium' ? 'FUEL' : r.key.toUpperCase()}</small></span>
                    <span className={`mono nova-resource-value transition-colors ${full ? 'text-bad' : r.color}`}>{fmt(planet.resources[r.key])}</span>
                    {full ? (
                      <span
                        className="chip chip-bad"
                        tabIndex={0}
                        title={t('shell.storageFullTitle', { n: fmt(caps[r.key]) })}
                        aria-label={t('shell.storageFullAria', { n: fmt(caps[r.key]) })}
                      >
                        {t('common.storageFull')}
                      </span>
                    ) : paused ? (
                      <span className="chip">⏸ {t('shell.pause')}</span>
                    ) : (
                      <span className="mono text-[10px] text-ok">
                        +{fmt(realRate(r.key))}{t('overview.hourUnit')}
                        {timeScale !== 1 && <span className="ml-0.5 font-semibold text-accent-2">×{timeScale}</span>}
                      </span>
                    )}
                  </span>
                )
              })}
              <span
                className={`nova-resource-cell flex items-center gap-1.5 border px-2 py-1 text-xs ${
                  energy.factor >= 0.995 ? 'border-edge/70 bg-surface-2/60 text-ok' : 'border-bad/40 bg-bad/15 text-bad'
                }`}
                tabIndex={0}
                title={energyTip}
                aria-label={energyTip}
              >
                <span className={`led ${energy.factor >= 0.995 ? '' : 'led-bad'}`} aria-hidden="true" />
                <span aria-hidden="true"><NovaIcon name="energy" /></span>
                <span className="mono">{fmt(prod.energyOut)}/{fmt(prod.energyIn)}</span>
                {energy.factor < 0.995 && <span className="font-semibold">{t('shell.powerShort')} ×{energy.factor.toFixed(2)}</span>}
              </span>
              {activeEvent && (
                <span className="chip chip-warn" tabIndex={0} title={t('shell.stormChip')} aria-label={t('shell.stormAria')}>
                  <NovaIcon name="storm" /> {t('shell.storm')}
                </span>
              )}
              <button
                onClick={() => {
                  setShowMerchant(true)
                  sfx('click')
                }}
                className="btn btn-ghost px-2 py-1 text-xs"
                title={t('shell.merchant')}
                aria-label={t('shell.merchant')}
              >
                <NovaIcon name="merchant" />
              </button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {alerts > 0 && (
                <button
                  onClick={() => {
                    setTab('fleet')
                    sfx('click')
                  }}
                  className="chip chip-bad"
                  title={t('shell.incoming')}
                >
                  <span className="led led-bad" aria-hidden="true" />{t('shell.incomingShort')} <span className="num">{alerts}</span>
                </button>
              )}
              <div className="flex items-center gap-0.5 rounded-md border border-edge bg-surface-2/80 p-0.5 text-xs" role="group" aria-label={t('nav.timeScale')}>
                {paused && <span className="led led-warn ml-1 shrink-0" aria-hidden="true" />}
                {SPEEDS.map((sp) => (
                  <button
                    key={sp.value}
                    onClick={() => setTimeScale(sp.value)}
                    aria-label={sp.value === 0 ? t('shell.pause') : t('shell.speedPace', { n: sp.value })}
                    aria-pressed={timeScale === sp.value}
                    className={`mono rounded px-1.5 py-0.5 transition-colors ${
                      timeScale === sp.value ? 'bg-accent-3 text-white' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
              <div className="nova-command-status hidden lg:grid" aria-label={t('nav.statusInfo')}>
                <span><small>{t('nav.stellarDay')}</small><b className="mono">{stellarDay.toString().padStart(3, '0')}</b></span>
                <span><small>{t('nav.coord')}</small><b className="mono">{planet.coords.galaxy}:{planet.coords.system}:{planet.coords.position}</b></span>
                <span><NovaIcon name="officer" /><b>{t('nav.commander')}</b></span>
              </div>
            </div>
          </div>
        </header>

        <main className="nova-content w-full flex-1 overflow-y-auto pb-20">
          {tab === 'overview' && <Overview planetId={planet.id} onJumpTo={setTab} />}
          {tab === 'buildings' && <Buildings planetId={planet.id} />}
          {tab === 'shipyard' && <Shipyard planetId={planet.id} defaultFamily="ships" />}
          {tab === 'research' && <Research />}
          {tab === 'galaxy' && <Galaxy planetId={planet.id} />}
          {tab === 'campaign' && <Campaign planetId={planet.id} />}
          {tab === 'fleet' && <Fleet onGoShipyard={() => { setTab('shipyard'); sfx('click') }} />}
          {tab === 'reports' && <Reports />}
          {tab === 'achievements' && <Achievements />}
          {tab === 'officers' && <Officers />}
          {tab === 'highscore' && <Highscore />}
          {tab === 'codex' && <Codex />}
        </main>

        {showMerchant && <MerchantModal planetId={planet.id} onClose={() => setShowMerchant(false)} />}

        {/* 教程全局引导条（P1-①）：目标卡不再只活在基地页——任何页面都能看到当前步骤并一键前往/跳过 */}
        <TutorialBar currentTab={tab} onJumpTo={setTab} />

        <aside className="nova-base-switcher" aria-label={t('nav.baseSwitcher')}>
          <div className="nova-base-switcher__current"><span className="nova-base-orb"><NovaIcon name={planet.isMoon ? 'moon' : 'planet'} /></span><span><b>{translatePlanetName(planet.name)}</b><small>[{planet.coords.galaxy}:{planet.coords.system}:{planet.coords.position}]</small></span></div>
          <div className="nova-base-switcher__list">
            {planets.map((p) => (
              <button key={p.id} type="button" data-active={p.id === planet.id || undefined} onClick={() => { selectPlanet(p.id); sfx('click') }}>
                <span><NovaIcon name={p.isMoon ? 'moon' : 'planet'} /></span><span>{translatePlanetName(p.name)}<small>[{p.coords.galaxy}:{p.coords.system}:{p.coords.position}]</small></span>
              </button>
            ))}
          </div>
        </aside>

        <nav className="nova-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-surface/95 shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md" aria-label={t('nav.pageNav')}>
          <div className="relative mx-auto max-w-[1680px]">
            <div className="mobile-bottom-nav flex items-stretch justify-between gap-1 px-1 py-1 sm:gap-2 sm:px-3 sm:py-2">
              {NAV_ORDER.map((key) => {
                const found = TABS.find((item) => item.key === key)
                return found ? navButton(found, false) : null
              })}
              <button
                type="button"
                onClick={() => setShowMobileMore((open) => !open)}
                aria-expanded={showMobileMore}
                className={`nav-tab flex shrink-0 flex-col items-center gap-0 rounded-md px-2 py-1 text-[10px] transition-colors sm:px-4 sm:text-xs ${showMobileMore ? 'bg-accent-3 font-semibold text-white shadow-glow' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'}`}
              >
                <NovaIcon name="more" aria-hidden="true" />
                <span>{t('nav.more')}</span>
              </button>
            </div>
            {showMobileMore && (
              <div className="mobile-more-panel absolute bottom-[calc(100%+0.5rem)] right-2 left-2 rounded-xl border border-edge p-2 shadow-2xl" role="menu">
                <div className="mb-2 flex items-center justify-between px-2 text-xs text-ink-3">
                  <span>{t('nav.allFeatures')}</span>
                  <span className="mono">{t('nav.entries', { n: TABS.length })}</span>
                </div>
                <div className="mb-2 flex gap-1 border-b border-edge pb-2">
                    <button
                      type="button"
                      onClick={() => setShowSave((open) => !open)}
                      className="btn btn-ghost flex-1 text-xs"
                      aria-expanded={showSave}
                    >
                      <NovaIcon name="save" /> {t('nav.save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        saveToSlot(0, t('nav.autoSave'))
                        onExit()
                      }}
                      className="btn btn-ghost flex-1 text-xs"
                    >
                      {t('common.mainMenu')}
                    </button>
                  </div>
                {showSave && (
                    <div className="mb-2 grid grid-cols-3 gap-1 border-b border-edge pb-2">
                      {[1, 2, 3].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            saveToSlot(slot, SLOT_NAMES[slot].name)
                            setShowSave(false)
                          }}
                          className="rounded-md px-2 py-1.5 text-xs text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink active:bg-edge-2"
                        >
                          {t('nav.saveSlot', { n: slot })}
                        </button>
                      ))}
                    </div>
                )}
                <div className="grid grid-cols-3 gap-1">
                  {TABS.filter((tabItem) => !PRIMARY_NAV_KEYS.has(tabItem.key)).map((tabItem) => (
                    <button
                      key={tabItem.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTab(tabItem.key)
                        setShowMobileMore(false)
                        sfx('click')
                      }}
                      className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-xs transition-colors ${tab === tabItem.key ? 'bg-accent-3 text-white' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'}`}
                    >
                      <NovaIcon name={tabItem.icon} aria-hidden="true" />
                      {/* label 是 i18n 键（nav.buildings 等），必须再过一次 t()——
                          此前这里直接渲染 item.label，界面上显示的是原始键名。
                          参数名用 tabItem：`(t) =>` 会遮蔽 useLocale 解构出的 t。 */}
                      <span>{t(tabItem.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>
    </div>
  )
}
