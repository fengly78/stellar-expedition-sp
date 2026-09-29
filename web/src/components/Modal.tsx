import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useLocale } from '../game/i18n'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useLocale()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // 调用方普遍传内联箭头函数，若直接放进依赖会导致每次渲染都重新挂载监听；
  // 同时用 ref 持有最新回调，避免依赖里删掉 onClose 后闭包捕获到旧的 props。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 打开时把焦点移入对话框，卸载（关闭）时还给打开前的焦点元素
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? dialogRef.current)?.focus()
    return () => prev?.focus()
  }, [])

  // Escape 关闭 + Tab 焦点陷阱（不引入 focus-trap 库）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const el = dialogRef.current
      if (!el) return
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        e.preventDefault()
        el.focus()
        return
      }
      if (!el.contains(document.activeElement)) {
        e.preventDefault()
        focusables[0].focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    // 背板仅承担点击关闭（键盘关闭走 Escape），role=presentation 避免非交互 div 带 click 语义
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[85vh] w-full overflow-y-auto rounded-lg border border-edge bg-surface-2 p-4 shadow-panel ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id={titleId} className="font-semibold text-accent-2">{title}</h3>
          <button onClick={onClose} className="btn btn-ghost text-xs">
            ✕ {t('common.close')}
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({ title, message, danger, onConfirm, onCancel }: { title: string; message: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useLocale()
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-ink-2">{message}</p>
      <div className="mt-4 flex gap-2">
        <button onClick={onConfirm} className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`}>
          {t('common.confirm')}
        </button>
        <button onClick={onCancel} className="btn btn-ghost flex-1">
          {t('common.cancel')}
        </button>
      </div>
    </Modal>
  )
}
