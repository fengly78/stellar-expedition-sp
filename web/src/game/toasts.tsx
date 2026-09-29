import { create } from 'zustand'
import { mirrorToastAsNotification } from './notify'

// ponytail: monotonic counter for unique toast IDs. Replaces Date.now()+Math.random() to satisfy oxlint no-restricted-properties.
let toastCounter = 0

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'warn' | 'error'
}

interface ToastStore {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++toastCounter
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  useToasts.getState().push(text, kind)
  // G9：页面隐藏时镜像为系统通知（用户显式开启后才有副作用，见 notify.ts）
  mirrorToastAsNotification(text)
}

// 子级不加 role="alert"：live region 容器常驻且负责播报，嵌套 alert 会造成部分读屏器双重播报
const KIND_STYLE: Record<Toast['kind'], string> = {
  info: 'border-edge-2 bg-surface-2/95 text-ink',
  success: 'border-ok/45 bg-surface-2/95 text-ok',
  warn: 'border-warn/45 bg-surface-2/95 text-warn',
  error: 'border-bad/45 bg-surface-2/95 text-bad',
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  // 容器必须常驻 DOM：live region 与内容同时挂载会导致屏幕阅读器漏播
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto num rounded-md border px-3 py-2 text-left text-sm shadow-panel ${KIND_STYLE[t.kind]}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
