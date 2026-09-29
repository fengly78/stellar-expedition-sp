import { useState } from 'react'
import { fmt } from '../game/objects'
import {
  gmAnnounce,
  gmAudit,
  gmGrant,
  gmListPlayers,
  gmSetBanned,
  gmSetLevel,
  type GmAuditRow,
  type GmPlayerRow,
} from '../game/serverApi'
import { sfx } from '../game/audio'
import { toast } from '../game/toasts'
import { useLocale } from '../game/i18n'

/**
 * G10 GM 管理后台（服务器模式）：凭据为服务端 GM_KEY（env 配置），经 X-GM-Key 头访问。
 * 全部操作走 /api/v1/gm/*（fail-closed），服务端逐条落 game_commands 审计行。
 * 密钥只存本机 sessionStorage（关闭标签页即失效），不落 localStorage。
 */

type GmTab = 'players' | 'announce' | 'audit'

const GM_SESSION_KEY = 'ogame-sp-gm-session'

/** 凭据存 sessionStorage（关闭标签页即失效；同会话内切页不丢）。 */
function loadGmSession(): { baseUrl: string; gmKey: string } {
  try {
    const raw = sessionStorage.getItem(GM_SESSION_KEY)
    if (raw) return JSON.parse(raw) as { baseUrl: string; gmKey: string }
  } catch {
    // ignore
  }
  return { baseUrl: '', gmKey: '' }
}

