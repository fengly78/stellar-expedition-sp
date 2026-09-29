import { useState } from 'react'
import BattleSimulator from '../components/BattleSimulator'
import { sfx } from '../game/audio'
import { useLocale } from '../game/i18n'
import {
  buildDefense,
  buildStructure,
  dispatchFleet,
  getReports,
  getState,
  health,
  register,
  researchTech,
  type BattleReport,
  type ServerState,
} from '../game/serverApi'

interface Props {
  onBack: () => void
  onOpenGm?: () => void
}

const CONN_KEY = 'server-conn-v1'

type Phase = 'idle' | 'error' | 'online'

// 机制标识目录（与 dev_seed 规则集族一致；非 Balance 常数）
const ECONOMY_BUILDINGS = ['METAL_MINE', 'CRYSTAL_MINE', 'DEUT_SYNTH', 'SOLAR', 'ROBOTICS', 'SHIPYARD', 'LAB'] as const
const TECH_LIST = ['ENERGY', 'COMBUSTION', 'IMPULSE', 'COMPUTER', 'ASTRO', 'ESPIONAGE', 'WEAPONS', 'SHIELD', 'ARMOUR'] as const
const DEFENSE_CATALOG = [
  { id: 'ROCKET', label: '火箭炮', amount: 5 },
  { id: 'LIGHT_LASER', label: '轻型激光', amount: 5 },
  { id: 'HEAVY_LASER', label: '重型激光', amount: 2 },
  { id: 'GAUSS', label: '高斯炮', amount: 1 },
  { id: 'ION', label: '离子炮', amount: 2 },
  { id: 'PLASMA', label: '等离子', amount: 1 },
  { id: 'SMALL_DOME', label: '小穹顶', amount: 1 },
  { id: 'LARGE_DOME', label: '大穹顶', amount: 1 },
] as const
const SHIP_CATALOG = [
  { id: 'LIGHT', label: '轻型战斗机' },
  { id: 'HEAVY', label: '重型战斗机' },
  { id: 'SMALL_CARGO', label: '小型运输船' },
  { id: 'COLONY', label: '殖民船' },
  { id: 'SCOUT', label: '间谍探测器' },
] as const

/**
 * 服务器模式（W1 深化）：经典玩法环全覆盖——
 * 建造经济建筑 → 研究九系科技 → 造八种防御 → 造五种舰 → 四类舰队任务 → 战报查看。
 * 独立于本地单机存档——双轨并存，不改动本地玩法。
 */
