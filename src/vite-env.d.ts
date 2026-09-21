/// <reference types="vite/client" />

// 由 vite.config.ts 的 define 从 package.json 注入
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** 站点完整地址（用于 canonical / og:url），结尾斜杠可有可无 */
  readonly VITE_SITE_URL?: string
  /** 部署子路径，如 /ACGTI/；用户站点或自定义域名填 / */
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
