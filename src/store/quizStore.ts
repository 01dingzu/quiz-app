import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnswerKey, AttemptRecord, ExamConfig, Question, Subject } from '../types'
import { EXAM_RATIO, SUBJECTS, YEARS } from '../types'
import raw from '../data/questions.json'

/** 题库：596 题（skip=false 的可用题） */
export const BANK: Question[] = (raw as Question[]).map((q) => q)

export function getQuestion(qid: string): Question | undefined {
  return BANK.find((q) => q.id === qid)
}

export interface SessionFilter {
  years: number[] // 空数组 = 全部
  subjects: Subject[] // 空数组 = 全部
  shuffle: boolean
}

const DEFAULT_FILTER: SessionFilter = { years: [], subjects: [], shuffle: false }

function filterQuestions(f: SessionFilter): Question[] {
  return BANK.filter(
    (q) =>
      (f.years.length === 0 || f.years.includes(q.year)) &&
      (f.subjects.length === 0 || f.subjects.includes(q.subject)),
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 按 408 真实比例组卷：从筛选题库中每科按 counts 数量随机抽题 */
export function buildExam(f: SessionFilter, counts: Record<Subject, number>): Question[] {
  const pool = filterQuestions(f)
  const out: Question[] = []
  for (const s of SUBJECTS) {
    const sub = pool.filter((q) => q.subject === s)
    out.push(...shuffle(sub).slice(0, counts[s]))
  }
  // 按 1-40 题号顺序排：数据结构 → 计组 → 操作系统 → 计网
  return out
}

interface QuizState {
  // ---- 练习会话 ----
  filter: SessionFilter
  /** 考试模式：'practice' 自由练习 / 'exam' 模拟考试 */
  mode: 'practice' | 'exam'
  /** 考试剩余秒数（exam 模式）：-1 = 不限时；0 = 限时已耗尽（强制交卷）；>0 = 倒计时中 */
  examRemainSec: number
  /** 考试开始时间戳（用于算分批） */
  examStartTs: number | null
  session: string[] | null // 当前会话题目 id 序列（null = 未开始）
  index: number
  picked: Record<string, AnswerKey> // 会话内已选答案（qid -> 选择）
  setFilter: (patch: Partial<SessionFilter>) => void
  startSession: () => void
  startExam: (cfg: ExamConfig) => void
  tickExam: () => void // 考试模式每秒调用
  pick: (qid: string, key: AnswerKey) => void
  go: (delta: number) => void
  clearSession: () => void

  // ---- 持久化（attempts: 最近一次作答；flagged: 手动标记；history: 全量历史）----
  attempts: Record<string, AttemptRecord>
  flagged: Record<string, boolean>
  history: AttemptRecord[]
  toggleFlag: (qid: string) => void
  clearWrong: () => void
  clearHistory: () => void
}

type Persisted = Pick<QuizState, 'attempts' | 'flagged' | 'history'>

export const useQuiz = create<QuizState>()(
  persist<QuizState, [], [], Persisted>(
    (set, get) => ({
      filter: DEFAULT_FILTER,
      mode: 'practice',
      examRemainSec: 0,
      examStartTs: null,
      session: null,
      index: 0,
      picked: {},
      attempts: {},
      flagged: {},
      history: [],

      setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),

      startSession: () => {
        const qs = filterQuestions(get().filter)
        if (qs.length === 0) return
        const seq = (get().filter.shuffle ? shuffle(qs) : qs).map((q) => q.id)
        set({ mode: 'practice', session: seq, index: 0, picked: {}, examRemainSec: 0, examStartTs: null })
      },

      startExam: (cfg) => {
        const qs = buildExam(get().filter, cfg.counts)
        if (qs.length === 0) return
        set({
          mode: 'exam',
          session: qs.map((q) => q.id),
          index: 0,
          picked: {},
          examRemainSec: cfg.durationMin === 0 ? -1 : cfg.durationMin * 60,
          examStartTs: Date.now(),
        })
      },

      tickExam: () => {
        const { mode, examRemainSec } = get()
        if (mode !== 'exam' || examRemainSec <= 0) return
        set({ examRemainSec: examRemainSec - 1 })
      },

      pick: (qid, key) => {
        const { picked, attempts, flagged, history } = get()
        if (picked[qid] || !getQuestion(qid)) return
        const q = getQuestion(qid)!
        const correct = key === q.answer
        const rec: AttemptRecord = {
          qid,
          year: q.year,
          no: q.no,
          subject: q.subject,
          picked: key,
          correct,
          flagged: flagged[qid] ?? null,
          ts: Date.now(),
        }
        set({
          picked: { ...picked, [qid]: key },
          attempts: { ...attempts, [qid]: rec },
          history: [...history, rec],
        })
      },

      go: (delta) => {
        const { session, index } = get()
        if (!session) return
        const ni = Math.min(Math.max(index + delta, 0), session.length - 1)
        set({ index: ni })
      },

      clearSession: () => set({ session: null, index: 0, picked: {}, mode: 'practice', examRemainSec: 0, examStartTs: null }),

      toggleFlag: (qid) => {
        const flagged = { ...get().flagged, [qid]: !get().flagged[qid] }
        set({ flagged })
        // 同步到最近一次作答记录
        const att = get().attempts[qid]
        if (att) {
          set({ attempts: { ...get().attempts, [qid]: { ...att, flagged: flagged[qid] } } })
        }
      },

      clearWrong: () => {
        // 只清错题：移除 attempts 中 correct=false 的记录（保留历史计数）
        const attempts = { ...get().attempts }
        for (const k of Object.keys(attempts)) {
          if (!attempts[k].correct) delete attempts[k]
        }
        set({ attempts })
      },

      clearHistory: () => set({ history: [], attempts: {}, flagged: {} }),
    }),
    {
      name: 'quiz-app:v1',
      partialize: (s) => ({ attempts: s.attempts, flagged: s.flagged, history: s.history }),
    },
  ),
)

/** 调试用：暴露 store 到 window（仅 dev/测试） */
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as any).__quiz = useQuiz
  ;(window as any).__bank = BANK
}
/** 派生：错题集（最近一次答错的题，按时间倒序） */
export function wrongList(): AttemptRecord[] {
  const { attempts } = useQuiz.getState()
  return Object.values(attempts)
    .filter((a) => !a.correct)
    .sort((a, b) => b.ts - a.ts)
}

/** 派生：手动标记（收藏/存疑）列表 */
export function flaggedList(): AttemptRecord[] {
  const { attempts, flagged } = useQuiz.getState()
  return Object.keys(flagged)
    .filter((k) => flagged[k])
    .map((k) => attempts[k])
    .filter((a): a is AttemptRecord => !!a)
    .sort((a, b) => b.ts - a.ts)
}

export { SUBJECTS, YEARS }
