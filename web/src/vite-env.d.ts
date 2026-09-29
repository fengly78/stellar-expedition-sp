/// <reference types="vite/client" />

// 构建期注入（vite.config.ts define）
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string

interface ImportMetaEnv {
  /** 可选更新清单 URL（发布渠道就绪后配置；未配置=离线模式只展示版本） */
  readonly VITE_VERSION_MANIFEST_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
