import { sfx } from '../game/audio'
import { APP_VERSION, BUILD_DATE } from '../game/version'
import { useLocale } from '../game/i18n'

export default function TitleScreen({ onEnter }: { onEnter: () => void }) {
  const { t } = useLocale()
  return (
    <div className="nova-entry-screen flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="nova-entry-kicker mono">NOVA ORBITALS</div>
      <h2 className="page-title text-4xl tracking-[0.2em]">{t('title.brand')}</h2>
      <div className="mt-3 flex w-full items-center justify-center gap-3">
        <span aria-hidden="true" className="h-px w-10 shrink-0 bg-edge-2" />
        <p className="text-xs tracking-widest text-ink-2">A HIGHER HUMANITY · {t('title.taglineZh')}</p>
        <span aria-hidden="true" className="h-px w-10 shrink-0 bg-edge-2" />
      </div>
      <button
        onClick={() => {
          sfx('click')
          onEnter()
        }}
        className="btn btn-primary min-h-11 sm:min-h-0 mt-12 px-10 py-3 text-lg"
      >
        {t('title.enter')}
      </button>
      <p className="num mt-16 text-xs text-ink-3">
        v{APP_VERSION} · {t('title.footer', { date: BUILD_DATE ? BUILD_DATE.slice(0, 10) : 'dev' })}
      </p>
    </div>
  )
}
