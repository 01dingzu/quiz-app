// 多试卷（408 / 政治 / 英语一 / 数学一）接线回归测试
//
// 校验的是「扩充之后老行为不变 + 新行为正确」这件事：
//   [A] 题库总量与分卷归属
//   [B] 试卷元信息（年份集 / 科目集 / 可用试卷）
//   [C] 筛选隔离与零迁移（旧 filter 没有 paper 字段 → 必须仍然只出 408 的题）
//   [D] 组卷：408 按科真实比例，政治按题型 16+17，数学一按题型 10+6，
//       英语一按科目分槽 20 完形 + 20 阅读
//   [E] 分值口径与满分估算
//   [F] 判分链路端到端（多选 / 填空等价写法经 store 落库）
//   [G] 分试卷 KPI 统计
//
// 英语一的共享长文（materials / materialId）另见 scripts/verify-english.mts。
//
// 运行：node --experimental-strip-types scripts/verify-papers.mts
// 报告写入 scripts/.papers-report.txt
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function bundle(entry: string, out: string) {
  buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    define: { 'import.meta.env.DEV': 'false' },
    logLevel: 'silent',
  })
}

const outStore = path.join(__dirname, '.papers-store.cjs')
bundle(path.join(root, 'src', 'store', 'quizStore.ts'), outStore)

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const require = createRequire(import.meta.url)
const M = require(outStore)

const LINES: string[] = []
const log = (s: unknown) => LINES.push(String(s))

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++
    log(`  ✓ ${name}`)
  } else {
    fail++
    log(`  ✗ ${name} — ${JSON.stringify(detail)}`)
  }
}

type Q = {
  id: string
  paper?: string
  type: string
  year: number
  no: number
  subject: string
  score?: number
  answer?: unknown
  blanks?: { answer: string; accept?: string[]; unit?: string }[]
}

const {
  BANK,
  useQuiz,
  paperOfQuestion,
  paperOfFilter,
  paperYears,
  paperSubjects,
  availablePapers,
  practiceCount,
  buildPaperExam,
  examAvailability,
  examQuestionCount,
  examFullScore,
  paperStats,
  getQuestion,
} = M

const { getState, setState } = useQuiz

const T = { paper: '政治' }
const M1 = { paper: '数学一' }
const E1 = { paper: '英语一' }

log('===== 多试卷接线回归 =====\n')
log(`题库总量 ${BANK.length}\n`)

// ---------------------------------------------------------------- [A] 总量
log('[A] 题库总量与分卷归属')

const PAPER_COUNT = (p: string) => (BANK as Q[]).filter((q) => paperOfQuestion(q) === p).length

check('总量 = 1946（408 单选 596 + 408 应用题 77 + 政治 495 + 数学一 218 + 英语一 560）', BANK.length === 1946, BANK.length)
check('408 = 673 题', PAPER_COUNT('408') === 673, PAPER_COUNT('408'))
check('政治 = 495 题', PAPER_COUNT('政治') === 495, PAPER_COUNT('政治'))
check('数学一 = 218 题', PAPER_COUNT('数学一') === 218, PAPER_COUNT('数学一'))
check('英语一 = 560 题（完形 280 + 阅读 280）', PAPER_COUNT('英语一') === 560, PAPER_COUNT('英语一'))
check('每题都有明确试卷归属', (BANK as Q[]).every((q) => !!paperOfQuestion(q)))
check('跨卷 id 全部唯一', new Set((BANK as Q[]).map((q) => q.id)).size === BANK.length)

// ---------------------------------------------------------------- [B] 元信息
log('\n[B] 试卷元信息')

check('availablePapers 列出四张有数据的试卷', JSON.stringify(availablePapers()) === JSON.stringify(['408', '政治', '英语一', '数学一']), availablePapers())
check('408 年份 16 年（2009–2024）', paperYears('408').length === 16 && paperYears('408')[0] === 2009, paperYears('408').length)
check('政治年份 15 年（2010–2024）', paperYears('政治').length === 15 && paperYears('政治')[0] === 2010, paperYears('政治'))
check('数学一年份 16 年（2010–2025 连续无缺口）', paperYears('数学一').length === 16 && paperYears('数学一')[0] === 2010 && paperYears('数学一')[15] === 2025, paperYears('数学一'))
check('英语一年份 14 年（2010–2023 连续无缺口）', paperYears('英语一').length === 14 && paperYears('英语一')[0] === 2010 && paperYears('英语一')[13] === 2023, paperYears('英语一'))
check('408 科目 4 科', JSON.stringify(paperSubjects('408')) === JSON.stringify(['数据结构', '计算机组成原理', '操作系统', '计算机网络']), paperSubjects('408'))
check('政治科目 5 科', paperSubjects('政治').length === 5, paperSubjects('政治'))
check('数学一科目 3 科', JSON.stringify(paperSubjects('数学一')) === JSON.stringify(['高等数学', '线性代数', '概率统计']), paperSubjects('数学一'))
check('英语一科目 = [完形填空, 阅读理解]（新题型未收录）', JSON.stringify(paperSubjects('英语一')) === JSON.stringify(['完形填空', '阅读理解']), paperSubjects('英语一'))

