// GitHub Pages 构建后处理。
//
// 1) 404.html —— GitHub Pages 没有服务端 rewrites，深链接（如 /ACGTI/quiz 直接打开
//    或刷新）会落到 404.html。复制一份 index.html 过去，浏览器地址栏保持原路径，
//    Vue Router 启动后按 location.pathname 正确匹配路由，等效于 SPA fallback。
// 2) .nojekyll —— 关掉 GitHub Pages 默认的 Jekyll 处理，避免下划线开头的
//    产物文件被吞掉，同时加快发布。
//
// 由 package.json 的 build 脚本在 vite build 之后调用。

import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(process.cwd(), 'dist')
const indexPath = join(distDir, 'index.html')

if (!existsSync(indexPath)) {
  console.error('✖ postbuild-pages: 找不到 dist/index.html，请先执行 vite build')
  process.exit(1)
}

copyFileSync(indexPath, join(distDir, '404.html'))
writeFileSync(join(distDir, '.nojekyll'), '')

console.log('✔ postbuild-pages: 已生成 dist/404.html 与 dist/.nojekyll')
