import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AnswerKey, AttemptRecord, ExamConfig, Question, Subject } from '../types'
import { EXAM_RATIO, SUBJECTS, YEARS, sm2Update } from '../types'
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
  return out
}

interface QuizState {
  // ---- 练习会话 ----
  filter: SessionFilter
  /** 模式：'practice' 自由练习 / 'exam' 模拟考试 / 'review' 今日复习 */
  mode: 'practice' | 'exam' | 'review'
  /** 考试剩余秒数（exam 模式）：-1 = 不限时；0 = 限时已耗尽；>0 = 倒计时中 */
  examRemainSec: number
  /** 考试开始时间戳（用于算分批） */
  examStartTs: number | null
  session: string[] | null // 当前会话题目 id 序列（null = 未开始）
  index: number
  picked: Record<string, AnswerKey> // 会话内已选答案（qid -> 选择）
  setFilter: (patch: Partial<SessionFilter>) => void
  startSession: () => void
  startExam: (cfg: ExamConfig) => void
  startReview: () => void
  tickExam: () => void
  pick: (qid: string, key: AnswerKey) => void
  go: (delta: number) => void
  /** 恢复会话时校准考试倒计时（扣除页面在后台期间流逝的时间） */
  reconcileExam: () => void
  clearSession: () => void

  // ---- 持久化：attempts/flagged/history + srs + tags ----
  attempts: Record<string, AttemptRecord>
  flagged: Record<string, boolean>
  history: AttemptRecord[]
  toggleFlag: (qid: string) => void
  addTag: (qid: string, tag: string) => void
  removeTag: (qid: string, tag: string) => void
  clearWrong: () => void
  clearHistory: () => void
}

/** 持久化范围：作答记录/收藏 + 会话进度（练习中途可恢复） + 筛选设置 */
type Persisted = Pick<
  QuizState,
  | 'attempts'
  | 'flagged'
  | 'history'
  | 'filter'
  | 'mode'
  | 'session'
  | 'index'
  | 'picked'
  | 'examRemainSec'
  | 'examStartTs'
>

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

      startReview: () => {
        // 今日复习：错题立即进队列 + 收藏题按 SM-2 节奏到期
        const { attempts, flagged } = get()
        const ids = dueIds(attempts, flagged)
        if (ids.length === 0) return
        set({ mode: 'review', session: ids, index: 0, picked: {}, examRemainSec: 0, examStartTs: null })
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
        const prev = attempts[qid]
        const now = Date.now()
        // 追踪 SRS：错题/收藏题/已追踪过 SRS 的题都更新
        // 规则：题已在 srs 跟踪中（prev.srs 存在）→ 继续；本次答错 → 启动；本次答对且被收藏 → 启动
        const trackSrs = !!prev?.srs || !correct || (flagged[qid] ?? false)
        const newSrs = trackSrs ? sm2Update(prev?.srs ?? null, correct, now) : prev?.srs
        const rec: AttemptRecord = {
          qid,
          year: q.year,
          no: q.no,
          subject: q.subject,
          picked: key,
          correct,
          flagged: flagged[qid] ?? null,
          ts: now,
          tags: prev?.tags ?? [],
          srs: newSrs,
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

      reconcileExam: () => {
        const { mode, examStartTs, examRemainSec } = get()
        if (mode !== 'exam' || !examStartTs || examRemainSec <= 0) return
        // 扣除页面在后台/刷新期间流逝的时间，校准剩余秒数
        const elapsed = Math.floor((Date.now() - examStartTs) / 1000)
        if (elapsed <= 0) return
        set({
          examRemainSec: Math.max(0, examRemainSec - elapsed),
          examStartTs: Date.now(), // 校准后重新起算，避免重复扣减
        })
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

      addTag: (qid, tag) => {
        const t = tag.trim()
        if (!t) return
        const att = get().attempts[qid]
        if (!att) {
          // 未答过的题也允许加标签（创建空记录）
          const q = getQuestion(qid)
          if (!q) return
          const newRec: AttemptRecord = {
            qid, year: q.year, no: q.no, subject: q.subject,
            picked: 'A', correct: false, flagged: true, ts: Date.now(),
            tags: [t], srs: undefined,
          }
          set({ attempts: { ...get().attempts, [qid]: newRec } })
          return
        }
        const tags = att.tags ?? []
        if (tags.includes(t)) return
        set({ attempts: { ...get().attempts, [qid]: { ...att, tags: [...tags, t] } } })
      },

      removeTag: (qid, tag) => {
        const att = get().attempts[qid]
        if (!att?.tags) return
        const tags = att.tags.filter((x) => x !== tag)
        set({ attempts: { ...get().attempts, [qid]: { ...att, tags } } })
      },

      clearWrong: () => {
        const attempts = { ...get().attempts }
        for (const k of Object.keys(attempts)) {
          if (!attempts[k].correct) delete attempts[k]
        }
        set({ attempts })
      },

      clearHistory: () => set({ history: [], attempts: {}, flagged: {} }),
    }),
    {
      name: 'quiz-app:v1', // 保持 v1 不变：改名会导致老用户错题本/历史数据丢失
      partialize: (s) => ({
        attempts: s.attempts,
        flagged: s.flagged,
        history: s.history,
        filter: s.filter,
        mode: s.mode,
        session: s.session,
        index: s.index,
        picked: s.picked,
        examRemainSec: s.examRemainSec,
        examStartTs: s.examStartTs,
      }),
    },
  ),
)