// ---------------------------------------------------------------- [C] 隔离
log('\n[C] 筛选隔离与零迁移')

// 关键：老用户的 persisted filter 里根本没有 paper 字段
const legacy = { years: [], subjects: [], shuffle: false }
check('旧 filter（无 paper 字段）默认按 408 解析', paperOfFilter(legacy) === '408', paperOfFilter(legacy))
check('零迁移：旧 filter 练习题数 = 408 全量 673（不含政治/数学）', practiceCount(legacy) === 673, practiceCount(legacy))
check('政治 filter 练习题数 = 495', practiceCount({ ...T, years: [], subjects: [], shuffle: false }) === 495, practiceCount({ ...T, years: [], subjects: [], shuffle: false }))
check('数学一 filter 练习题数 = 218', practiceCount({ ...M1, years: [], subjects: [], shuffle: false }) === 218, practiceCount({ ...M1, years: [], subjects: [], shuffle: false }))
check('英语一 filter 练习题数 = 560', practiceCount({ ...E1, years: [], subjects: [], shuffle: false }) === 560, practiceCount({ ...E1, years: [], subjects: [], shuffle: false }))

setState({ attempts: {}, unarchived: [], filter: { ...T, years: [], subjects: [], shuffle: false }, session: null, index: 0, picked: {} })
getState().startSession()
let ses: string[] = getState().session!
check('政治会话不含任何 408 / 数学题', ses.every((id) => paperOfQuestion(getQuestion(id)) === '政治'), ses.filter((id) => paperOfQuestion(getQuestion(id)) !== '政治').slice(0, 5))
check('政治会话长度 = 495', ses.length === 495, ses.length)

setState({ filter: { paper: '408', years: [], subjects: [], shuffle: false }, session: null, index: 0, picked: {} })
getState().startSession()
ses = getState().session!
check('408 会话不含政治 / 数学题', ses.every((id) => paperOfQuestion(getQuestion(id)) === '408'), ses.filter((id) => paperOfQuestion(getQuestion(id)) !== '408').slice(0, 5))
check('408 会话长度 = 673', ses.length === 673, ses.length)

// setPaper 必须清空跨卷不通用的年份 / 科目筛选
setState({ filter: { paper: '408', years: [2009], subjects: ['数据结构'], shuffle: true } })
getState().setPaper('政治')
check(
  'setPaper 清空年份与科目筛选、保留随机偏好',
  getState().filter.years.length === 0 &&
    getState().filter.subjects.length === 0 &&
    getState().filter.shuffle === true &&
    getState().filter.paper === '政治',
  getState().filter,
)

// ---------------------------------------------------------------- [D] 组卷
log('\n[D] 组卷结构')

setState({ filter: { paper: '408', years: [], subjects: [], shuffle: false } })
let ex = buildPaperExam(getState().filter) as Q[]
check('408 组卷 40 题', ex.length === 40, ex.length)
check('408 组卷全部为单选', ex.every((q) => q.type === 'single'))
check('408 组卷全部来自 408', ex.every((q) => paperOfQuestion(q) === '408'))
const bySub = new Map<string, number>()
for (const q of ex) bySub.set(q.subject, (bySub.get(q.subject) ?? 0) + 1)
check(
  '408 按真实比例 11/11/10/8 分科抽题',
  bySub.get('数据结构') === 11 && bySub.get('计算机组成原理') === 11 && bySub.get('操作系统') === 10 && bySub.get('计算机网络') === 8,
  [...bySub.entries()],
)
check('408 组卷 id 无重复', new Set(ex.map((q) => q.id)).size === ex.length)

