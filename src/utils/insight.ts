// ── 结果解读（纯静态本地生成版）──
//
// 上游通过 POST /api/insight 调 Cloudflare Workers AI / 兼容网关生成文案，密钥只存服务端。
// 本分支只允许在 GitHub 上运行：GitHub Pages 没有服务端，而把任何模型密钥放进浏览器
// 都等于公开泄露，所以这里改为「本地规则生成」——
//
//   素材：命中的角色 + 原型文案（i18n，已含 4 种语言）+ 你的四维倾向分数
//   过程：完全在浏览器内组合，零网络请求、零密钥、零费用
//   语义：不再是「AI 生成」，因此卡片标题与隐私说明同步改成了「角色解读」的表述
//
// 对外签名与上游保持一致，AiInsightCard.vue 无需改动。

import charactersData from '../data/characters.json'
import { getLocalizedCharacterName, getLocalizedCharacterSeries } from '../i18n/characters'
import { messages } from '../i18n/messages'
import type { AppLocale } from '../i18n/types'

export interface InsightScores {
  ei: number
  sn: number
  tf: number
  jp: number
}

export interface InsightResponse {
  text: string | null
  cached?: boolean
  available: boolean
  reason?: string
}

interface CharacterRecord {
  id: string
  name: string
  series: string
  code: string
  archetypeId: string
  hidden?: boolean
}

// messages.ts 用 as const 导出，字段是深度只读的；这里的接口必须同样声明 readonly，
// 否则 TS 会以「两个类型没有任何重叠」报 TS2352 拒绝断言。
interface ArchetypeCopy {
  readonly name?: string
  readonly subtitle?: string
  readonly narrativeRole?: string
  readonly oneLiners?: readonly string[]
  readonly description?: string
  readonly spotlight?: string
  readonly weakness?: string
}

const characterByCode = new Map<string, CharacterRecord>()
for (const item of charactersData as CharacterRecord[]) {
  characterByCode.set(item.code.toUpperCase(), item)
}

// ── 各语言的连接文案 ──
// 与 messages.ts 分开存放：这部分是「解读器的语法」，不是界面文案，
// 集中在这里便于统一审阅，也避免把 4 份 messages 改得面目全非。
interface InsightCopy {
  opening: string
  openingNoSeries: string
  dimensionHeading: string
  dimensionLine: string
  strengthHigh: string
  strengthMid: string
  strengthLow: string
  archetypeHeading: string
  spotlightLabel: string
  weaknessLabel: string
  closing: string
}

const COPY: Record<AppLocale, InsightCopy> = {
  'zh-CN': {
    opening: '你的角色代码是 {code}，命中《{series}》的 {name}，落在「{archetype}」原型上。',
    openingNoSeries: '你的角色代码是 {code}，落在「{archetype}」原型上。',
    dimensionHeading: '四维倾向',
    dimensionLine: '{label}：偏向「{pole}」，倾向{strength}。',
    strengthHigh: '很明显',
    strengthMid: '中等',
    strengthLow: '比较轻微',
    archetypeHeading: '原型深读',
    spotlightLabel: '高光',
    weaknessLabel: '盲点',
    closing: '四维里最突出的是「{pole}」。它既是你最顺手的地方，也是最容易用力过猛的地方——把它当工具，别当身份。',
  },
  'zh-TW': {
    opening: '你的角色代碼是 {code}，命中《{series}》的 {name}，落在「{archetype}」原型上。',
    openingNoSeries: '你的角色代碼是 {code}，落在「{archetype}」原型上。',
    dimensionHeading: '四維傾向',
    dimensionLine: '{label}：偏向「{pole}」，傾向{strength}。',
    strengthHigh: '很明顯',
    strengthMid: '中等',
    strengthLow: '比較輕微',
    archetypeHeading: '原型深讀',
    spotlightLabel: '高光',
    weaknessLabel: '盲點',
    closing: '四維裡最突出的是「{pole}」。它既是你最順手的地方，也是最容易用力過猛的地方——把它當工具，別當身分。',
  },
  en: {
    opening: 'Your character code is {code} — you matched {name} from {series}, landing on the "{archetype}" archetype.',
    openingNoSeries: 'Your character code is {code}, landing on the "{archetype}" archetype.',
    dimensionHeading: 'The four dimensions',
    dimensionLine: '{label}: leaning {pole}, a {strength} tilt.',
    strengthHigh: 'pronounced',
    strengthMid: 'moderate',
    strengthLow: 'slight',
    archetypeHeading: 'The archetype in depth',
    spotlightLabel: 'Where you shine',
    weaknessLabel: 'Where it costs you',
    closing: 'The strongest of the four is "{pole}". It is both your best instinct and the one most likely to be overused — treat it as a tool, not an identity.',
  },
  ja: {
    opening: 'あなたのキャラクターコードは {code}。《{series}》の {name} にマッチし、「{archetype}」原型に着地しました。',
    openingNoSeries: 'あなたのキャラクターコードは {code}。「{archetype}」原型に着地しました。',
    dimensionHeading: '4つの次元',
    dimensionLine: '{label}：「{pole}」寄り、傾きは{strength}。',
    strengthHigh: 'かなり強い',
    strengthMid: '中程度',
    strengthLow: 'やや軽い',
    archetypeHeading: '原型を深く読む',
    spotlightLabel: '強み',
    weaknessLabel: '盲点',
    closing: '4次元で最も強いのは「{pole}」。最も得意な勘所であり、最も使いすぎやすいところでもあります——道具として扱い、アイデンティティにはしないこと。',
  },
}

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '')
}

