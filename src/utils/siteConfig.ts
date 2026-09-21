// 站点地址配置的单一来源。
//
// 纯静态部署后，canonical / og:url / sitemap 都指向 GitHub Pages 地址，
// 默认值按「账号 BInBilibili + 仓库名 ACGTI」的项目站点推导。
// 换账号、换仓库名或绑定自定义域名时，只需在 .env.local（或 Actions Variables）
// 里设 VITE_SITE_URL，不必改任何组件代码。

const DEFAULT_SITE_URL = 'https://binbilibili.github.io/ACGTI'

function stripTrailingSlashes(value: string): string {
  let out = value
  while (out.endsWith('/')) out = out.slice(0, -1)
  return out
}

/** 站点根地址，保证不带结尾斜杠，例如 https://binbilibili.github.io/ACGTI */
export const SITE_URL = stripTrailingSlashes(import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL)

/** 去掉协议前缀的展示地址，例如 binbilibili.github.io/ACGTI（海报页脚 / FAQ 文案用） */
export const SITE_DISPLAY_URL = SITE_URL.replace(/^https?:\/\//, '')

export const SITE_NAME = 'ACGTI'

/** 当前部署仓库：用于导航栏 / 页脚的 Star 按钮 */
export const REPO_URL = 'https://github.com/BInBilibili/ACGTI'

/** 上游原项目：二次创作出处标注（Apache-2.0，上游 README 亦要求标注） */
export const UPSTREAM_URL = 'https://github.com/tianxingleo/ACGTI'
