export type Subject = '数据结构' | '计算机组成原理' | '操作系统' | '计算机网络'
export type AnswerKey = 'A' | 'B' | 'C' | 'D'

export interface Question {
  id: string
  year: number
  no: number
  subject: Subject
  stem: string
  options: Record<AnswerKey, string>
  answer: AnswerKey
  explanation: string
}

/** SRS 间隔重复状态（SM-2 简化版） */
export interface SrsState {
  /** 难度系数（下限 1.3，上限 5.0；答对 +0.1、答错 -0.2） */
  easeFactor: number
  /** 当前间隔（天） */
  interval: number
  /** 连续答对次数 */
  reps: number
  /** 下次复习时间戳 */
  nextReview: number
  /** 是否已毕业（reps>=5 且 interval>=21） */
  graduated: boolean
}

/** 一次作答记录（历史 + 错题统计共用） */
export interface AttemptRecord {
  qid: string
  year: number
  no: number
  subject: Subject
  picked: AnswerKey
  correct: boolean
  /** 手动标记：true=收藏/存疑，false=普通，null=未手动标记 */
  flagged: boolean | null
  ts: number
  /** 自定义标签（收藏夹分类） */
  tags?: string[]
  /** SRS 复习状态（错题/收藏才会有） */
  srs?: SrsState
}

/** 模拟考试配置 */
export interface ExamConfig {
  /** 各科抽题数（按 408 真实比例：数据结构 11 / 计组 11 / 操作系统 10 / 计网 8） */
  counts: Record<Subject, number>
  /** 时长（分钟）；0 = 不计时 */
  durationMin: number
}

export const SUBJECTS: Subject[] = ['数据结构', '计算机组成原理', '操作系统', '计算机网络']
export const YEARS = Array.from({ length: 16 }, (_, i) => 2009 + i)
export const KEYS: AnswerKey[] = ['A', 'B', 'C', 'D']

/** 408 真实单选比例：1-11 数据结构 / 12-22 计组 / 23-32 操作系统 / 33-40 计网 */
export const EXAM_RATIO: Record<Subject, number> = {
  '数据结构': 11,
  '计算机组成原理': 11,
  '操作系统': 10,
  '计算机网络': 8,
}
/** 单选每题 2 分，共 80 分 */
export const EXAM_PER_Q_SCORE = 2

// ===== SM-2 间隔重复（Anki 风格简化版） =====

/** SM-2 默认参数 */
export const SRS_DEFAULT: Omit<SrsState, 'nextReview' | 'graduated'> = {
  easeFactor: 2.5,
  interval: 0,
  reps: 0,
}

/** 毕业阈值：连续答对 5 次且间隔 ≥ 21 天 */
export const SRS_GRADUATE_REPS = 5
export const SRS_GRADUATE_INTERVAL = 21
const MIN_EF = 1.3
const MAX_EF = 5.0
const ONE_DAY = 24 * 60 * 60 * 1000

/**
 * SM-2 单步更新
 * @param prev  上次状态（null = 新题）
 * @param correct  本次答题是否正确
 * @param now     本次答题时间戳
 */
export function sm2Update(prev: SrsState | null, correct: boolean, now: number): SrsState {
  const base = prev ?? { ...SRS_DEFAULT, nextReview: now, graduated: false }
  let { easeFactor, interval, reps } = base
  if (correct) {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 3
    else interval = Math.round(interval * easeFactor)
    easeFactor = Math.min(MAX_EF, easeFactor + 0.1)
  } else {
    reps = 0
    interval = 1
    easeFactor = Math.max(MIN_EF, easeFactor - 0.2)
  }
  const graduated = reps >= SRS_GRADUATE_REPS && interval >= SRS_GRADUATE_INTERVAL
  return { easeFactor, interval, reps, nextReview: now + interval * ONE_DAY, graduated }
}

/** 距下次复习的天数（负数=已到期，正数=还需等） */
export function daysUntil(nextReview: number, now: number = Date.now()): number {
  return Math.round((nextReview - now) / ONE_DAY)
}

/** "下次复习"的人类可读文案 */
export function reviewLabel(srs: SrsState | undefined, now: number = Date.now()): string {
  if (!srs) return '新题'
  if (srs.graduated) return '已毕业 ✓'
  const d = daysUntil(srs.nextReview, now)
  if (d < 0) return `逾期 ${-d} 天`
  if (d === 0) return '今天复习'
  if (d === 1) return '明天复习'
  return `${d} 天后复习`
}