setState({ filter: { ...T, years: [], subjects: [], shuffle: false } })
ex = buildPaperExam(getState().filter) as Q[]
const s16 = ex.filter((q) => q.type === 'single')
const m17 = ex.filter((q) => q.type === 'multi')
check('政治组卷 33 题', ex.length === 33, ex.length)
check('政治组卷 16 单选 + 17 多选', s16.length === 16 && m17.length === 17, { s16: s16.length, m17: m17.length })
check('政治组卷满分 = 50（16×1 + 17×2）', ex.reduce((a, q) => a + (q.score ?? 0), 0) === 50, ex.reduce((a, q) => a + (q.score ?? 0), 0))
check('政治组卷全部来自政治', ex.every((q) => paperOfQuestion(q) === '政治'))

setState({ filter: { ...M1, years: [], subjects: [], shuffle: false } })
ex = buildPaperExam(getState().filter) as Q[]
check('数学一组卷 16 题', ex.length === 16, ex.length)
check('数学一组卷 10 选择 + 6 填空', ex.filter((q) => q.type === 'single').length === 10 && ex.filter((q) => q.type === 'blank').length === 6, { s: ex.filter((q) => q.type === 'single').length, b: ex.filter((q) => q.type === 'blank').length })
check('数学一每题分值 ∈ {4,5}', ex.every((q) => q.score === 4 || q.score === 5), [...new Set(ex.map((q) => q.score))])

// 英语一：完形与阅读同为 single，靠 slot.subject 区分配比（20×0.5 + 20×2 = 50）
setState({ filter: { ...E1, years: [], subjects: [], shuffle: false } })
ex = buildPaperExam(getState().filter) as Q[]
check('英语一组卷 40 题', ex.length === 40, ex.length)
check('英语一组卷 20 完形 + 20 阅读（按科目分槽而非题型）', ex.filter((q) => q.subject === '完形填空').length === 20 && ex.filter((q) => q.subject === '阅读理解').length === 20, {
  完形: ex.filter((q) => q.subject === '完形填空').length,
  阅读: ex.filter((q) => q.subject === '阅读理解').length,
})
check('英语一组卷全部来自英语一', ex.every((q) => paperOfQuestion(q) === '英语一'))
check('英语一组卷每题分值口径 = 完形 0.5 / 阅读 2', ex.every((q) => (q.subject === '完形填空' ? q.score === 0.5 : q.score === 2)), [...new Set(ex.map((q) => `${q.subject}:${q.score}`))])
check('英语一组卷满分 = 50', ex.reduce((a, q) => a + (q.score ?? 0), 0) === 50, ex.reduce((a, q) => a + (q.score ?? 0), 0))

// ---------------------------------------------------------------- [E] 分值
log('\n[E] 分值口径与组卷可行性')

check('examQuestionCount 408/政治/英语一/数学一 = 40/33/40/16', examQuestionCount('408') === 40 && examQuestionCount('政治') === 33 && examQuestionCount('英语一') === 40 && examQuestionCount('数学一') === 16, {
  408: examQuestionCount('408'),
  政治: examQuestionCount('政治'),
  英语一: examQuestionCount('英语一'),
  数学一: examQuestionCount('数学一'),
})

setState({ filter: { paper: '408', years: [], subjects: [], shuffle: false } })
check('408 组卷可行性 4 个槽位且全部达标', examAvailability(getState().filter).length === 4 && examAvailability(getState().filter).every((s: { ok: boolean }) => s.ok))
check('408 估算满分 = 80', examFullScore(getState().filter) === 80, examFullScore(getState().filter))

setState({ filter: { ...T, years: [], subjects: [], shuffle: false } })
check('政治组卷可行性 2 个槽位且全部达标', examAvailability(getState().filter).length === 2 && examAvailability(getState().filter).every((s: { ok: boolean }) => s.ok))
check('政治估算满分 = 50', examFullScore(getState().filter) === 50, examFullScore(getState().filter))

setState({ filter: { ...M1, years: [], subjects: [], shuffle: false } })
check('数学一组卷可行性 2 个槽位且全部达标', examAvailability(getState().filter).length === 2 && examAvailability(getState().filter).every((s: { ok: boolean }) => s.ok))
const mScore = examFullScore(getState().filter)
check('数学一估算满分落在 64–80（试卷结构跨年份变化，按题库实际分值估算）', mScore >= 64 && mScore <= 80, mScore)

setState({ filter: { ...E1, years: [], subjects: [], shuffle: false } })
const avEn = examAvailability(getState().filter) as { label: string; need: number; have: number; ok: boolean }[]
check('英语一组卷可行性 2 个槽位且全部达标', avEn.length === 2 && avEn.every((s) => s.ok), avEn)
check('英语一槽位标签用科目名（完形填空 / 阅读理解）', avEn[0]?.label === '完形填空' && avEn[1]?.label === '阅读理解', avEn.map((s) => s.label))
check('英语一估算满分 = 50（20×0.5 + 20×2）', examFullScore(getState().filter) === 50, examFullScore(getState().filter))

