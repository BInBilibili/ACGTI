import { readFileSync } from 'node:fs'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// ── GitHub Pages 部署配置 ──
// 本分支为「纯静态 · 仅 GitHub」部署：没有后端，构建产物全部由 GitHub Pages 托管。
//
// base 取值规则：
//   项目站点 https://<user>.github.io/<repo>/  → base 必须是子路径（默认 /ACGTI/）
//   用户站点 https://<user>.github.io/          → 设 VITE_BASE=/
//   自定义域名                                   → 设 VITE_BASE=/
// 覆盖方式：本地写 .env.local，或仓库 Settings → Secrets and variables → Actions → Variables。
const DEFAULT_BASE = '/ACGTI/'

function normalizeBase(raw: string | undefined): string {
  if (!raw) return DEFAULT_BASE
  const withLeadingSlash = raw.startsWith('/') ? raw : '/' + raw
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : withLeadingSlash + '/'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: normalizeBase(env.VITE_BASE),
    plugins: [vue()],
    define: {
      // 版本号单一来源：package.json，避免 statsReporter 手工常量漂移
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/vue/') || id.includes('node_modules/@vue/') || id.includes('node_modules/vue-router/')) {
              return 'vue'
            }
          },
        },
      },
    },
  }
})
