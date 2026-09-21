// ── 纯静态部署的「本地后端」 ──
//
// 上游版本把匿名统计落在 Cloudflare Pages Functions + D1 上。本分支只允许
// 在 GitHub 上运行（GitHub Pages 是纯静态托管，没有服务端、也没有可安全
// 放进浏览器的密钥），因此把这几件事整体搬到浏览器本地：
//
//   /api/submit      → 写入 localStorage 的本机提交记录
//   /api/stats/*     → 基线快照（src/data/statsBaseline.json）+ 本机记录实时聚合
//   /api/feedback    → 写入 localStorage 的本机反馈记录
//
// 代价是「全局统计」不再是实时的全站数据，而是「上游快照 + 你自己这台机器」。
// 这一点在统计页有明确文案说明，不做伪装。数据不出浏览器，隐私上反而更强。

import baselineData from '../data/statsBaseline.json'

export interface RankedItem {
  code: string
  count: number
  percent: number
}

export interface OverviewData {
  totalSubmissions: number
  todaySubmissions: number
  last24hSubmissions: number
}

export interface ResultStats {
  totalSubmissions: number
  sameCharacterCount: number
  sameCharacterPercent: number
  sameArchetypeCount: number
  sameArchetypePercent: number
  characterRank: number | null
  archetypeRank: number | null
}

interface StatsBaseline {
  source: string
  upstreamRepo: string
  capturedAt: string
  overview: OverviewData
  archetypes: RankedItem[]
  characters: RankedItem[]
}

const baseline = baselineData as unknown as StatsBaseline

const SUBMISSIONS_KEY = 'acgti:local:submissions:v1'
const FEEDBACK_KEY = 'acgti:local:feedback:v1'

/** 本机最多保留的记录条数，防止 localStorage 无限膨胀 */
const MAX_LOCAL_RECORDS = 500

export interface LocalSubmission {
  submissionId: string
  characterCode: string
  archetypeCode: string
  predictedMbti?: string
  dimensionScores?: { ei?: number; sn?: number; tf?: number; jp?: number }
  durationMs?: number
  appVersion?: string
  submittedAt: string
}

export interface LocalFeedback {
  submissionId: string
  selfMbti: string
  confidence: number
  note?: string
  appVersion?: string
  submittedAt: string
}

// ── 底层读写：任何异常（隐私模式禁用 storage、配额写满、脏数据）都静默降级 ──

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

function readList<T>(key: string): T[] {
  if (!hasStorage()) return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeList<T>(key: string, list: T[]): boolean {
  if (!hasStorage()) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(-MAX_LOCAL_RECORDS)))
    return true
  } catch {
    return false
  }
}

// ── 写入端 ──

/** 记录一次本机测试结果，返回是否落盘成功 */
export function recordSubmission(payload: Omit<LocalSubmission, 'submittedAt'>): boolean {
  const list = readList<LocalSubmission>(SUBMISSIONS_KEY)
  // 同一个 submissionId 重复上报时覆盖，避免刷新结果页产生重复记录
  const next = list.filter((item) => item.submissionId !== payload.submissionId)
  next.push({ ...payload, submittedAt: new Date().toISOString() })
  return writeList(SUBMISSIONS_KEY, next)
}

/** 记录一次本机 MBTI 自评反馈 */
export function recordFeedback(payload: Omit<LocalFeedback, 'submittedAt'>): boolean {
  const list = readList<LocalFeedback>(FEEDBACK_KEY)
  const next = list.filter((item) => item.submissionId !== payload.submissionId)
  next.push({ ...payload, submittedAt: new Date().toISOString() })
  return writeList(FEEDBACK_KEY, next)
}

export function getLocalSubmissions(): LocalSubmission[] {
  return readList<LocalSubmission>(SUBMISSIONS_KEY)
}

export function getLocalFeedbacks(): LocalFeedback[] {
  return readList<LocalFeedback>(FEEDBACK_KEY)
}

/** 清空本机全部记录（统计页提供入口） */
export function clearLocalData(): void {
  if (!hasStorage()) return
  try {
    window.localStorage.removeItem(SUBMISSIONS_KEY)
    window.localStorage.removeItem(FEEDBACK_KEY)
  } catch {
    /* 忽略 */
  }
}

// ── 聚合端：基线快照 + 本机记录 ──

