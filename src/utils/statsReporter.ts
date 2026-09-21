// 统计上报工具 —— 纯静态部署版本。
//
// 上游通过 /api/submit、/api/stats/*、/api/feedback 打到 Cloudflare Pages Functions，
// 这里全部改为浏览器本地（详见 utils/localBackend.ts 的说明）。
// 对外函数签名保持不变，调用方（ResultPage.vue）无需感知实现变化。

import {
  getResultStats,
  recordFeedback,
  recordSubmission,
  type ResultStats,
} from './localBackend'

export type { ResultStats }

// 版本号由 vite define 从 package.json 注入，保证与发版一致
const APP_VERSION = __APP_VERSION__

export interface SubmitPayload {
  submissionId: string
  appVersion: string
  archetypeCode: string
  characterCode: string
  predictedMbti?: string
  dimensionScores: {
    ei?: number
    sn?: number
    tf?: number
    jp?: number
  }
  durationMs?: number
  answers?: Array<{ questionId: string; answerValue: number }>
}

export interface FeedbackPayload {
  submissionId: string
  selfMbti: string
  confidence: number
  note?: string
  appVersion: string
  turnstileToken?: string
  answers?: Array<{ questionId: string; answerValue: number }>
  predictedMbti?: string
  archetypeCode?: string
  characterCode?: string
}

/**
 * 获取结果页统计数据（基线快照 + 本机记录）
 * 保持 Promise 形态，调用方原有的 .then() 写法不受影响
 */
export async function fetchResultStats(
  characterCode: string,
  archetypeCode: string,
): Promise<ResultStats | null> {
  try {
    return getResultStats(characterCode, archetypeCode)
  } catch {
    return null
  }
}

/**
 * 记录问卷结果到本机
 * 纯本地写入，同步完成；异常完全吞掉，绝不阻碍页面
 */
export function reportResultInBackground(payload: Omit<SubmitPayload, 'appVersion'>) {
  try {
    recordSubmission({
      submissionId: payload.submissionId,
      characterCode: payload.characterCode,
      archetypeCode: payload.archetypeCode,
      predictedMbti: payload.predictedMbti,
      dimensionScores: payload.dimensionScores,
      durationMs: payload.durationMs,
      appVersion: APP_VERSION,
    })
  } catch (err) {
    console.error('❌ reportResultInBackground error:', err)
  }
}

/**
 * 用户主动提交 MBTI 反馈
 * 纯静态部署下只写入本机记录，不入任何服务端；返回 true/false 供 UI 提示
 */
export async function submitFeedback(payload: Omit<FeedbackPayload, 'appVersion'>): Promise<boolean> {
  try {
    return recordFeedback({
      submissionId: payload.submissionId,
      selfMbti: payload.selfMbti,
      confidence: payload.confidence,
      note: payload.note,
      appVersion: APP_VERSION,
    })
  } catch (err) {
    console.error('❌ submitFeedback error:', err)
    return false
  }
}
