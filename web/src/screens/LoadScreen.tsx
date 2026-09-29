import { useRef, useState } from 'react'
import { sfx } from '../game/audio'
import { deleteSlot, DIFFICULTIES, exportSlot, importSlot, listSlots, SLOT_NAMES, useGame } from '../game/state'
import { toast } from '../game/toasts'
import { ConfirmModal } from '../components/Modal'
import { localizeField, useLocale } from '../game/i18n'

interface Props {
  onBack: () => void
  onLoaded: () => void
}

export default function LoadScreen({ onBack, onLoaded }: Props) {
  const { t } = useLocale()
  const [, setRefresh] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const [importTarget, setImportTarget] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const loadFromSlot = useGame((s) => s.loadFromSlot)
  const slots = listSlots()

  const doLoad = (slot: number) => {
    const err = loadFromSlot(slot)
    if (err) {
      toast(err, 'error')
      sfx('error')
    } else {
      sfx('complete')
      onLoaded()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <main className="panel w-full max-w-[26rem] p-6">
        <h2 className="page-title mb-4 text-center">{t('load.title')}</h2>

        <div className="space-y-2">
          {slots.map((meta, slot) => (
            <div key={slot} className="rounded-md border border-edge bg-surface-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{localizeField(SLOT_NAMES[slot], 'name')}</div>
                {meta ? (
                  <div className="num mt-0.5 text-xs text-ink-3">
                    {new Date(meta.savedWallAt).toLocaleString()} · {localizeField(DIFFICULTIES[meta.difficulty], 'label')} · {meta.planetCount}{' '}
                    {t('load.metaTime', { n: Math.floor(meta.gameTime / 3600000) })}
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="chip">{t('load.emptySlot')}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  disabled={!meta}
                  onClick={() => doLoad(slot)}
                  className="btn btn-primary min-h-11 sm:min-h-0 px-3 py-1 text-xs"
                >
                  {t('common.read')}
                </button>
                <button
                  disabled={!meta}
                  onClick={() => exportSlot(slot)}
                  className="btn btn-ghost px-2.5 py-1 text-xs"
                >
                  {t('common.export')}
                </button>
                <button
                  onClick={() => {
                    setImportTarget(slot)
                    fileInput.current?.click()
                  }}
                  className="btn btn-ghost px-2.5 py-1 text-xs"
                >
                  {t('common.import')}
                </button>
                <button
                  disabled={!meta}
                  onClick={() => setDeleteTarget(slot)}
                  className="btn btn-ghost px-2 py-1 text-xs"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f || importTarget === null) return
            importSlot(importTarget, f).then((err) => {
              if (err) {
                toast(err, 'error')
                sfx('error')
              } else {
                toast(t('load.imported'), 'success')
                setRefresh((n) => n + 1)
              }
            })
          }}
        />

        <button
          onClick={() => {
            sfx('click')
            onBack()
          }}
          className="btn btn-ghost mt-4 w-full"
        >
          {t('common.returnToMenu')}
        </button>
      </main>

      {deleteTarget !== null && (
        <ConfirmModal
          title={t('load.deleteTitle')}
          message={t('load.deleteConfirm', { name: localizeField(SLOT_NAMES[deleteTarget], 'name') })}
          danger
          onConfirm={() => {
            deleteSlot(deleteTarget)
            setDeleteTarget(null)
            setRefresh((n) => n + 1)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