function countBy(list: LocalSubmission[], pick: (item: LocalSubmission) => string): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of list) {
    const code = pick(item)
    if (!code) continue
    map.set(code, (map.get(code) ?? 0) + 1)
  }
  return map
}

/** 把基线排行与本机计数合并，按合并后的总量重算占比并重新排序 */
function mergeRanking(baselineItems: RankedItem[], localCounts: Map<string, number>): RankedItem[] {
  const merged = new Map<string, number>()
  for (const item of baselineItems) {
    merged.set(item.code, item.count)
  }
  for (const [code, count] of localCounts) {
    merged.set(code, (merged.get(code) ?? 0) + count)
  }

  const total = [...merged.values()].reduce((sum, n) => sum + n, 0)
  return [...merged.entries()]
    .map(([code, count]) => ({
      code,
      count,
      percent: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}

function countWithin(list: LocalSubmission[], sinceMs: number): number {
  const threshold = Date.now() - sinceMs
  return list.filter((item) => {
    const ts = Date.parse(item.submittedAt)
    return Number.isFinite(ts) && ts >= threshold
  }).length
}

function startOfTodayMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export interface StatsEnvelope<T> {
  data: T
  updatedAt: string
}

/** 等价于原 GET /api/stats/overview */
export function getOverviewResponse(): StatsEnvelope<OverviewData> {
  const local = getLocalSubmissions()
  const localToday = local.filter((item) => {
    const ts = Date.parse(item.submittedAt)
    return Number.isFinite(ts) && ts >= startOfTodayMs()
  }).length

  return {
    data: {
      // 总量 = 上游快照 + 本机新增，语义上仍是「累计参与人次」
      totalSubmissions: baseline.overview.totalSubmissions + local.length,
      // 当日 / 近 24 小时只统计本机，基线里的日计数器早已过期，拿来展示是误导
      todaySubmissions: localToday,
      last24hSubmissions: countWithin(local, 24 * 60 * 60 * 1000),
    },
    updatedAt: baseline.capturedAt,
  }
}

/** 等价于原 GET /api/stats/archetypes */
export function getArchetypesResponse(): StatsEnvelope<{ items: RankedItem[] }> {
  const items = mergeRanking(baseline.archetypes, countBy(getLocalSubmissions(), (i) => i.archetypeCode))
  return { data: { items }, updatedAt: baseline.capturedAt }
}

/** 等价于原 GET /api/stats/characters */
export function getCharactersResponse(): StatsEnvelope<{ items: RankedItem[] }> {
  const items = mergeRanking(baseline.characters, countBy(getLocalSubmissions(), (i) => i.characterCode))
  return { data: { items }, updatedAt: baseline.capturedAt }
}

/** 等价于原 GET /api/stats/result —— 结果页「有多少人和你一样」 */
export function getResultStats(characterCode: string, archetypeCode: string): ResultStats {
  const characters = getCharactersResponse().data.items
  const archetypes = getArchetypesResponse().data.items
  const overview = getOverviewResponse().data

  const total = overview.totalSubmissions || 1
  const characterIndex = characters.findIndex((item) => item.code === characterCode)
  const archetypeIndex = archetypes.findIndex((item) => item.code === archetypeCode)
  const sameCharacterCount = characterIndex >= 0 ? characters[characterIndex].count : 0
  const sameArchetypeCount = archetypeIndex >= 0 ? archetypes[archetypeIndex].count : 0

  return {
    totalSubmissions: overview.totalSubmissions,
    sameCharacterCount,
    sameCharacterPercent: Math.round((sameCharacterCount / total) * 10000) / 100,
    sameArchetypeCount,
    sameArchetypePercent: Math.round((sameArchetypeCount / total) * 10000) / 100,
    characterRank: characterIndex >= 0 ? characterIndex + 1 : null,
    archetypeRank: archetypeIndex >= 0 ? archetypeIndex + 1 : null,
  }
}

/** 统计页顶部横幅要展示的元信息 */
export function getDataSourceMeta(): { source: string; upstreamRepo: string; capturedAt: string; localCount: number } {
  return {
    source: baseline.source,
    upstreamRepo: baseline.upstreamRepo,
    capturedAt: baseline.capturedAt,
    localCount: getLocalSubmissions().length,
  }
}