// 单年筛选下分值应等于该年真实结构。
// 数学大纲 2021 版把选择题从 8 道提到 10 道、每题分值从 4 分提到 5 分，
// 同一套代码要能同时算对这两个版本 —— 而每题分值直接取自题库（逐题 score），
// 所以这里按「可用量 × 该年分值」校验，同时对源 OCR 缺口保持可见。
const availOf = (f: unknown) => examAvailability(f) as { label: string; need: number; have: number; ok: boolean }[]

setState({ filter: { ...M1, years: [2023], subjects: [], shuffle: false } })
const av2023 = availOf(getState().filter)
const s23 = av2023.find((s) => s.label === '单项选择')!
const b23 = av2023.find((s) => s.label === '填空题')!
check('数学一 2023 每题 5 分（2021 大纲改版后）', (BANK as Q[]).filter((q: Q) => paperOfQuestion(q) === '数学一' && q.year === 2023).every((q: Q) => q.score === 5))
check(
  '数学一 2023 单年估算满分 =（可用选择 + 可用填空）× 5',
  examFullScore(getState().filter) === (s23.have + b23.have) * 5,
  { got: examFullScore(getState().filter), s: s23.have, b: b23.have },
)
check('2023 选择题有源缺口（真题 10 道，本次收录 7 道）', s23.have === 7 && !s23.ok, s23)

setState({ filter: { ...M1, years: [2021], subjects: [], shuffle: false } })
const av2021 = availOf(getState().filter)
const s21 = av2021.find((s) => s.label === '单项选择')!
const b21 = av2021.find((s) => s.label === '填空题')!
check(
  '数学一 2021 单年估算满分 =（可用选择 + 可用填空）× 5',
  examFullScore(getState().filter) === (s21.have + b21.have) * 5,
  { got: examFullScore(getState().filter), s: s21.have, b: b21.have },
)

setState({ filter: { ...M1, years: [2018], subjects: [], shuffle: false } })
check('数学一 2018 单年估算满分 = 56（8×4 + 6×4）', examFullScore(getState().filter) === 56, examFullScore(getState().filter))
check(
  '2018 单年组卷可行性不过关（当年仅 8 道选择题，不足现行 10 道）',
  av2023.length > 0 && availOf(getState().filter).some((s) => !s.ok),
  availOf(getState().filter),
)

// 2024 / 2025 补录后应为完整客观题年：10 选择 + 6 填空，单年满分 80 且组卷可行
for (const y of [2024, 2025]) {
  setState({ filter: { ...M1, years: [y], subjects: [], shuffle: false } })
  const av = availOf(getState().filter)
  check(
    `数学一 ${y} 单年组卷可行且满分 = 80（10×5 + 6×5）`,
    av.length === 2 && av.every((s) => s.ok) && examFullScore(getState().filter) === 80,
    { av, score: examFullScore(getState().filter) },
  )
}

// 把各年的组卷可用量打出来，源 OCR 缺口一目了然
setState({ filter: { ...M1, years: [], subjects: [], shuffle: false } })
log(
  `    └ 数学一各年可用量：${paperYears('数学一')
    .map((y: number) => {
      setState({ filter: { ...M1, years: [y], subjects: [], shuffle: false } })
      const av = availOf(getState().filter)
      return `${y}:${av.find((s) => s.label === '单项选择')!.have}+${av.find((s) => s.label === '填空题')!.have}`
    })
    .join('  ')}`,
)
setState({ filter: { ...M1, years: [], subjects: [], shuffle: false } })
log(`    └ 全年份合并估算满分：${examFullScore(getState().filter)}（各行满分上限 80）`)

// ---------------------------------------------------------------- [F] 判分
log('\n[F] 判分链路端到端（经 store 落库）')

const mkRec = (qid: string, correct: boolean) => {
  const q = getQuestion(qid) as Q
  return {
    qid,
    year: q.year,
    no: q.no,
    subject: q.subject,
    picked: { t: 'single', k: 'A' },
    correct,
    flagged: null,
    ts: Date.now(),
  }
}

