import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnswerKey, AttemptRecord, Question, Subject } from '../types'
import { SUBJECTS, YEARS } from '../types'
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

interface QuizState {
  // ---- 练习会话 ----
  filter: SessionFilter
  session: string[] | null // 当前会话题目 id 序列（null = 未开始）
  index: number
  picked: Record<string, AnswerKey> // 会话内已选答案（qid -> 选择）
  setFilter: (patch: Partial<SessionFilter>) => void
  startSession: () => void
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
        set({ session: seq, index: 0, picked: {} })
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

      clearSession: () => set({ session: null, index: 0, picked: {} }),

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
