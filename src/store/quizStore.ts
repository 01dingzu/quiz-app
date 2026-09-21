import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Answer,
  AttemptRecord,
  Paper,
  Question,
  Subject,
} from '../types'
import { PAPER_DEFAULT_SCORE, PAPER_EXAM, PAPER_KPI, PAPERS, SUBJECTS, YEARS, paperOfSubject, sm2Update } from '../types'
import raw from '../data/questions.json'
import rawApplied from '../data/applied.json'
import rawPolitics from '../data/politics.json'
import rawMath from '../data/math.json'
import rawEnglish from '../data/english.json'
import { isMissingImg } from '../lib/missingImg'
import { normalizeAnswer, normalizeBank } from '../lib/normalize'
import { gradeAnswer } from '../lib/grade'

/**
 * 题库：归一化后的可用题。
 * - `questions.json`：2009–2024 单选 596 题（无 type 字段，自动归入 single 分支）
 * - `applied.json`：2009–2024 综合应用题第 41–47 题（applied 分支，含小问与参考要点）
 * - `politics.json`：2010–2024 政治客观题 495 题（240 单选 + 255 多选）
 * - `math.json`：2010–2025 数学一客观题（124 选择 + 95 填空；归一时剔除 1 道空选项题 → 218）
 * - `english.json`：2010–2023 英语一客观题 560 题（完形 280 + 阅读 Part A 280），
 *   带 `materials` 共享长文（70 篇）与题目上的 `materialId`
 *
 * 五条数据各自的 schema 都是原样保留的，靠 normalizeQuestion 在读入时归入判别联合，
 * 因此任何一条的字段变动都不会污染另外几条。
 */
export const BANK: Question[] = [
  ...normalizeBank(raw),
  ...normalizeBank(rawApplied),
  ...normalizeBank(rawPolitics),
  ...normalizeBank(rawMath),
  ...normalizeBank((rawEnglish as { questions?: unknown }).questions),
]

/** 共享长文表（英语一）：id → 正文。完形 1 篇/年、阅读 4 篇/年 */
export const MATERIALS: Record<string, string> =
  (rawEnglish as { materials?: Record<string, string> }).materials ?? {}

/** 408 单一选择题池（模拟考试 408 用） */
export const EXAM_POOL: Question[] = BANK.filter((q) => q.type === 'single' && q.paper === '408')

/** 取题所属试卷（存量 408 数据不带 paper，由 normalize 补齐；这里再兜一层） */
export function paperOfQuestion(q: Question): Paper {
  return (q.paper ?? paperOfSubject(q.subject)) as Paper
}

export function getQuestion(qid: string): Question | undefined {
  return BANK.find((q) => q.id === qid)
}

export interface SessionFilter {
  /**
   * 试卷。可选是为了兼容已持久化的旧 filter（没有这个字段）——
   * 缺省一律按 '408' 处理，老用户行为完全不变，无需写 migrate。
   */
  paper?: Paper
  years: number[] // 空数组 = 该试卷全部年份
  subjects: Subject[] // 空数组 = 该试卷全部科目
  shuffle: boolean
}

const DEFAULT_FILTER: SessionFilter = { paper: '408', years: [], subjects: [], shuffle: false }

/** 该筛选条件所属试卷 */
export function paperOfFilter(f: SessionFilter): Paper {
  return f.paper ?? '408'
}

/** 某试卷在题库中实际有数据的年份（升序）—— 各试卷年份区间不同，不能共用 YEARS */
export function paperYears(paper: Paper): number[] {
  return Array.from(
    new Set(BANK.filter((q) => paperOfQuestion(q) === paper).map((q) => q.year)),
  ).sort((a, b) => a - b)
}

/** 某试卷在题库中实际有数据的细分科目（按试卷声明的科目顺序） */
export function paperSubjects(paper: Paper): string[] {
  const present = new Set(BANK.filter((q) => paperOfQuestion(q) === paper).map((q) => q.subject))
  return paperSubjectsOrder(paper).filter((s) => present.has(s as Subject))
}

/** 各试卷的细分科目声明顺序 */
function paperSubjectsOrder(paper: Paper): string[] {
  switch (paper) {
    case '408': return [...SUBJECTS]
    case '政治': return ['马原', '毛中特', '史纲', '思修法纪', '时政']
    case '数学一': return ['高等数学', '线性代数', '概率统计']
    case '英语一': return ['完形填空', '阅读理解', '新题型']
  }
}

/** 题库中已收录数据的试卷（切换器只列这些） */
export function availablePapers(): Paper[] {
  return PAPERS.filter((p) => BANK.some((q) => paperOfQuestion(q) === p))
}

