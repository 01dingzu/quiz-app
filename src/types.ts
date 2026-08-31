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

export const SUBJECTS: Subject[] = ['数据结构', '计算机组成原理', '操作系统', '计算机网络']
export const YEARS = Array.from({ length: 16 }, (_, i) => 2009 + i)
export const KEYS: AnswerKey[] = ['A', 'B', 'C', 'D']
