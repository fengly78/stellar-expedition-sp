import { useState } from 'react'
import Modal from './Modal'
import { fmt } from '../game/objects'
import { useGame } from '../game/state'
import NovaIcon from './NovaIcon'
import { useLocale } from '../game/i18n'

type ResKey = 'metal' | 'crystal' | 'deuterium'
const RES_KEY: Record<ResKey, string> = { metal: 'common.metal', crystal: 'common.crystal', deuterium: 'common.deuterium' }
const VALUE: Record<ResKey, number> = { metal: 1, crystal: 1.5, deuterium: 3 }

export default function MerchantModal({ planetId, onClose }: { planetId: number; onClose: () => void }) {
  const { t } = useLocale()
  const planet = useGame((s) => s.planets.find((p) => p.id === planetId))
  const trade = useGame((s) => s.trade)
  const [give, setGive] = useState<ResKey>('metal')
  const [getRes, setGetRes] = useState<ResKey>('crystal')
  const [amount, setAmount] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)

  if (!planet) return null

  const got = give === getRes ? 0 : Math.floor((amount * VALUE[give] * 0.95) / VALUE[getRes])

  return (
    <Modal title={t('merchant.title')} onClose={onClose}>
      <div className="mb-2 flex items-center gap-2 text-accent-2"><NovaIcon name="merchant" size={22} /><strong>NOVA RESOURCE EXCHANGE</strong></div>
      <p className="text-xs text-ink-2">{t('merchant.rate')}</p>

      <div className="mt-3 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-16 text-ink-2">{t('merchant.give')}</span>
          <select
            className="field"
            aria-label={t('merchant.giveResAria')}
            value={give}
            onChange={(e) => {
              const v = e.target.value as ResKey
              setGive(v)
              if (v === getRes) setGetRes(v === 'metal' ? 'crystal' : 'metal')
            }}
          >
            {(Object.keys(RES_KEY) as ResKey[]).map((k) => (
              <option key={k} value={k}>
                {t(RES_KEY[k])}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={Math.floor(planet.resources[give])}
            value={amount || ''}
            onChange={(e) => setAmount(Math.max(0, Math.floor(+e.target.value || 0)))}
            aria-label={t('merchant.giveQtyAria')}
            className="field w-28 num"
          />
          <button onClick={() => setAmount(Math.floor(planet.resources[give]))} className="btn btn-ghost px-2 py-0.5 text-xs num">
            {t('merchant.maxOf', { n: fmt(planet.resources[give]) })}
          </button>
        </div>

        <div className="text-center text-ink-3" aria-hidden="true">⬇</div>

        <div className="flex items-center gap-2">
          <span className="w-16 text-ink-2">{t('merchant.get')}</span>
          <select
            className="field"
            aria-label={t('merchant.getResAria')}
            value={getRes}
            onChange={(e) => setGetRes(e.target.value as ResKey)}
          >
            {(Object.keys(RES_KEY) as ResKey[]).filter((k) => k !== give).map((k) => (
              <option key={k} value={k}>
                {t(RES_KEY[k])}
              </option>
            ))}
          </select>
          <span className="num text-lg font-bold text-ok">{fmt(got)}</span>
        </div>

        {msg && <div className="alert-bad" role="alert">{msg}</div>}

        <button
          disabled={amount <= 0 || give === getRes || got <= 0 || planet.resources[give] < amount}
          onClick={() => {
            const err = trade(planetId, give, getRes, amount)
            setMsg(err)
            if (!err) setAmount(0)
          }}
          className="btn btn-primary min-h-11 sm:min-h-0 w-full"
        >
          {t('common.dealDone')}
        </button>
      </div>
    </Modal>
  )
}