function saveGmSession(s: { baseUrl: string; gmKey: string }): void {
  try {
    sessionStorage.setItem(GM_SESSION_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

export default function GmScreen({ onBack }: { onBack: () => void }) {
  const { t } = useLocale()
  const savedSession = loadGmSession()
  const [baseUrl, setBaseUrl] = useState(savedSession.baseUrl)
  const [gmKey, setGmKey] = useState(savedSession.gmKey)
  const [loggedIn, setLoggedIn] = useState(savedSession.gmKey !== '')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<GmTab>('players')

  // players
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<GmPlayerRow[]>([])
  const [selected, setSelected] = useState<GmPlayerRow | null>(null)
  const [grantDeltas, setGrantDeltas] = useState({ M: '', C: '', D: '' })
  const [levelInput, setLevelInput] = useState({ planetId: '', building: 'METAL_MINE', level: '' })
  const [banReason, setBanReason] = useState('')

  // announce / audit
  const [announceText, setAnnounceText] = useState('')
  const [audit, setAudit] = useState<GmAuditRow[]>([])

  const guard = async (fn: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'warn')
      sfx('error')
    } finally {
      setBusy(false)
    }
  }

  const refreshPlayers = (q = query) =>
    gmListPlayers(baseUrl, gmKey, q).then(setPlayers)

  const login = () =>
    guard(async () => {
      if (!baseUrl.trim()) {
        toast('请填写服务器地址', 'warn')
        return
      }
      const list = await gmListPlayers(baseUrl, gmKey, '')
      setPlayers(list)
      setLoggedIn(true)
      saveGmSession({ baseUrl, gmKey })
      sfx('complete')
    })

  const act = (fn: () => Promise<unknown>, okMsg: string) =>
    guard(async () => {
      await fn()
      toast(okMsg, 'success')
      sfx('complete')
      setPlayers(await gmListPlayers(baseUrl, gmKey, query))
    })

  const loadAudit = () =>
    guard(async () => {
      setAudit(await gmAudit(baseUrl, gmKey, 100))
    })

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <main className="panel w-full max-w-sm p-6">
          <h2 className="page-title mb-4 text-center">GM 管理后台</h2>
          <div className="space-y-3">
            <label className="block text-sm">
              {t('common.serverAddr')}
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
                aria-label="GM 服务器地址"
                className="field mt-1 w-full"
              />
            </label>
            <label className="block text-sm">
              GM 密钥（服务端 GM_KEY）
              <input
                value={gmKey}
                onChange={(e) => setGmKey(e.target.value)}
                type="password"
                autoComplete="off"
                aria-label="GM 密钥"
                className="field mt-1 w-full"
              />
            </label>
            <button onClick={login} disabled={busy} className="btn btn-primary min-h-11 w-full">
              {busy ? '验证中…' : '进入后台'}
            </button>
            <button onClick={onBack} className="btn btn-ghost w-full py-1.5 text-sm">
              {t('common.backLabel')}
            </button>
            <p className="text-xs leading-5 text-ink-2">
              密钥仅保存在本机 sessionStorage（关闭标签页即失效）。全部操作在服务端留审计行（GM_* 命令）。
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="nova-page space-y-4 p-4">
      <h2 className="page-title hud-rule">GM 管理后台</h2>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['players', '玩家管理'],
          ['announce', '运营公告'],
          ['audit', '操作审计'],
        ] as [GmTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id)
              sfx('click')
              if (id === 'audit') void loadAudit()
            }}
            aria-pressed={tab === id}
            className={`chip cursor-pointer ${tab === id ? 'chip-ok' : ''}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto mono text-xs text-ink-3">{baseUrl}</span>
        <button onClick={onBack} className="btn btn-ghost px-2 py-1 text-xs">
          {t('common.backLabel')}
        </button>
      </div>

      {tab === 'players' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索代号 / owner_id"
                aria-label="搜索玩家"
                className="field w-full text-sm"
              />
              <button onClick={() => void guard(() => refreshPlayers())} className="btn btn-ghost shrink-0 text-sm">
                {t('common.search')}
              </button>
            </div>
            <div className="space-y-1">
              {players.length === 0 && <div className="empty text-xs">没有匹配的玩家</div>}
              {players.map((p) => (
                <button
                  key={p.owner_id}
                  onClick={() => {
                    setSelected(p)
                    sfx('click')
                  }}
                  data-active={selected?.owner_id === p.owner_id || undefined}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${selected?.owner_id === p.owner_id ? 'border-edge-hot bg-surface-3' : 'border-edge bg-surface-2'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="num text-xs text-ink-3">#{p.owner_id}</span>
                    {p.banned && <span className="chip chip-bad">已封禁</span>}
                  </div>
                  <div className="num mt-0.5 text-xs text-ink-2">
                    星球 {p.planet_count}
                    {p.home_resources && ` ｜ 母星 M ${fmt(p.home_resources.M)} / C ${fmt(p.home_resources.C)} / D ${fmt(p.home_resources.D)}`}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-3">
            {!selected ? (
              <div className="empty text-xs">先在左侧选择一名玩家</div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <b>{selected.name}</b> <span className="num text-xs text-ink-3">#{selected.owner_id}</span>
                  {selected.banned && <span className="ml-2 chip chip-bad">封禁原因：{selected.ban_reason ?? '未填写'}</span>}
                </div>

                <div className="rounded-md border border-edge bg-surface-2 p-2">
                  <div className="mb-1 text-xs font-semibold text-ink-2">发放资源（负数=扣回）</div>
                  <div className="flex gap-2">
                    {(['M', 'C', 'D'] as const).map((k) => (
                      <label key={k} className="flex-1 text-xs">
                        {k === 'M' ? t('common.metal') : k === 'C' ? t('common.crystal') : t('common.deuterium')}
                        <input
                          value={grantDeltas[k]}
                          onChange={(e) => setGrantDeltas({ ...grantDeltas, [k]: e.target.value })}
                          aria-label={`发放${k === 'M' ? t('common.metal') : k === 'C' ? t('common.crystal') : t('common.deuterium')}数量`}
                          type="number"
                          className="field mt-0.5 w-full num"
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          gmGrant(baseUrl, gmKey, selected.owner_id, {
                            M: +grantDeltas.M || 0,
                            C: +grantDeltas.C || 0,
                            D: +grantDeltas.D || 0,
                          }),
                        t('common.resGranted'),
                      )
                    }
                    className="btn btn-primary mt-2 w-full py-1.5 text-xs"
                  >
                    {t('common.grantedToHome')}
                  </button>
                </div>

                <div className="rounded-md border border-edge bg-surface-2 p-2">
                  <div className="mb-1 text-xs font-semibold text-ink-2">设置建筑等级（修复/事件）</div>
                  <div className="flex gap-2">
                    <input
                      value={levelInput.planetId}
                      onChange={(e) => setLevelInput({ ...levelInput, planetId: e.target.value })}
                      placeholder="行星 id"
                      aria-label="目标行星 id"
                      className="field w-24 text-xs num"
                    />
                    <input
                      value={levelInput.building}
                      onChange={(e) => setLevelInput({ ...levelInput, building: e.target.value })}
                      placeholder="METAL_MINE"
                      aria-label="建筑键"
                      className="field w-36 text-xs"
                    />
                    <input
                      value={levelInput.level}
                      onChange={(e) => setLevelInput({ ...levelInput, level: e.target.value })}
                      placeholder="等级"
                      aria-label="目标等级"
                      type="number"
                      className="field w-20 text-xs num"
                    />
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          gmSetLevel(
                            baseUrl,
                            gmKey,
                            selected.owner_id,
                            +levelInput.planetId,
                            levelInput.building.trim().toUpperCase(),
                            +levelInput.level || 0,
                          ),
                        t('common.levelSet'),
                      )
                    }
                    className="btn btn-primary mt-2 w-full py-1.5 text-xs"
                  >
                    {t('common.setLevel')}
                  </button>
                </div>

                <div className="rounded-md border border-edge bg-surface-2 p-2">
                  <div className="mb-1 text-xs font-semibold text-ink-2">封禁 / 解封</div>
                  <input
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="封禁原因（展示给玩家）"
                    aria-label="封禁原因"
                    className="field w-full text-xs"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      disabled={busy || selected.banned}
                      onClick={() => void act(() => gmSetBanned(baseUrl, gmKey, selected.owner_id, true, banReason), '已封禁')}
                      className="btn btn-ghost py-1.5 text-xs text-bad"
                    >
                      {t('common.banAccount')}
                    </button>
                    <button
                      disabled={busy || !selected.banned}
                      onClick={() => void act(() => gmSetBanned(baseUrl, gmKey, selected.owner_id, false), '已解封')}
                      className="btn btn-ghost py-1.5 text-xs"
                    >
                      {t('common.unbanAccount')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'announce' && (
        <section className="panel max-w-2xl p-3">
          <label className="block text-sm">
            {t('common.announceInput')}
            <textarea
              value={announceText}
              onChange={(e) => setAnnounceText(e.target.value)}
              aria-label="公告内容"
              rows={3}
              maxLength={300}
              className="field mt-1 w-full text-sm"
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await gmAnnounce(baseUrl, gmKey, announceText.trim())
                setAnnounceText('')
                return ''
              }, t('common.announceSent'))
            }
            className="btn btn-primary mt-2 w-full py-1.5 text-sm"
          >
            {t('common.publishAnnounce')}
          </button>
        </section>
      )}

      {tab === 'audit' && (
        <section className="panel overflow-x-auto p-3">
          <button onClick={() => void loadAudit()} disabled={busy} className="btn btn-ghost mb-2 py-1 text-xs">
            {t('common.refresh')}
          </button>
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-ink-2">
              <tr>
                <th className="px-2 py-1.5">时间</th>
                <th className="px-2 py-1.5">类型</th>
                <th className="px-2 py-1.5">目标 owner</th>
                <th className="px-2 py-1.5">内容</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty px-2 py-3 text-ink-2">
                    {t('common.noRecords')}
                  </td>
                </tr>
              )}
              {audit.map((row) => (
                <tr key={row.id} className="border-t border-edge">
                  <td className="num px-2 py-1.5">{row.committed_at ? new Date(row.committed_at).toLocaleString() : '—'}</td>
                  <td className="px-2 py-1.5 font-semibold">{row.type}</td>
                  <td className="num px-2 py-1.5">{row.owner_id}</td>
                  <td className="px-2 py-1.5 text-ink-2">{JSON.stringify(row.payload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
