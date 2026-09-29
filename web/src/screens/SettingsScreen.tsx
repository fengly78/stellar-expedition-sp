import { useState } from 'react'
import { currentProfile, updateProfileSettings } from '../game/accounts'
import { sfx, toggleMusic } from '../game/audio'
import { backupToCloud, fetchCloudManifest, loadCloudConfig, restoreSlotFromCloud, saveCloudConfig, testCloud, type CloudConfig } from '../game/cloudBackup'
import { allSlotFilesRaw, writeSlotRaw } from '../game/state'
import { PRIVACY_STATEMENT_KEYS, withdrawPrivacy } from '../game/consent'
import { clearErrorLog, exportErrorLog, getErrorLog, recordError, reportToEndpoint } from '../game/errorReport'
import { LOCALE_LABELS, useLocale } from '../game/i18n'
import {
  enableNotifications,
  notifyEnabled,
  notifyPermission,
  notifySupported,
  setNotifyEnabled,
} from '../game/notify'
import { toast } from '../game/toasts'
import { APP_VERSION, BUILD_DATE, checkForUpdate } from '../game/version'

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const profile = currentProfile()
  const { t, locale, setLocale: setUiLocale } = useLocale()
  const [volume, setVolume] = useState(profile?.volume ?? 0.7)
  const [sfxOn, setSfxOn] = useState(profile?.sfx ?? true)
  const [musicOn, setMusicOn] = useState(profile?.music ?? false)
  const [notifyOn, setNotifyOn] = useState(notifyEnabled())
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [checking, setChecking] = useState(false)
  const savedCloud = loadCloudConfig()
  const [cloud, setCloud] = useState<CloudConfig>(savedCloud ?? { url: '', username: '', password: '' })
  const [cloudBusy, setCloudBusy] = useState(false)
  const [errorCount, setErrorCount] = useState(getErrorLog().length)
  const [reportEndpoint, setReportEndpoint] = useState('')

  const apply = (v: number, s: boolean) => {
    updateProfileSettings({ volume: v, sfx: s })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <main className="panel w-full max-w-sm p-6">
        <h2 className="page-title mb-4 text-center">{t('settings.title')}</h2>

        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <label htmlFor="settings-volume">{t('settings.volume')}</label>
              <span className="num text-ink-2">{Math.round(volume * 100)}%</span>
            </div>
            <input
              id="settings-volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => {
                const v = +e.target.value / 100
                setVolume(v)
                apply(v, sfxOn)
              }}
              className="w-full accent-accent"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span>{t('settings.sfx')}</span>
            <button
              onClick={() => {
                const next = !sfxOn
                setSfxOn(next)
                apply(volume, next)
                if (next) sfx('click')
              }}
              aria-label={t('settings.sfx')}
              aria-pressed={sfxOn}
              className={`chip cursor-pointer ${sfxOn ? 'chip-ok' : ''}`}
            >
              {sfxOn ? t('settings.on') : t('settings.off')}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span>{t('settings.music')}</span>
            <button
              onClick={() => setMusicOn(toggleMusic())}
              aria-label={t('settings.music')}
              aria-pressed={musicOn}
              className={`chip cursor-pointer ${musicOn ? 'chip-ok' : ''}`}
            >
              {musicOn ? t('settings.on') : t('settings.off')}
            </button>
          </div>

          <button onClick={() => sfx('complete')} className="btn btn-ghost w-full py-1.5">
            {t('settings.preview')}
          </button>

          <div className="flex items-center justify-between text-sm">
            <span>{t('settings.notify')}</span>
            <button
              onClick={async () => {
                if (notifyOn) {
                  setNotifyEnabled(false)
                  setNotifyOn(false)
                  sfx('click')
                  return
                }
                const ok = await enableNotifications()
                setNotifyOn(ok)
                toast(ok ? t('settings.notifyOn') : t('settings.notifyFail'), ok ? 'success' : 'warn')
                sfx(ok ? 'complete' : 'error')
              }}
              aria-label={t('settings.notify')}
              aria-pressed={notifyOn}
              className={`chip cursor-pointer ${notifyOn ? 'chip-ok' : ''}`}
            >
              {notifyOn ? t('settings.on') : t('settings.off')}
            </button>
          </div>
          {notifySupported() && notifyPermission() === 'denied' && (
            <p className="text-xs text-warn">{t('settings.notifyDenied')}</p>
          )}

          <div className="flex items-center justify-between text-sm">
            <label htmlFor="settings-locale">{t('settings.language')}</label>
            <select
              id="settings-locale"
              value={locale}
              onChange={(e) => {
                setUiLocale(e.target.value as 'zh' | 'en')
                sfx('click')
              }}
              aria-label={t('settings.language')}
              className="field w-28 py-1 text-xs"
            >
              {LOCALE_LABELS.map((l) => (
                <option key={l.locale} value={l.locale}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-edge pt-3">
            <h3 className="mb-2 text-sm font-semibold">{t('settings.cloudTitle')}</h3>
            <p className="mb-2 text-xs leading-5 text-ink-2">
              {t('settings.cloudDesc')}
            </p>
            <div className="space-y-2">
              <input
                value={cloud.url}
                onChange={(e) => setCloud({ ...cloud, url: e.target.value })}
                placeholder={t('settings.davUrlPh')}
                aria-label={t('settings.davUrlAria')}
                className="field w-full text-xs"
              />
              <div className="flex gap-2">
                <input
                  value={cloud.username}
                  onChange={(e) => setCloud({ ...cloud, username: e.target.value })}
                  placeholder={t('settings.davUserPh')}
                  aria-label={t('settings.davUserAria')}
                  autoComplete="off"
                  className="field w-full text-xs"
                />
                <input
                  value={cloud.password}
                  onChange={(e) => setCloud({ ...cloud, password: e.target.value })}
                  placeholder={t('settings.davPassPh')}
                  aria-label={t('settings.davPassAria')}
                  type="password"
                  autoComplete="off"
                  className="field w-full text-xs"
                />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                disabled={cloudBusy}
                onClick={async () => {
                  setCloudBusy(true)
                  const r = await testCloud(cloud)
                  toast(r.message, r.ok ? 'success' : 'warn')
                  sfx(r.ok ? 'complete' : 'error')
                  setCloudBusy(false)
                }}
                className="btn btn-ghost py-1.5 text-xs"
              >
                {t('common.testConn')}
              </button>
              <button
                disabled={cloudBusy}
                onClick={async () => {
                  setCloudBusy(true)
                  saveCloudConfig(cloud)
                  const r = await backupToCloud(cloud, allSlotFilesRaw())
                  toast(r.message, r.ok ? 'success' : 'warn')
                  sfx(r.ok ? 'complete' : 'error')
                  setCloudBusy(false)
                }}
                className="btn btn-ghost py-1.5 text-xs"
              >
                {t('common.backupSave')}
              </button>
              <button
                disabled={cloudBusy}
                onClick={async () => {
                  setCloudBusy(true)
                  const m = await fetchCloudManifest(cloud)
                  if (!m.ok || !m.manifest) {
                    toast(m.message, 'warn')
                    sfx('error')
                    setCloudBusy(false)
                    return
                  }
                  let restored = 0
                  let lastErr: string | null = null
                  for (const s of m.manifest.slots) {
                    const r = await restoreSlotFromCloud(cloud, s.remoteName, s.slot, writeSlotRaw)
                    if (r.ok) restored++
                    else lastErr = r.message
                  }
                  toast(
                    lastErr ? t('settings.restorePartial', { ok: restored, total: m.manifest.slots.length, err: lastErr }) : t('settings.restoreDone', { n: restored }),
                    restored > 0 ? 'success' : 'warn',
                  )
                  sfx(restored > 0 ? 'complete' : 'error')
                  setCloudBusy(false)
                }}
                className="btn btn-ghost py-1.5 text-xs"
              >
                {t('common.restoreCloud')}
              </button>
            </div>
          </div>

          <div className="border-t border-edge pt-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t('settings.errorLog')}</span>
              <span className="num text-xs text-ink-3">{t('settings.errorCount', { n: errorCount })}</span>
            </div>
            <p className="mt-1 mb-2 text-xs leading-5 text-ink-2">
              {t('common.errorLogDesc')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const text = exportErrorLog()
                  const blob = new Blob([text], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `ogame-sp-error-log-${Date.now()}.txt`
                  a.click()
                  URL.revokeObjectURL(url)
                  sfx('click')
                }}
                className="btn btn-ghost py-1.5 text-xs"
              >
                {t('settings.export')}
              </button>
              <button
                onClick={() => {
                  clearErrorLog()
                  setErrorCount(0)
                  sfx('click')
                }}
                className="btn btn-ghost py-1.5 text-xs"
              >
                {t('settings.clear')}
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={reportEndpoint}
                onChange={(e) => setReportEndpoint(e.target.value)}
                placeholder={t('settings.reportPh')}
                aria-label={t('settings.reportAria')}
                className="field w-full text-xs"
              />
              <button
                onClick={async () => {
                  if (!reportEndpoint.trim()) {
                    toast(t('settings.reportNeedUrl'), 'warn')
                    return
                  }
                  // 端点不可达时给玩家可见反馈（同时进错误日志，便于导出）
                  const r = await reportToEndpoint(reportEndpoint)
                  if (!r.ok) recordError('uncaught', t('settings.reportFailed', { msg: r.message }))
                  setErrorCount(getErrorLog().length)
                  toast(r.message, r.ok ? 'success' : 'warn')
                  sfx(r.ok ? 'complete' : 'error')
                }}
                className="btn btn-ghost shrink-0 py-1.5 text-xs"
              >
                {t('common.report')}
              </button>
            </div>
          </div>

          <div className="border-t border-edge pt-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t('settings.about')}</span>
              <span className="num text-xs text-ink-3">
                v{APP_VERSION} · {t('settings.buildLabel')} {BUILD_DATE ? BUILD_DATE.slice(0, 10) : 'dev'}
              </span>
            </div>
            <button
              onClick={async () => {
                if (checking) return
                setChecking(true)
                const r = await checkForUpdate()
                toast(r.message + (r.notes ? t('settings.updateNotes', { notes: r.notes }) : ''), r.mode === 'available' ? 'success' : 'info')
                sfx(r.mode === 'available' ? 'complete' : 'click')
                setChecking(false)
              }}
              className="btn btn-ghost mt-2 w-full py-1.5 text-sm"
              disabled={checking}
            >
              {checking ? t('settings.checking') : t('settings.checkUpdate')}
            </button>
          </div>

          {showPrivacy ? (
            <div className="border-t border-edge pt-3">
              <h3 className="mb-2 text-sm font-semibold">{t('settings.privacyTitle')}</h3>
              <div className="space-y-1.5">
                {PRIVACY_STATEMENT_KEYS.map((k) => (
                  <p key={k} className="text-xs leading-5 text-ink-2">
                    {t(k)}
                  </p>
                ))}
              </div>
              <button
                onClick={() => {
                  withdrawPrivacy()
                  location.reload()
                }}
                className="btn btn-ghost mt-2 w-full py-1.5 text-xs text-bad"
              >
                {t('common.withdrawConsent')}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowPrivacy(true)} className="btn btn-ghost w-full py-1.5 text-sm">
              {t('common.privacy')}
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-ink-2">{t('settings.footerHint')}</p>

        <button
          onClick={() => {
            sfx('click')
            onBack()
          }}
          className="btn btn-primary min-h-11 sm:min-h-0 mt-4 w-full py-2"
        >
          {t('common.back')}
        </button>
      </main>
    </div>
  )
}