/** 调试用：暴露 store 到 window（仅 dev/测试） */
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as any).__quiz = useQuiz
  ;(window as any).__bank = BANK
}

// ===== 派生函数 =====

/** 错题集（最近一次答错的题，按时间倒序） */
export function wrongList(): AttemptRecord[] {
  const { attempts } = useQuiz.getState()
  return Object.values(attempts)
    .filter((a) => !a.correct)
    .sort((a, b) => b.ts - a.ts)
}

/** 手动标记（收藏/存疑）列表 */
export function flaggedList(): AttemptRecord[] {
  const { attempts, flagged } = useQuiz.getState()
  return Object.keys(flagged)
    .filter((k) => flagged[k])
    .map((k) => attempts[k])
    .filter((a): a is AttemptRecord => !!a)
    .sort((a, b) => b.ts - a.ts)
}

/** 今日待复习的题 id：
 *  - 答错且未毕业 → 立即进队列（次日也持续显示直到答对）
 *  - 收藏题按 SM-2 节奏（nextReview <= now）
 *  - 两者都需未毕业
 */
export function dueIds(
  attempts: Record<string, AttemptRecord>,
  flagged: Record<string, boolean>,
  now: number = Date.now(),
): string[] {
  return Object.values(attempts)
    .filter((a) => {
      if (!a.srs || a.srs.graduated) return false
      if (!a.correct) return true
      if (flagged[a.qid] && a.srs.nextReview <= now) return true
      return false
    })
    .sort((a, b) => a.srs!.nextReview - b.srs!.nextReview)
    .map((a) => a.qid)
}

/** 今日待复习数 */
export function dueCount(
  attempts: Record<string, AttemptRecord>,
  flagged: Record<string, boolean>,
  now: number = Date.now(),
): number {
  return Object.values(attempts).filter((a) => {
    if (!a.srs || a.srs.graduated) return false
    if (!a.correct) return true
    if (flagged[a.qid] && a.srs.nextReview <= now) return true
    return false
  }).length
}

/** 可恢复的练习会话信息（用于首页"继续上次练习"入口）；无进行中会话返回 null */
export function resumeInfo(): {
  mode: 'practice' | 'exam' | 'review'
  total: number
  index: number
  done: number
  label: string
} | null {
  const { mode, session, index, picked } = useQuiz.getState()
  if (!session || session.length === 0 || index < 0 || index >= session.length) return null
  const done = session.filter((id) => picked[id]).length
  // 已答完所有题 → 直接展示结果页，无需恢复入口
  if (done >= session.length) return null
  const label =
    mode === 'exam' ? '模拟考试' : mode === 'review' ? '今日复习' : '自由练习'
  return { mode, total: session.length, index, done, label }
}

/** 全部标签（去重 + 频次倒序） */
export function allTags(attempts: Record<string, AttemptRecord>): { tag: string; count: number }[] {
  const m = new Map<string, number>()
  for (const a of Object.values(attempts)) {
    for (const t of a.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  }
  return Array.from(m.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
}

export { SUBJECTS, YEARS }
