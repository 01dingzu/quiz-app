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
