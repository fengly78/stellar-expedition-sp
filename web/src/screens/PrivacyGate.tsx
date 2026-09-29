import { sfx } from '../game/audio'
import { grantPrivacy, PRIVACY_STATEMENT_KEYS } from '../game/consent'
import { APP_VERSION, BUILD_DATE } from '../game/version'
import { LOCALE_LABELS, useLocale, type Locale } from '../game/i18n'

/** 隐私同意门（G2）：未同意前是整个应用的唯一入口屏——与服务器模式/存档系统零接触。 */
export default function PrivacyGate() {
  const { t, locale, setLocale } = useLocale()
  return (
    <div className="nova-entry-screen flex min-h-screen flex-col items-center justify-center px-4">
      <div className="panel w-full max-w-lg space-y-4 p-6">
        <h2 className="page-title text-center">{t('privacy.title')}</h2>
        <p className="text-xs text-ink-3">{t('privacy.intro', { version: APP_VERSION, date: BUILD_DATE || 'dev' })}</p>
        {/* 2026-09-29：App.tsx 在未同意前只渲染本页，语言切换器又在设置页之后，
            等于把「语言与声明不一致」的用户锁死在这屏。撤回同意后 locale 仍保留为 en，
            会稳定落进这个状态，所以这里必须自带切换入口。 */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-ink-3">{t('privacy.switchLanguage')}</span>
          <div className="flex gap-1">
            {LOCALE_LABELS.map((l) => (
              <button
                key={l.locale}
                type="button"
                aria-pressed={locale === l.locale}
                onClick={() => {
                  setLocale(l.locale as Locale)
                  sfx('complete')
                }}
                className={locale === l.locale ? 'btn btn-primary px-3 py-1 text-xs' : 'btn btn-ghost px-3 py-1 text-xs'}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {PRIVACY_STATEMENT_KEYS.map((k) => (
            <p key={k} className="text-sm leading-6 text-ink-2">
              {t(k)}
            </p>
          ))}
        </div>
        <button
          className="btn btn-primary min-h-11 w-full py-2.5"
          onClick={() => {
            grantPrivacy()
            sfx('complete')
            location.reload() // 重新挂载 App，进入标题页
          }}
        >
          {t('common.agreeEnter')}
        </button>
        <p className="text-center text-xs text-ink-3">{t('privacy.decline')}</p>
      </div>
    </div>
  )
}
