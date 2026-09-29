import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 回归：Service Worker 缓存旧 bundle（2026-09-28 试玩发现）
//
// 症状：dist 已重建、preview 已重启、页面已 reload，network 面板里请求的仍是
// 历史 hash 文件（实测拿到 index-vvKbIQhG，而磁盘上已是 index-BPLpxMbq）。
// 表现为「改了代码没生效」，极易被误判成修复失败——本轮连续两轮都踩了这个坑。
//
// 修复三层：
//   1. vite.config.ts 的 VitePWA devOptions.enabled=false —— dev 不注册新 SW
//   2. main.tsx 在 DEV 下主动注销既有 SW 并清 CacheStorage —— 解除已有控制
//   3. main.tsx 支持 ?nosw=1 —— preview 验证新构建的逃生通道
//
// 第 1 层单独不够：它只阻止「新注册」，已被 SW 控制的浏览器仍走旧缓存。
// 第 2 层是 dev 侧兜底，第 3 层保留 preview 的 PWA 语义（离线能力不能丢）。

// 测试文件在 src/game/__tests__/；main.tsx 在 src/，vite.config.ts 在 web/ 根
const SRC = resolve(__dirname, '..', '..')
const ROOT = resolve(SRC, '..')

const main = readFileSync(resolve(SRC, 'main.tsx'), 'utf8')
const viteConfig = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8')

describe('Service Worker 缓存治理', () => {
  it('dev 模式不注册 Service Worker', () => {
    expect(viteConfig).toMatch(/devOptions:\s*\{\s*enabled:\s*false/)
  })

  it('main.tsx 在 dev 下主动注销既有 SW', () => {
    expect(main).toMatch(/import\.meta\.env\.DEV/)
    expect(main).toMatch(/getRegistrations\(\)/)
    expect(main).toMatch(/\.unregister\(\)/)
  })

  it('清理逻辑被 import.meta.env.DEV 真实包裹（不是死代码）', () => {
    // 若 import.meta.env.DEV 整体被去掉，清理逻辑就永远不会执行
    expect(main).toMatch(/\(import\.meta\.env\.DEV \|\| forceNoSW\) && 'serviceWorker' in navigator/)
  })

  it('清理动作失败不阻断应用启动（catch 存在且吞掉错误）', () => {
    // 两处异步链都要有 catch：注销与 caches 清理
    const catches = main.match(/\.catch\(\(\) => \{/g)
    expect(catches).not.toBeNull()
    expect(catches!.length).toBeGreaterThanOrEqual(2)
  })

  it('同时清 CacheStorage（只注销 SW 不够，缓存条目仍会被复用）', () => {
    expect(main).toMatch(/'caches' in window/)
    expect(main).toMatch(/caches\s*\.\s*keys\(\)/)
    expect(main).toMatch(/caches\.delete\(k\)/)
  })

  it('提供 ?nosw=1 逃生参数供 preview 使用（保留生产 PWA 语义）', () => {
    expect(main).toMatch(/URLSearchParams\(location\.search\)\.has\('nosw'\)/)
    expect(main).toMatch(/forceNoSW/)
  })

  it('清理逻辑位于应用挂载之前（首屏即生效）', () => {
    // 比较实际调用点，而不是文件顶部的 import 语句
    const mountAt = main.indexOf("createRoot(document.getElementById('root')!)")
    expect(mountAt).toBeGreaterThan(-1)
    expect(main.indexOf('getRegistrations')).toBeLessThan(mountAt)
    expect(main.indexOf('forceNoSW')).toBeLessThan(mountAt)
  })

  it('应用挂载点与 StrictMode 结构未被破坏', () => {
    expect(main).toMatch(/createRoot\(document\.getElementById\('root'\)!\)/)
    expect(main).toMatch(/<StrictMode>/)
  })
})
