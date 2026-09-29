import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './nova-overrides.css'
import App from './App.tsx'

// 清 Service Worker（2026-09-28）
//
// 两种触发：
//   · dev（import.meta.env.DEV）：vite dev 永不注册 SW，但仍需清理「之前被 preview
//     控制过」的旧 SW——devOptions.enabled=false 只是不注册新的，不解除已有控制。
//   · preview/生产：加 ?nosw=1 逃生参数。preview 跑真实 dist，SW 语义必须保留
//     （否则离线能力没了），但验证新构建需要一条不经过缓存的通路。
//
// 为什么需要：实测症状是 dist 已重建、preview 已重启、页面已 reload，network 面板
// 请求的仍是历史 hash 文件（如 index-vvKbIQhG 而磁盘上已是 index-BPLpxMbq），
// 表现为「改了代码没生效」，排查成本极高且容易被误判成修复失败。
const forceNoSW = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nosw')
if ((import.meta.env.DEV || forceNoSW) && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => {
      /* 清理失败不应阻断应用启动 */
    })
  if ('caches' in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {
        /* 同上 */
      })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
