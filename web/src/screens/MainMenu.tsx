import { useState } from 'react'
import { currentProfile } from '../game/accounts'
import { sfx } from '../game/audio'
import { useLocale } from '../game/i18n'
import { listSlots } from '../game/state'

interface Props {
  onNewGame: () => void
  onContinue: () => void
  onLoad: () => void
  onSettings: () => void
  onServer: () => void
  onLogout: () => void
}

export default function MainMenu({ onNewGame, onContinue, onLoad, onSettings, onServer, onLogout }: Props) {
  const [confirmNew, setConfirmNew] = useState(false)
  const profile = currentProfile()
  const slots = listSlots()
  const autosave = slots[0]
  const { t } = useLocale()

  return (
    <div className="nova-entry-screen nova-main-menu flex min-h-screen flex-col items-center justify-center px-4">
      <h2 className="page-title text-xl">{t('menu.title')}</h2>
      <p className="mt-1 text-sm text-ink-2">{t('menu.commander')}{t('common.colon')}{profile?.username ?? '—'}</p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
        {!confirmNew ? (
          <>
            <button
              onClick={() => {
                sfx('click')
                onContinue()
              }}
              disabled={!autosave}
              className="btn btn-primary min-h-11 sm:min-h-0 w-full py-2.5"
            >
              {autosave ? t('menu.continue') : t('menu.continueNo')}
            </button>
            <button
              onClick={() => {
                sfx('click')
                if (autosave) setConfirmNew(true)
                else onNewGame()
              }}
              className="btn btn-ghost w-full py-2.5"
            >
              {t('menu.newGame')}
            </button>
            <button
              onClick={() => {
                sfx('click')
                onLoad()
              }}
              className="btn btn-ghost w-full py-2.5"
            >
              {t('menu.load')}
            </button>
            <button
              onClick={() => {
                sfx('click')
                onSettings()
              }}
              className="btn btn-ghost w-full py-2.5"
            >
              {t('menu.settings')}
            </button>
            <button
              onClick={() => {
                sfx('click')
                onServer()
              }}
              className="btn btn-ghost w-full py-2.5"
            >
              {t('menu.server')}<span className="ml-1 text-xs text-ink-3">Beta</span>
            </button>
            <button
              onClick={() => {
                sfx('click')
                onLogout()
              }}
              className="btn btn-ghost w-full py-2.5"
            >
              {t('menu.logout')}
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <h3 className="sec-title text-center">{t('menu.confirmOverwrite')}</h3>
            <p className="px-1 text-center text-xs text-ink-2">
              {t('menu.initResource')} · {t('menu.newbieShield')}
            </p>
            <button
              onClick={() => {
                sfx('complete')
                onNewGame()
              }}
              className="w-full rounded-md border border-edge bg-surface-2 px-4 py-3 text-left transition hover:border-edge-hot hover:bg-surface-3 hover:shadow-glow"
            >
              <div className="font-semibold">{t('menu.startNew')}</div>
              <div className="mt-0.5 text-xs text-ink-2">{t('menu.localSingle')}</div>
            </button>
            <button onClick={() => setConfirmNew(false)} className="btn btn-ghost w-full py-1.5 text-xs">
              {t('menu.back')}
            </button>
          </div>
        )}
      </div>

      {autosave && !confirmNew && (
        <p className="mt-4 text-xs text-ink-2">
          {t('menu.lastSave')}{t('common.colon')}{autosave.savedWallAt ? new Date(autosave.savedWallAt).toLocaleString() : '—'}
        </p>
      )}
    </div>
  )
}
