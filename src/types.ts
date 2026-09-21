// ============================================================
// 试卷 / 科目体系
// ============================================================

/** 试卷：顶层分组（决定抽题规则、计分口径、UI 分组） */
export type Paper = '408' | '政治' | '英语一' | '数学一'

export const PAPERS: Paper[] = ['408', '政治', '英语一', '数学一']

/** 408 四科（存量科目体系，保持既有语义 —— 不要改这四项的顺序与名称） */
export type Subject408 = '数据结构' | '计算机组成原理' | '操作系统' | '计算机网络'
/** 政治细分 */
export type SubjectPolitics = '马原' | '毛中特' | '史纲' | '思修法纪' | '时政'
/** 数学一细分 */
export type SubjectMath = '高等数学' | '线性代数' | '概率统计'
/** 英语一细分 */
export type SubjectEnglish = '完形填空' | '阅读理解' | '新题型'

export type Subject = Subject408 | SubjectPolitics | SubjectMath | SubjectEnglish

/** 试卷 → 细分科目 */
export const PAPER_SUBJECTS: Record<Paper, readonly string[]> = {
  '408': ['数据结构', '计算机组成原理', '操作系统', '计算机网络'],
  '政治': ['马原', '毛中特', '史纲', '思修法纪', '时政'],
  '数学一': ['高等数学', '线性代数', '概率统计'],
  '英语一': ['完形填空', '阅读理解', '新题型'],
}

/** 从细分科目反推试卷 */
export function paperOfSubject(s: string): Paper {
  for (const p of PAPERS) {
    if (PAPER_SUBJECTS[p].includes(s)) return p
  }
  return '408'
}

export type AnswerKey = 'A' | 'B' | 'C' | 'D'

// ============================================================
// 题型（判别联合）
// ============================================================

interface QBase {
  id: string
  year: number
  no: number
  subject: Subject
  stem: string
  explanation: string
  /** 所属试卷；存量 408 数据缺省视为 '408'（由 normalizeQuestion 补齐） */
  paper?: Paper
  /** 关联知识点（可选，用于错题归因） */
  topic?: string
  /** 配图 URL（绝对地址，或相对 data/ 目录） */
  images?: string[]
  /** 单题分值；缺省按试卷口径推断 */
  score?: number
  /**
   * 关联的共享长文 id（英语一专用）。
   * 完形填空 20 空共用一篇长文、阅读理解每 5 题共用一篇 —— 长文只存一份，
   * 题目通过这个字段指回 `MATERIALS`，避免把 17 万字长文复制 40 份。
   */
  materialId?: string
}

/** 单选（存量 596 题的形态；读入时自动补 type:'single'） */
export interface SingleChoiceQ extends QBase {
  type: 'single'
  options: Record<AnswerKey, string>
  answer: AnswerKey
}

/** 多选（政治多选、408 多选）：少选 / 错选 / 多选均不得分，全对才得分 */
export interface MultiChoiceQ extends QBase {
  type: 'multi'
  options: Record<AnswerKey, string>
  /** 正确项集合（顺序无关） */
  answer: AnswerKey[]
}

/** 一个填空的答案规格 */
export interface BlankSpec {
  /** 标准答案（展示用） */
  answer: string
  /** 可接受的其他写法（含等价形式：分数/小数、带不带单位、x=1 / 1 等） */
  accept?: string[]
  /** 单位（展示用，不参与判定，除非答案需带单位） */
  unit?: string
}

/** 填空题（数学一客观题） */
export interface BlankQ extends QBase {
  type: 'blank'
  blanks: BlankSpec[]
}

/** 综合应用题的一个小问 */
export interface AppliedPart {
  /** 小问序号（1, 2, 3…） */
  no: number
  stem: string
  /** 参考答案 */
  answer: string
  /** 评分点（自评清单，逐条打勾） */
  points?: string[]
  /** 本小问分值 */
  score?: number
}

/** 综合应用题（408 第 41–47 题 / 数学解答题） */
export interface AppliedQ extends QBase {
  type: 'applied'
  /** 整题总分 */
  totalScore: number
  /** 题干里的小问（若整题无小问划分，可放一个 no=1 的整体小问） */
  parts: AppliedPart[]
}

export type Question = SingleChoiceQ | MultiChoiceQ | BlankQ | AppliedQ

export type QuestionType = Question['type']

/** 各试卷的默认单题分值（用于缺省 score 推断） */
export const PAPER_DEFAULT_SCORE: Record<Paper, number> = {
  '408': 2,
  '政治': 1,
  '英语一': 2,
  '数学一': 5,
}

/** 试卷展示信息（首页切换器 / 导航用） */
export const PAPER_INFO: Record<Paper, { short: string; full: string; total: number; objective: number }> = {
  '408': { short: '408', full: '计算机学科专业基础', total: 150, objective: 80 },
  '政治': { short: '政治', full: '思想政治理论', total: 100, objective: 50 },
  '英语一': { short: '英语一', full: '英语（一）', total: 100, objective: 60 },
  '数学一': { short: '数学一', full: '数学（一）', total: 150, objective: 80 },
}