// 政治多选：全对才得分
const polMulti = (BANK as Q[]).find((q) => q.paper === '政治' && q.type === 'multi')!
setState({ attempts: {}, unarchived: [], picked: {}, session: null, index: 0, history: [] })
getState().submitAnswer(polMulti.id, { t: 'multi', ks: polMulti.answer as string[] })
check('政治多选全对 → 落库 correct=true', getState().attempts[polMulti.id]?.correct === true, getState().attempts[polMulti.id])

const polMulti2 = (BANK as Q[]).filter((q) => q.paper === '政治' && q.type === 'multi')[1]
const subset = (polMulti2.answer as string[]).slice(0, -1)
getState().submitAnswer(polMulti2.id, { t: 'multi', ks: subset })
check('政治多选少选 → 落库 correct=false（不给部分分）', getState().attempts[polMulti2.id]?.correct === false, getState().attempts[polMulti2.id])

// 数学填空：等价写法必须经 store 判对（P4 的核心难点，用真实题库里的题验证）
const EQ_CASES: [string, string, string][] = [
  ['math-2010-12', '0.6666666667', 'LaTeX 分数 → 小数'],
  ['math-2012-10', 'pi/2', 'LaTeX π 分数 → pi/2'],
  ['math-2013-11', '2^0.5', 'LaTeX 根式 → 幂形式'],
  ['math-2013-12', '0.6931471805599453', 'ln 2 → 数值'],
]
for (const [qid, input, why] of EQ_CASES) {
  const q = getQuestion(qid) as Q | undefined
  if (!q) {
    log(`    └ （题库中无 ${qid}，跳过用例：${why}）`)
    continue
  }
  getState().submitAnswer(qid, { t: 'blank', vs: [input] })
  check(
    `数学填空等价写法 → 判对 · ${why}（标准答案 ${q.blanks![0].answer}，提交 ${input}）`,
    getState().attempts[qid]?.correct === true,
    getState().attempts[qid],
  )
}

// 反向：同一个空提交错误值必须判错
const wrongQ = getQuestion('math-2013-11') as Q | undefined // 标准答案 √2
if (wrongQ) {
  setState({ picked: {}, attempts: {}, history: [] })
  getState().submitAnswer('math-2013-11', { t: 'blank', vs: ['1.5'] })
  check('数学填空提交错误值 → 判错（√2 与 1.5 不判等）', getState().attempts['math-2013-11']?.correct === false, getState().attempts['math-2013-11'])
}

// ---------------------------------------------------------------- [G] KPI
log('\n[G] 分试卷 KPI 统计')

const pick = (paper: string, n: number) => (BANK as Q[]).filter((q) => paperOfQuestion(q) === paper).slice(0, n)
const atts: Record<string, unknown> = {}
for (const [paper, rightCount] of [['408', 8], ['政治', 6], ['数学一', 4]] as [string, number][]) {
  pick(paper, 10).forEach((q, i) => {
    atts[q.id] = mkRec(q.id, i < rightCount)
  })
}
setState({ attempts: atts })
const rows = paperStats() as { paper: string; total: number; correct: number; pct: number; kpi: number; gap: number }[]
check('paperStats 覆盖三个有作答的试卷', rows.length === 3, rows.map((r) => r.paper))
check('每卷题目数 = 10 题', rows.every((r) => r.total === 10), rows.map((r) => r.total))
check('408 正确率 = 80%（8/10）', rows.find((r) => r.paper === '408')?.pct === 0.8, rows.find((r) => r.paper === '408'))
check('政治正确率 = 60%（6/10）', rows.find((r) => r.paper === '政治')?.pct === 0.6, rows.find((r) => r.paper === '政治'))
check('KPI 目标：408=88%，政治/数学一=80%', rows.find((r) => r.paper === '408')?.kpi === 0.88 && rows.find((r) => r.paper === '政治')?.kpi === 0.8 && rows.find((r) => r.paper === '数学一')?.kpi === 0.8, rows.map((r) => [r.paper, r.kpi]))
check(
  'gap 反映与目标的差距（408 为 -8 个点）',
  Math.abs((rows.find((r) => r.paper === '408')?.gap ?? 0) - -0.08) < 1e-9,
  rows.map((r) => [r.paper, r.gap]),
)

// ---------------------------------------------------------------- 收尾
try {
  fs.unlinkSync(outStore)
} catch {
  /* ignore */
}

const report = [...LINES, '', `===== 结果：${pass} 通过 / ${fail} 失败 =====`].join('\n')
fs.writeFileSync(path.join(__dirname, '.papers-report.txt'), report, 'utf-8')
console.log(`\nPAPERS: ${pass} pass / ${fail} fail -> scripts/.papers-report.txt`)
if (fail > 0) process.exit(1)
