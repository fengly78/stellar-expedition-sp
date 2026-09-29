/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as { version: string }

export default defineConfig({
  define: {
    // G3：版本与构建时间构建期注入（src/game/version.ts 消费；测试环境回退 0.0.0）
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    // Large approved NOVA concept images are static scene backdrops. Watching
    // them on Windows can raise EBUSY while the in-app browser is decoding.
    watch: { ignored: ['**/public/nova/**'] },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // dev 模式禁用 Service Worker（2026-09-28）。
      // 症状：preview 端口跑 dist 时，SW 会把旧 bundle 缓存住——即使 dist 已重建、
      // preview 已重启、页面已 reload，请求的仍是历史产物（实测 sequence 里拿到
      // index-vvKbIQhG 而磁盘上早已是 index-BPLpxMbq）。这让「改了代码没生效」
      // 的排查成本极高，且容易被误判成修复失败。
      // devOptions.enabled=false 让 `vite dev` 完全不注册 SW，源码改动即时生效；
      // 真实浏览器验证请优先用 dev server（5180），而非 preview。
      devOptions: { enabled: false, type: 'module' },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '星际远征 SP',
        short_name: '星际远征',
        description: 'OGame 式太空策略单机游戏',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