function filterQuestions(f: SessionFilter): Question[] {
  const paper = paperOfFilter(f)
  return BANK.filter(
    (q) =>
      paperOfQuestion(q) === paper &&
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

/** 将跳过的题排到会话最前（保持各自相对顺序）；无跳过题或不在会话内则原样返回 */
function reorderWithSkipped(session: string[], skipped: string[]): string[] {
  if (skipped.length === 0) return session
  const skipSet = new Set(skipped)
  const head = session.filter((id) => skipSet.has(id))
  if (head.length === 0) return session
  const tail = session.filter((id) => !skipSet.has(id))
  return [...head, ...tail]
}

/**
 * 按当前筛选所属试卷的真实结构组卷。
 * 408 走 bySubject（各科真实比例）；政治 / 数学一 / 英语一 走 slots（按题型或科目配比）。
 * 返回空数组 = 该试卷未定义蓝图，或筛完后一题都抽不到。
 */
export function buildPaperExam(f: SessionFilter): Question[] {
  const bp = PAPER_EXAM[paperOfFilter(f)]
  if (!bp) return []
  const pool = filterQuestions(f)
  const out: Question[] = []

  if (bp.bySubject) {
    for (const s of SUBJECTS) {
      const sub = pool.filter((q) => q.type === 'single' && q.subject === s)
      out.push(...shuffle(sub).slice(0, bp.bySubject[s]))
    }
    return out
  }

  for (const slot of bp.slots) {
    const sub = slot.subject
      ? pool.filter((q) => q.type === slot.type && q.subject === slot.subject)
      : pool.filter((q) => q.type === slot.type)
    out.push(...shuffle(sub).slice(0, slot.count))
  }
  return out
}

export interface ExamSlotAvail {
  label: string
  need: number
  have: number
  ok: boolean
}

const TYPE_LABEL: Record<string, string> = {
  single: '单项选择',
  multi: '多项选择',
  blank: '填空题',
  applied: '综合应用题',
}

/** 组卷可行性：当前筛选下每个槽位的需求量 vs 题库可用量（首页据此禁用按钮） */
export function examAvailability(f: SessionFilter): ExamSlotAvail[] {
  const bp = PAPER_EXAM[paperOfFilter(f)]
  if (!bp) return []
  const pool = filterQuestions(f)
  if (bp.bySubject) {
    return SUBJECTS.map((s) => {
      const need = bp.bySubject![s]
      const have = pool.filter((q) => q.type === 'single' && q.subject === s).length
      return { label: s, need, have, ok: have >= need }
    })
  }
  return bp.slots.map((sl) => {
    const have = (
      sl.subject
        ? pool.filter((q) => q.type === sl.type && q.subject === sl.subject)
        : pool.filter((q) => q.type === sl.type)
    ).length
    const label = sl.subject ?? TYPE_LABEL[sl.type] ?? sl.type
    return { label, need: sl.count, have, ok: have >= sl.count }
  })
}

/** 该试卷的组卷题量（各槽位需求之和） */
export function examQuestionCount(paper: Paper): number {
  const bp = PAPER_EXAM[paper]
  if (!bp) return 0
  if (bp.bySubject) return Object.values(bp.bySubject).reduce((a, b) => a + b, 0)
  return bp.slots.reduce((a, s) => a + s.count, 0)
}

/**
 * 组卷满分**估算**。
 * 不写死分值：题目自带 score（政治单选 1 / 多选 2；数学逐题分值随大纲版本变化，
 * 2020 及以前每题 4 分、2021 起每题 5 分），这里按当前筛选题库中该槽位的平均分值估算。
 *
 * 需求数要按题库实际可用量截断 —— 例如只筛 2018 年时，数学一当年只有 8 道选择题，
 * 蓝图要 10 道也抽不出来，此时满分应按 8 题算而不是 10 题。
 * 真实满分由 Practice 按实际抽到的题累加。
 */
export function examFullScore(f: SessionFilter): number {
  const paper = paperOfFilter(f)
  const bp = PAPER_EXAM[paper]
  if (!bp) return 0
  const pool = filterQuestions(f)
  const dflt = PAPER_DEFAULT_SCORE[paper]
  const avgOf = (sub: Question[]) =>
    sub.length ? sub.reduce((a, q) => a + (q.score ?? dflt), 0) / sub.length : dflt

  if (bp.bySubject) {
    const sin = pool.filter((q) => q.type === 'single')
    return Math.round(avgOf(sin) * Math.min(examQuestionCount(paper), sin.length))
  }

  let sum = 0
  for (const slot of bp.slots) {
    const sub = slot.subject
      ? pool.filter((q) => q.type === slot.type && q.subject === slot.subject)
      : pool.filter((q) => q.type === slot.type)
    sum += avgOf(sub) * Math.min(slot.count, sub.length)
  }
  return Math.round(sum)
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
  picked: Record<string, Answer> // 会话内已作答值（qid -> Answer）
  /** 跳过的题 id（持久化，作答后自动移除；再次打开练习时优先展示） */
  skipped: string[]
  /** 手动从归档移出的题 id（覆盖列表：这些题即使答对也继续出现在自由练习中） */
  unarchived: string[]
  setFilter: (patch: Partial<SessionFilter>) => void
  /** 切换试卷：年份与科目筛选必须一并清空（跨试卷的科目名不通用） */
  setPaper: (p: Paper) => void
  startSession: () => void
  /** 按当前试卷的真实结构组卷；durationMin=0 表示不限时 */
  startExam: (durationMin: number) => void
  startReview: () => void
  tickExam: () => void
  submitAnswer: (qid: string, a: Answer) => void
  go: (delta: number) => void
  /** 跳过当前题：标记 + 前进到下一题 */
  skipCurrent: () => void
  /** 恢复会话时重排：跳过的题排到最前，并定位到第一道未答的跳过题（无跳过题则不动） */
  resumeSession: () => void
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

  // ---- 缺图反馈收集 ----
  /** 用户确认上报的缺图/缺表题 qid（持久化，供后续统一补图） */
  imgReports: string[]
  reportMissingImg: (qid: string) => void
  unreportMissingImg: (qid: string) => void

  // ---- 归档 ----
  /** 将题移出归档（重新出现在自由练习中） */
  unarchiveQuestion: (qid: string) => void
  /** 将题重新归档（从 unarchived 覆盖列表移除） */
  rearchiveQuestion: (qid: string) => void
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
  | 'skipped'
  | 'examRemainSec'
  | 'examStartTs'
  | 'imgReports'
  | 'unarchived'
>

/** 存储版本：v0 的 picked 是裸 AnswerKey 字符串，v1 起是判别联合 */
const STORE_VERSION = 1

/**
 * 旧数据迁移：把 v0 里所有裸 'A' 字符串的作答值转成 { t:'single', k:'A' }。
 * 保持 storage name 不变，因此迁移后老用户的错题本/历史/收藏全部保留。
 */
function migratePersisted(persisted: unknown, version: number): Persisted {
  const s = persisted as Record<string, unknown> | null | undefined
  if (!s || version >= STORE_VERSION) return (s ?? {}) as unknown as Persisted

  if (s.picked && typeof s.picked === 'object') {
    const next: Record<string, Answer> = {}
    for (const [qid, v] of Object.entries(s.picked as Record<string, unknown>)) {
      const a = normalizeAnswer(v)
      if (a) next[qid] = a
    }
    s.picked = next
  }

  if (s.attempts && typeof s.attempts === 'object') {
    for (const rec of Object.values(s.attempts as Record<string, unknown>)) {
      if (!rec || typeof rec !== 'object') continue
      const r = rec as Record<string, unknown>
      const a = normalizeAnswer(r.picked)
      if (a) r.picked = a
    }
  }

  if (Array.isArray(s.history)) {
    for (const rec of s.history as unknown[]) {
      if (!rec || typeof rec !== 'object') continue
      const r = rec as Record<string, unknown>
      const a = normalizeAnswer(r.picked)
      if (a) r.picked = a
    }
  }

  return s as unknown as Persisted
}

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
      skipped: [],
      unarchived: [],
      attempts: {},
      flagged: {},
      history: [],
      imgReports: [],

      setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),

      setPaper: (p) => set({ filter: { paper: p, years: [], subjects: [], shuffle: get().filter.shuffle } }),

      startSession: () => {
        const { filter, unarchived, attempts } = get()
        // 自由练习：过滤已归档的题（做过且从没错过 / 已复习毕业），手动移出的除外
        const qs = filterQuestions(filter).filter(
          (q) => !isArchivedAttempt(attempts[q.id]) || unarchived.includes(q.id),
        )
        if (qs.length === 0) return
        const seq = (filter.shuffle ? shuffle(qs) : qs).map((q) => q.id)
        set({
          mode: 'practice',
          session: reorderWithSkipped(seq, get().skipped),
          index: 0,
          picked: {},
          examRemainSec: 0,
          examStartTs: null,
        })
      },

      startExam: (durationMin) => {
        const qs = buildPaperExam(get().filter)
        if (qs.length === 0) return
        set({
          mode: 'exam',
          session: reorderWithSkipped(qs.map((q) => q.id), get().skipped),
          index: 0,
          picked: {},
          examRemainSec: durationMin === 0 ? -1 : durationMin * 60,
          examStartTs: Date.now(),
        })
      },

      startReview: () => {
        // 今日复习：错题立即进队列 + 收藏题按 SM-2 节奏到期
        const { attempts, flagged } = get()
        const ids = dueIds(attempts, flagged)
        if (ids.length === 0) return
        set({
          mode: 'review',
          session: reorderWithSkipped(ids, get().skipped),
          index: 0,
          picked: {},
          examRemainSec: 0,
          examStartTs: null,
        })
      },

      tickExam: () => {
        const { mode, examRemainSec } = get()
        if (mode !== 'exam' || examRemainSec <= 0) return
        set({ examRemainSec: examRemainSec - 1 })
      },

      submitAnswer: (qid, a) => {
        const { picked, attempts, flagged, history, skipped } = get()
        if (picked[qid]) return
        const q = getQuestion(qid)
        if (!q) return
        const grade = gradeAnswer(q, a)
        if (!grade.answered) return
        const correct = grade.correct
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
          picked: a,
          correct,
          ratio: grade.ratio,
          flagged: flagged[qid] ?? null,
          ts: now,
          tags: prev?.tags ?? [],
          srs: newSrs,
        }
        set({
          picked: { ...picked, [qid]: a },
          attempts: { ...attempts, [qid]: rec },
          history: [...history, rec],
          skipped: skipped.filter((id) => id !== qid), // 作答后不再算跳过
        })
      },

      go: (delta) => {
        const { session, index } = get()
        if (!session) return
        const ni = Math.min(Math.max(index + delta, 0), session.length - 1)
        set({ index: ni })
      },

      skipCurrent: () => {
        const { session, index, picked, skipped } = get()
        if (!session || session.length === 0) return
        const qid = session[index]
        if (!qid || picked[qid]) return // 已答的题无需跳过
        const ns = skipped.includes(qid) ? skipped : [...skipped, qid]
        const ni = Math.min(index + 1, session.length - 1)
        set({ skipped: ns, index: ni })
      },

      resumeSession: () => {
        const { session, skipped, picked } = get()
        if (!session || session.length === 0) return
        const skipSet = new Set(skipped)
        // 无跳过题（或全部已答）→ 保持现状，不打断用户位置
        if (!session.some((id) => skipSet.has(id) && !picked[id])) return
        const reordered = reorderWithSkipped(session, skipped)
        // 定位到第一道未答的跳过题；若都已答，则第一道未答题
        let ni = reordered.findIndex((id) => skipSet.has(id) && !picked[id])
        if (ni === -1) ni = reordered.findIndex((id) => !picked[id])
        if (ni === -1) ni = 0
        set({ session: reordered, index: ni })
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
            picked: { t: 'single', k: 'A' }, correct: false, flagged: true, ts: Date.now(),
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

      clearHistory: () => set({ history: [], attempts: {}, flagged: {}, unarchived: [] }),

      reportMissingImg: (qid) => {
        const { imgReports } = get()
        if (imgReports.includes(qid) || !getQuestion(qid)) return
        set({ imgReports: [...imgReports, qid] })
      },

      unreportMissingImg: (qid) => {
        set({ imgReports: get().imgReports.filter((id) => id !== qid) })
      },

      unarchiveQuestion: (qid) => {
        if (!getQuestion(qid)) return
        const { unarchived } = get()
        if (unarchived.includes(qid)) return
        set({ unarchived: [...unarchived, qid] })
      },

      rearchiveQuestion: (qid) => {
        set({ unarchived: get().unarchived.filter((id) => id !== qid) })
      },
    }),
    {
      name: 'quiz-app:v1', // 保持 v1 不变：改名会导致老用户错题本/历史数据丢失
      version: STORE_VERSION,
      migrate: migratePersisted,
      partialize: (s) => ({
        attempts: s.attempts,
        flagged: s.flagged,
        history: s.history,
        filter: s.filter,
        mode: s.mode,
        session: s.session,
        index: s.index,
        picked: s.picked,
        skipped: s.skipped,
        examRemainSec: s.examRemainSec,
        examStartTs: s.examStartTs,
        imgReports: s.imgReports,
        unarchived: s.unarchived,
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
  /** 会话中未答的跳过题数（>0 表示继续后优先展示） */
  skipped: number
} | null {
  const { mode, session, index, picked, skipped } = useQuiz.getState()
  if (!session || session.length === 0 || index < 0 || index >= session.length) return null
  const done = session.filter((id) => picked[id]).length
  // 已答完所有题 → 直接展示结果页，无需恢复入口
  if (done >= session.length) return null
  const label =
    mode === 'exam' ? '模拟考试' : mode === 'review' ? '今日复习' : '自由练习'
  const skipSet = new Set(skipped)
  const skippedCount = session.filter((id) => skipSet.has(id) && !picked[id]).length
  return { mode, total: session.length, index, done, label, skipped: skippedCount }
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

/** 自动检测到的缺图/缺表题（题干引用图但题库无图），按年份倒序；传 paper 则只取该试卷 */
export function missingImgQuestions(paper?: Paper): Question[] {
  return BANK.filter((q) => (paper ? paperOfQuestion(q) === paper : true))
    .filter(isMissingImg)
    .sort((a, b) => b.year - a.year || a.no - b.no)
}

/** 用户手动上报的缺图题列表（含自动检测与手动补充） */
export function reportedMissingImgQuestions(): Question[] {
  const { imgReports } = useQuiz.getState()
  return imgReports
    .map((id) => getQuestion(id))
    .filter((q): q is Question => !!q)
    .sort((a, b) => b.year - a.year || a.no - b.no)
}

// ===== 归档 =====

/**
 * 归档判定（基于最近一次作答）：
 *  - 最近答对 且 无 SRS 跟踪（从没错过、也未被收藏）→ 归档
 *  - 最近答对 且 SRS 已毕业（曾错过但复习满 5 次毕业）→ 归档
 *  - 最近答错 / SRS 未毕业（还在复习队列）→ 不归档
 */
export function isArchivedAttempt(a: AttemptRecord | undefined): boolean {
  if (!a) return false
  if (!a.correct) return false
  if (!a.srs) return true
  return a.srs.graduated
}

/** 某题当前是否处于归档状态（已归档且未被手动移出） */
export function isArchivedQuestion(qid: string): boolean {
  const { attempts, unarchived } = useQuiz.getState()
  if (unarchived.includes(qid)) return false
  return isArchivedAttempt(attempts[qid])
}

/** 已归档题目列表（按年份倒序，题号升序）；传 paper 则只取该试卷 */
export function archivedQuestions(paper?: Paper): Question[] {
  return BANK.filter(
    (q) => (paper ? paperOfQuestion(q) === paper : true) && isArchivedQuestion(q.id),
  ).sort((a, b) => b.year - a.year || a.no - b.no)
}

/** 已归档题数（手动移出的题被排除）；传 paper 则只统计该试卷 */
export function archivedCount(paper?: Paper): number {
  const { attempts, unarchived } = useQuiz.getState()
  const unarchivedSet = new Set(unarchived)
  let n = 0
  for (const a of Object.values(attempts)) {
    if (unarchivedSet.has(a.qid) || !isArchivedAttempt(a)) continue
    if (paper) {
      const q = getQuestion(a.qid)
      if (!q || paperOfQuestion(q) !== paper) continue
    }
    n++
  }
  return n
}

/**
 * 分试卷客观题正确率（统计页 KPI）。
 * 口径用 `attempts`（每题最近一次）而非 `history`（含重做）——
 * KPI 问的是"现在还会不会"，不是"历史上错过几次"。
 */
export function paperStats(): {
  paper: Paper
  total: number
  correct: number
  pct: number
  kpi: number
  gap: number
}[] {
  const { attempts } = useQuiz.getState()
  const agg = new Map<Paper, { total: number; correct: number }>()
  for (const a of Object.values(attempts)) {
    const q = getQuestion(a.qid)
    if (!q) continue
    const p = paperOfQuestion(q)
    const st = agg.get(p) ?? { total: 0, correct: 0 }
    st.total++
    if (a.correct) st.correct++
    agg.set(p, st)
  }
  return PAPERS.filter((p) => agg.has(p)).map((p) => {
    const st = agg.get(p)!
    const pct = st.total > 0 ? st.correct / st.total : 0
    const kpi = PAPER_KPI[p]
    return { paper: p, total: st.total, correct: st.correct, pct, kpi, gap: pct - kpi }
  })
}

/** 某筛选条件下自由练习可用题数（已归档的题排除，手动移出的除外） */
export function practiceCount(f: SessionFilter): number {
  const { attempts, unarchived } = useQuiz.getState()
  return filterQuestions(f).filter(
    (q) => !isArchivedAttempt(attempts[q.id]) || unarchived.includes(q.id),
  ).length
}

export { SUBJECTS, YEARS }