export default function ServerScreen({ onBack, onOpenGm }: Props) {
  const { t } = useLocale()
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(CONN_KEY) ?? '{}') as { baseUrl?: string; ownerId?: number; token?: string }
    } catch {
      return {}
    }
  })()
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl ?? 'http://127.0.0.1:8099')
  const [ownerId, setOwnerId] = useState(String(saved.ownerId ?? 1))
  const [token, setToken] = useState(saved.token ?? '')
  const [target, setTarget] = useState('1:1:2')
  const [regName, setRegName] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<ServerState | null>(null)
  const [reports, setReports] = useState<BattleReport[] | null>(null)
  const [busy, setBusy] = useState(false)

  function saveConn(next?: { ownerId?: number; token?: string }) {
    localStorage.setItem(CONN_KEY, JSON.stringify({
      baseUrl,
      ownerId: next?.ownerId ?? Number(ownerId),
      token: next?.token ?? token,
    }))
  }

  /** G1 自助注册：开档 + 令牌自动落位，随后直接连接。 */
  async function doRegister() {
    await act('注册', async () => {
      const name = regName.trim()
      if (!name) throw new Error('请先输入指挥官代号（1-32 字符）')
      const r = await register(baseUrl, name)
      setOwnerId(String(r.owner_id))
      setToken(r.token)
      saveConn({ ownerId: r.owner_id, token: r.token })
      const st = await getState(baseUrl, r.owner_id, r.token)
      setState(st)
      setReports(null)
      setPhase('online')
      return `欢迎，${r.name}！母星 ${r.coords}（${r.temp}℃）· 令牌已自动保存——请妥善备份（只显示一次）`
    })
  }

  async function refresh(nextMessage?: string) {
    setBusy(true)
    try {
      saveConn()
      const st = await getState(baseUrl, Number(ownerId), token || undefined)
      setState(st)
      let rep: BattleReport[] | null = null
      try {
        rep = (await getReports(baseUrl, Number(ownerId), token || undefined)).battles
      } catch {
        rep = null
      }
      setReports(rep)
      setPhase('online')
      setMessage(nextMessage ?? `已连接 · 规则集 ${st.ruleset_version ?? '（未冻结）'} · ${st.planets.length} 颗行星`)
      sfx('click')
    } catch (e) {
      setPhase('error')
      setMessage(e instanceof Error ? e.message : String(e))
      sfx('error')
    } finally {
      setBusy(false)
    }
  }

  async function ping() {
    setBusy(true)
    const ok = await health(baseUrl)
    setBusy(false)
    setMessage(ok ? 'health OK：服务器可达' : 'health 不通：请确认 game-server 已 artisan serve')
    sfx(ok ? 'click' : 'error')
  }

  async function act(label: string, fn: () => Promise<string>) {
    setBusy(true)
    try {
      setMessage(await fn())
      sfx('complete')
    } catch (e) {
      setMessage(`${label} 失败：${e instanceof Error ? e.message : String(e)}`)
      sfx('error')
    } finally {
      setBusy(false)
    }
  }

  async function refreshNow(): Promise<ServerState> {
    const st = await getState(baseUrl, Number(ownerId), token || undefined)
    setState(st)
    return st
  }

  async function buildOn(planetId: number, building: string) {
    await act(`${building} 建造`, async () => {
      if (!state?.ruleset_version) throw new Error('服务器无冻结规则集——先 game:seed-dev-ruleset')
      const outcomes = await buildStructure(baseUrl, Number(ownerId), state.ruleset_version, planetId, building, token || undefined)
      const parts = outcomes.map((o) =>
        o.kind === 'committed'
          ? 'committed'
          : o.kind === 'rejected'
            ? `留队/拒绝：${o.reason}`
            : `配置闸门：${o.reasons.join('；')}`,
      )
      await refreshNow()
      return `${building}：${parts.join(' → ')}`
    })
  }

  async function research(planetId: number, tech: string) {
    await act(`${tech} 研究`, async () => {
      if (!state?.ruleset_version) throw new Error('服务器无冻结规则集')
      const o = await researchTech(baseUrl, Number(ownerId), state.ruleset_version, planetId, tech, token || undefined)
      if (o.kind === 'committed') {
        await refreshNow()
        return `${tech} 研究已启动（完成前文明锁定，Worker 推进）`
      }
      if (o.kind === 'rejected') return `拒绝：${o.reason}`
      return `配置闸门：${o.reasons.join('；')}`
    })
  }

  async function defense(planetId: number, name: string, amount: number) {
    await act(`${name} ×${amount}`, async () => {
      if (!state?.ruleset_version) throw new Error('服务器无冻结规则集')
      const o = await buildDefense(baseUrl, Number(ownerId), state.ruleset_version, planetId, name, amount, token || undefined)
      await refreshNow()
      if (o.kind === 'committed') return `${name} ×${amount} 订单已受理（Worker 完成后入防御）`
      if (o.kind === 'rejected') return `拒绝：${o.reason}`
      return `配置闸门：${o.reasons.join('；')}`
    })
  }

  async function fleet(planetId: number, mission: 'raid' | 'scout' | 'transport' | 'colonize', ships: Record<string, number>) {
    await act(`${mission} 出击`, async () => {
      if (!state?.ruleset_version) throw new Error('服务器无冻结规则集')
      const o = await dispatchFleet(baseUrl, Number(ownerId), state.ruleset_version, planetId, mission, ships, target, token || undefined)
      await refreshNow()
      if (o.kind === 'committed') {
        const r = o.result as { task_id?: string; duration_seconds?: number }
        return `${mission} 出发：任务 ${r.task_id ?? ''}，航时 ${r.duration_seconds ?? '?'} 秒（Worker 按 arrive_at 推进）`
      }
      if (o.kind === 'rejected') return `拒绝：${o.reason}`
      return `配置闸门：${o.reasons.join('；')}`
    })
  }

  return (
    <div className="nova-entry-screen flex min-h-screen flex-col items-center px-4 py-8">
      <h2 className="page-title text-xl">服务器模式（Beta）</h2>
      <p className="mt-1 text-sm text-ink-2">经典玩法环全覆盖：建造 → 研究 → 防御 → 造舰 → 出击 → 战报（API-01 契约）</p>

      {onOpenGm && (
        <button
          onClick={() => {
            sfx('click')
            onOpenGm()
          }}
          className="btn btn-ghost mt-2 px-2 py-1 text-xs text-ink-3"
        >
          GM 管理后台
        </button>
      )}

      {state?.announcement && (
        <div className="panel mt-4 w-full max-w-md border-edge-hot p-3 text-sm text-accent-2" role="status">
          <span className="mr-1 font-semibold">公告：</span>
          {state.announcement}
        </div>
      )}

      <div className="panel mt-6 w-full max-w-md space-y-3 p-4">
        <label className="block text-xs text-ink-2">
          {t('common.serverAddr')}
          <input
            className="mt-1 w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8099"
          />
        </label>
        <label className="block text-xs text-ink-2">
          Owner ID
          <input
            className="mt-1 w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="block text-xs text-ink-2">
          访问令牌（服务端 game:issue-token 签发）
          <input
            className="mt-1 w-full rounded-md border border-edge bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="粘贴 game:issue-token 输出的令牌"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs text-ink-2">
          {t('common.targetCoord')}
          <input
            className="mt-1 w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="1:1:2"
          />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary min-h-11 flex-1" disabled={busy} onClick={() => refresh()}>
            {t('common.connectFullState')}
          </button>
          <button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => ping()}>
            {t('common.probe')}
          </button>
        </div>
        <div className="border-t border-edge pt-2">
          <label className="block text-xs text-ink-2">
            {t('common.selfRegister')}
            <div className="mt-1 flex gap-2">
              <input
                className="min-h-11 w-full rounded-md border border-edge bg-surface-2 px-3 py-2 text-sm text-ink"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="指挥官代号（1-32 字符）"
                maxLength={32}
              />
              <button className="btn btn-ghost min-h-11 shrink-0 px-4" disabled={busy} onClick={() => doRegister()}>
                {t('common.registerEnter')}
              </button>
            </div>
          </label>
        </div>
        {message && (
          <p className={`text-xs ${phase === 'error' ? 'text-bad' : 'text-ink-2'}`} role="status">
            {message}
          </p>
        )}
      </div>

      {phase === 'online' && state && (
        <div className="mt-4 w-full max-w-md space-y-3">
          <p className="text-xs text-ink-3">生成于 {new Date(state.generated_at).toLocaleString()} · 规则集 {state.ruleset_version ?? '未冻结'}</p>
          {state.civilization && (
            <div className="panel p-3 text-xs">
              <span className="text-ink-2">文明：</span>
              科技 {Object.entries(state.civilization.techs).map(([k, v]) => `${k} Lv.${v}`).join('、') || '无'}
              {' · 任务槽 '}{state.civilization.mission_slots_used}
              {state.civilization.research_active && (
                <span className="text-accent-2"> · 研究进行中：{String(state.civilization.research_active.tech ?? '')}</span>
              )}
            </div>
          )}
          {state.planets.map((p) => (
            <PlanetCard
              key={p.id}
              planet={p}
              techs={state.civilization?.techs ?? {}}
              busy={busy}
              onBuild={(b) => buildOn(p.id, b)}
              onResearch={(techId) => research(p.id, techId)}
              onDefense={(d, n) => defense(p.id, d, n)}
              onShipOrder={(s, n) => act(`${s} 造舰`, async () => {
                if (!state.ruleset_version) throw new Error('服务器无冻结规则集')
                const o = await buildDefense(baseUrl, Number(ownerId), state.ruleset_version, p.id, s, n, token || undefined)
                await refreshNow()
                if (o.kind === 'committed') return `${s} ×${n} 造舰订单已受理（Worker 完成后入港）`
                if (o.kind === 'rejected') return `拒绝：${o.reason}`
                return `配置闸门：${o.reasons.join('；')}`
              })}
              onFleet={(m, ships) => fleet(p.id, m, ships)}
            />
          ))}

          <BattleSimulator
            baseUrl={baseUrl}
            ownerId={Number(ownerId)}
            token={token || undefined}
            attackerPrefill={state.planets[0]?.ships ?? {}}
          />

          <details className="panel p-3 text-xs" open={reports !== null}>
            <summary className="cursor-pointer">战报（{reports?.length ?? '…'}）</summary>
            {reports !== null && reports.length === 0 && <p className="mt-2 text-ink-3">暂无战斗记录。</p>}
            {(reports ?? []).slice(0, 10).map((b) => (
              <div key={b.battle_id} className="mt-2 border-t border-edge pt-2">
                <div className="text-ink-2">{b.battle_id.slice(0, 22)}… · {b.at ? new Date(b.at).toLocaleTimeString() : ''}</div>
                <div className="num text-ink-3">
                  攻损 {Object.entries(b.result?.attacker_losses ?? {}).map(([k, n]) => `${k}×${n}`).join(',') || '0'}
                  {' / 守损 '}{Object.entries(b.result?.defender_losses ?? {}).map(([k, n]) => `${k}×${n}`).join(',') || '0'}
                  {' / 防御损 '}{Object.entries(b.result?.defense_losses ?? {}).map(([k, n]) => `${k}×${n}`).join(',') || '0'}
                </div>
                <div className="num text-ok">
                  掠夺 M {b.result?.loot?.M ?? 0} · C {b.result?.loot?.C ?? 0} · D {b.result?.loot?.D ?? 0}
                  {' / 残骸 M '}{b.result?.debris?.M ?? 0}
                </div>
              </div>
            ))}
          </details>

          <button className="btn btn-ghost min-h-11 w-full" disabled={busy} onClick={() => refresh('已刷新（含战报）')}>
            {t('common.refreshFullState')}
          </button>
        </div>
      )}

      <button className="btn btn-ghost mt-6 w-full max-w-md py-2 text-sm" onClick={() => { sfx('click'); onBack() }}>
        {t('common.returnToMenu')}
      </button>
    </div>
  )
}