// 维度定义：索引 0 = 正分侧，索引 1 = 负分侧，与 messages 的 result.dimensions 对齐
const DIMENSIONS: Array<{ key: keyof InsightScores; pair: string }> = [
  { key: 'ei', pair: 'E_I' },
  { key: 'sn', pair: 'S_N' },
  { key: 'tf', pair: 'T_F' },
  { key: 'jp', pair: 'J_P' },
]

type DimensionLabels = Readonly<Record<string, readonly [string, string]>>

function getDimensionLabels(locale: AppLocale): DimensionLabels {
  const fallback = (messages['zh-CN'] as unknown as { result?: { dimensions?: DimensionLabels } }).result?.dimensions ?? {}
  return (messages[locale] as unknown as { result?: { dimensions?: DimensionLabels } }).result?.dimensions ?? fallback
}

// 「换一种说法」每次请求轮换一句角色格言，保证重生成结果肉眼可见地不同
let variantCursor = 0

function pickStrength(abs: number, copy: InsightCopy): string {
  if (abs >= 0.5) return copy.strengthHigh
  if (abs >= 0.2) return copy.strengthMid
  return copy.strengthLow
}

/**
 * 生成结果解读（本地、同步计算、无网络）
 *
 * 保留 async 与上游一致，调用方 await 写法不变；fresh 语义从「绕过服务端缓存」
 * 变为「换一组措辞」，与结果页「换一种说法」按钮的意图一致。
 */
export async function fetchAiInsight(
  characterCode: string,
  scores: InsightScores,
  lang: string,
  fresh = false,
): Promise<InsightResponse | null> {
  const locale = (lang in COPY ? lang : 'zh-CN') as AppLocale
  const copy = COPY[locale]

  const character = characterByCode.get(String(characterCode).toUpperCase())
  if (!character) {
    return { text: null, available: false, reason: 'unknown-character' }
  }

  if (fresh) variantCursor += 1

  const archetype = (messages[locale] as unknown as { archetypes?: Record<string, ArchetypeCopy> }).archetypes?.[character.archetypeId]
    ?? (messages['zh-CN'] as unknown as { archetypes?: Record<string, ArchetypeCopy> }).archetypes?.[character.archetypeId]

  const characterName = getLocalizedCharacterName(character, locale)
  const seriesName = getLocalizedCharacterSeries(character, locale)
  const archetypeName = archetype?.name ?? character.archetypeId

  const paragraphs: string[] = []

  // 1) 开场 + 一句角色格言
  paragraphs.push(
    seriesName
      ? fill(copy.opening, { code: character.code, series: seriesName, name: characterName, archetype: archetypeName })
      : fill(copy.openingNoSeries, { code: character.code, name: characterName, archetype: archetypeName }),
  )

  const oneLiners = archetype?.oneLiners ?? []
  if (oneLiners.length > 0) {
    paragraphs.push(oneLiners[Math.abs(variantCursor) % oneLiners.length])
  }

  // 2) 四维倾向逐条
  const labels = getDimensionLabels(locale)
  const dimensionLines: string[] = []
  let strongest: { pole: string; abs: number } | null = null

  for (const dimension of DIMENSIONS) {
    const value = Number(scores?.[dimension.key])
    if (!Number.isFinite(value)) continue

    const pair = labels[dimension.pair]
    if (!pair) continue

    const pole = value >= 0 ? pair[0] : pair[1]
    const abs = Math.min(Math.abs(value), 1)

    if (!strongest || abs > strongest.abs) strongest = { pole, abs }

    dimensionLines.push(fill(copy.dimensionLine, {
      label: pair[0] + ' / ' + pair[1],
      pole,
      strength: pickStrength(abs, copy),
    }))
  }

  if (dimensionLines.length > 0) {
    paragraphs.push('【' + copy.dimensionHeading + '】\n' + dimensionLines.join('\n'))
  }

  // 3) 原型深读
  const archetypeBlock: string[] = []
  if (archetype?.description) archetypeBlock.push(archetype.description)
  if (archetype?.spotlight) archetypeBlock.push(copy.spotlightLabel + '｜' + archetype.spotlight)
  if (archetype?.weakness) archetypeBlock.push(copy.weaknessLabel + '｜' + archetype.weakness)

  if (archetypeBlock.length > 0) {
    paragraphs.push('【' + copy.archetypeHeading + '】\n' + archetypeBlock.join('\n'))
  }

  // 4) 收尾：指出最显著维度
  if (strongest) {
    paragraphs.push(fill(copy.closing, { pole: strongest.pole }))
  }

  return {
    text: paragraphs.join('\n\n'),
    available: true,
    cached: false,
  }
}
