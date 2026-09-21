declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

// 不设默认值：上游把原作者自己的 AdSense 账号写成兜底值，
// 直接沿用会把流量与收益算到无关账号上，也不符合 AdSense 的站点归属要求。
// 未配置 VITE_ADSENSE_CLIENT 时，全站广告位自动不渲染。
const ADSENSE_CLIENT = String(import.meta.env.VITE_ADSENSE_CLIENT ?? '').trim()
const ADSENSE_SCRIPT_ID = 'acgti-adsense-script'

export function getAdsenseClient() {
  return ADSENSE_CLIENT
}

export function hasAdsenseClient() {
  return ADSENSE_CLIENT.length > 0
}

export function ensureAdsenseScript() {
  if (!hasAdsenseClient() || typeof document === 'undefined') {
    return
  }

  if (
    document.getElementById(ADSENSE_SCRIPT_ID) ||
    document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')
  ) {
    return
  }

  const script = document.createElement('script')
  script.id = ADSENSE_SCRIPT_ID
  script.async = true
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`
  script.crossOrigin = 'anonymous'
  document.head.appendChild(script)
}

export function requestAdsenseSlot() {
  if (!hasAdsenseClient() || typeof window === 'undefined') {
    return
  }

  try {
    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
  } catch (error) {
    console.error('AdSense slot request failed:', error)
  }
}