/**
 * 各试卷客观题正确率 KPI —— 来自「365 分」的反推（见扩充方案 §2.3）。
 * 408 要求更高：因为它的 70 分综合应用题得分率只有 64%，必须在单选上补回来。
 */
export const PAPER_KPI: Record<Paper, number> = {
  '408': 0.88,
  '政治': 0.8,
  '英语一': 0.77,
  '数学一': 0.8,
}

// ============================================================
// 模拟考试蓝图（按现行试卷结构组卷）
//
// 分值不写死在这里：题目自带 score（政治单选 1 / 多选 2；数学 4 或 5 随年份
// 结构变化），满分由实际抽到的题累加得出。这样跨年份结构差异不用额外分支。
// ============================================================

/** 组卷槽位：按题型抽题 */
export interface ExamSlot {
  type: QuestionType
  count: number
  /**
   * 限定细分科目（可选）。
   * 英语一的完形填空与阅读理解同为 single，只能靠科目区分配比
   * （完形 20×0.5 + 阅读 20×2），所以槽位需要能按科目收窄。
   */
  subject?: string
}

export interface ExamBlueprint {
  /** 按题型抽题；408 为空（它走 bySubject 的真实比例） */
  slots: ExamSlot[]
  /** 按科抽题（仅 408 使用：1-11 数据结构 / 12-22 计组 / 23-32 操作系统 / 33-40 计网） */
  bySubject?: Record<Subject408, number>
  /** 默认时长（分钟） */
  durationMin: number
  /** 组卷说明（展示用） */
  note: string
}

export const PAPER_EXAM: Record<Paper, ExamBlueprint | null> = {
  '408': {
    slots: [],
    bySubject: { 数据结构: 11, 计算机组成原理: 11, 操作系统: 10, 计算机网络: 8 },
    durationMin: 180,
    note: '真实比例 11/11/10/8 = 40 题 · 单选每题 2 分 · 满分 80',
  },
  '政治': {
    slots: [
      { type: 'single', count: 16 },
      { type: 'multi', count: 17 },
    ],
    durationMin: 60,
    note: '单选 16×1 + 多选 17×2 = 50 分 · 分析题 50 分走线下',
  },
  '数学一': {
    slots: [
      { type: 'single', count: 10 },
      { type: 'blank', count: 6 },
    ],
    durationMin: 80,
    note: '选择 10×5 + 填空 6×5 = 80 分 · 解答题 70 分走线下',
  },
  '英语一': {
    slots: [
      { type: 'single', subject: '完形填空', count: 20 },
      { type: 'single', subject: '阅读理解', count: 20 },
    ],
    durationMin: 80,
    note: '完形填空 20×0.5 + 阅读理解 Part A 20×2 = 50 分 · 新题型与写作 50 分走线下',
  },
}

// ============================================================
// 作答值（判别联合，与题型一一对应）
// ============================================================

export type Answer =
  | { t: 'single'; k: AnswerKey }
  | { t: 'multi'; ks: AnswerKey[] }
  | { t: 'blank'; vs: string[] }
  /** 综合应用题：各小问自评得分率（0 / 0.5 / 1） */
  | { t: 'applied'; scores: number[] }

/** 作答值 → 题型标记（用于校验作答类型与题目是否匹配） */
export function answerTypeOf(a: Answer): QuestionType {
  switch (a.t) {
    case 'single': return 'single'
    case 'multi': return 'multi'
    case 'blank': return 'blank'
    case 'applied': return 'applied'
  }
}

// ============================================================
// 常量
// ============================================================

export const SUBJECTS: Subject408[] = ['数据结构', '计算机组成原理', '操作系统', '计算机网络']
export const YEARS = Array.from({ length: 16 }, (_, i) => 2009 + i)
export const KEYS: AnswerKey[] = ['A', 'B', 'C', 'D']

/** 408 真实单选比例：1-11 数据结构 / 12-22 计组 / 23-32 操作系统 / 33-40 计网 */
export const EXAM_RATIO: Record<Subject408, number> = {
  '数据结构': 11,
  '计算机组成原理': 11,
  '操作系统': 10,
  '计算机网络': 8,
}
/** 408 单选每题 2 分，共 80 分 */
export const EXAM_PER_Q_SCORE = 2

// ============================================================
// SRS 间隔重复（SM-2 简化版）
// ============================================================

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
  /** 作答值（v1 起为判别联合；旧的裸 AnswerKey 字符串由 persist migrate 转换） */
  picked: Answer
  correct: boolean
  /** 得分比例 0–1；仅综合应用题会出现 0<ratio<1 的部分得分 */
  ratio?: number
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
  counts: Record<Subject408, number>
  /** 时长（分钟）；0 = 不计时 */
  durationMin: number
}

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
