import { useState } from 'react'
import { deleteProfile, listProfiles, login, register, type Profile } from '../game/accounts'
import { sfx } from '../game/audio'
import { ConfirmModal } from '../components/Modal'
import { useLocale } from '../game/i18n'

export default function ProfileScreen({ onLogin }: { onLogin: () => void }) {
  const { t } = useLocale()
  const [mode, setMode] = useState<'list' | 'login' | 'register'>('list')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tickRefresh, setTickRefresh] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  void tickRefresh

  const profiles = listProfiles()

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const e = mode === 'login' ? await login(username, password) : await register(username, password)
      if (e) {
        setErr(e)
        sfx('error')
      } else {
        sfx('complete')
        onLogin()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nova-entry-screen flex min-h-screen items-center justify-end px-4 sm:px-12">
      <main className="nova-auth-panel panel panel-hud w-full max-w-sm p-6">
        <h2 className="page-title mb-4 text-center">{t('profile.title')}</h2>

        {mode === 'list' && (
          <div className="space-y-2">
            {profiles.length === 0 && <div className="empty">{t('profile.empty')}</div>}
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border border-edge bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{p.username}</span>
                <button
                  onClick={() => {
                    sfx('click')
                    setUsername(p.username)
                    setPassword('')
                    setErr(null)
                    setMode('login')
                  }}
                  className="btn btn-primary min-h-11 sm:min-h-0 px-3 py-1 text-xs"
                >
                  {t('common.login')}
                </button>
                <button onClick={() => setDeleteTarget(p)} className="btn btn-ghost px-2 py-1 text-xs">
                  {t('common.delete')}
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                sfx('click')
                setUsername('')
                setPassword('')
                setErr(null)
                setMode('register')
              }}
              className="btn btn-ghost mt-2 w-full"
            >
              {t('common.createAccount')}
            </button>
          </div>
        )}

        {mode !== 'list' && (
          <div className="space-y-3">
            <h3 className="sec-title text-center">{mode === 'login' ? t('profile.login') : t('profile.registerTitle')}</h3>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-2">{t('profile.name')}</span>
              <input
                className="field w-full"
                placeholder={t('profile.name')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-2">{t('profile.password')}</span>
              <input
                className="field w-full"
                type="password"
                placeholder={t('profile.passwordHint')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            {err && (
              <div className="alert-bad" role="alert">
                {err}
              </div>
            )}
            <button onClick={submit} disabled={busy} className="btn btn-primary min-h-11 sm:min-h-0 w-full py-2">
              {busy ? t('profile.busy') : mode === 'login' ? t('profile.enter') : t('profile.createAndEnter')}
            </button>
            <button
              onClick={() => {
                setMode('list')
                setErr(null)
              }}
              className="btn btn-ghost w-full py-1 text-xs"
            >
              {t('common.backLabel')}
            </button>
          </div>
        )}
      </main>

      {deleteTarget && (
        <ConfirmModal
          title={t('profile.deleteTitle')}
          message={t('profile.deleteConfirm', { name: deleteTarget.username })}
          danger
          onConfirm={() => {
            deleteProfile(deleteTarget.id)
            setDeleteTarget(null)
            setTickRefresh((n) => n + 1)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