/** 单行星操作卡（建造/科技/防御/造舰/舰队）。 */
function PlanetCard(props: {
  planet: ServerState['planets'][number]
  techs: Record<string, number>
  busy: boolean
  onBuild: (building: string) => void
  onResearch: (tech: string) => void
  onDefense: (defense: string, amount: number) => void
  onShipOrder: (ship: string, amount: number) => void
  onFleet: (mission: 'raid' | 'scout' | 'transport' | 'colonize', ships: Record<string, number>) => void
}) {
  const { t } = useLocale()
  const { planet: p, techs, busy } = props
  const lights = p.ships.LIGHT ?? 0
  const cargos = p.ships.SMALL_CARGO ?? 0
  const colonies = p.ships.COLONY ?? 0

  return (
    <div className="panel space-y-2 p-3">
      <div className="flex items-center justify-between">
        <strong className="text-sm">
          {p.coords} · v{p.version}
          {p.temp !== null && <span className="ml-1 text-xs text-ink-3">{p.temp}℃</span>}
        </strong>
        <span className="text-xs text-ink-3">
          {p.is_moon ? '月球' : p.is_homeworld ? '母星' : '殖民星'}
        </span>
      </div>
      <p className="num text-xs">
        金属 {p.inventory.M.toFixed(1)} · 晶体 {p.inventory.C.toFixed(1)} · 重氢 {p.inventory.D.toFixed(1)}
      </p>
      <p className="num text-xs text-ink-2">
        建筑 {Object.keys(p.levels).length ? Object.entries(p.levels).map(([k, v]) => `${k} Lv.${v}`).join('、') : '无'}
      </p>
      <p className="num text-xs text-ink-2">
        舰船 {Object.values(p.ships).some((n) => n > 0) ? Object.entries(p.ships).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join('、') : '无'}
      </p>
      <p className="num text-xs text-ink-2">
        防御 {Object.values(p.defense).some((n) => n > 0) ? Object.entries(p.defense).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join('、') : '无'}
      </p>

      <details className="border-t border-edge pt-2" open>
        <summary className="cursor-pointer text-[10px] text-ink-3">建筑</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          {ECONOMY_BUILDINGS.map((b) => (
            <button key={b} className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy} onClick={() => props.onBuild(b)}>
              {b}
            </button>
          ))}
        </div>
      </details>

      <details className="border-t border-edge pt-2">
        <summary className="cursor-pointer text-[10px] text-ink-3">科技</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          {TECH_LIST.map((techId) => (
            <button key={techId} className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy} onClick={() => props.onResearch(techId)}>
              {techId}（Lv.{techs[techId] ?? 0}）
            </button>
          ))}
        </div>
      </details>

      <details className="border-t border-edge pt-2">
        <summary className="cursor-pointer text-[10px] text-ink-3">防御设施</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          {DEFENSE_CATALOG.map((d) => (
            <button key={d.id} className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy} onClick={() => props.onDefense(d.id, d.amount)}>
              {d.label} ×{d.amount}
            </button>
          ))}
        </div>
      </details>

      <details className="border-t border-edge pt-2">
        <summary className="cursor-pointer text-[10px] text-ink-3">造舰（SHIP_ORDER，Worker 完成入港）</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          {SHIP_CATALOG.map((s) => (
            <button key={s.id} className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy} onClick={() => props.onShipOrder(s.id, 1)}>
              {s.label} ×1
            </button>
          ))}
        </div>
      </details>

      <details className="border-t border-edge pt-2">
        <summary className="cursor-pointer text-[10px] text-ink-3">舰队任务（目标见顶部坐标）</summary>
        <div className="mt-1 flex flex-wrap gap-2">
          <button className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy || lights < 1} onClick={() => props.onFleet('scout', { LIGHT: 1 })}>
            {t('common.reconOnce')}
          </button>
          <button className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy || lights < 1} onClick={() => props.onFleet('raid', { LIGHT: lights })}>
            全军袭击（{lights}）
          </button>
          <button className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy || cargos < 1} onClick={() => props.onFleet('transport', { SMALL_CARGO: cargos })}>
            运输（{cargos} 舱船）
          </button>
          <button className="btn btn-ghost min-h-11 flex-1 text-xs" disabled={busy || colonies < 1} onClick={() => props.onFleet('colonize', { COLONY: colonies })}>
            殖民（{colonies}）
          </button>
        </div>
      </details>
    </div>
  )
}
