// 英语一题库回归测试
//
// 校验「新试卷接入后，题库结构 / 共享长文 / 组卷 / 判分」四件事都对：
//   [A] 题库规模与分卷归属（560 题 = 完形 280 + 阅读 280，2010–2023 各 40）
//   [B] 共享长文（70 篇 = 完形 14 + 阅读 56）与 materialId 引用完整性
//   [C] 判分口径（完形 0.5 分 / 阅读 2 分）与单选链路
//   [D] 组卷蓝图（完形 20 + 阅读 20 = 50 分）
//   [E] 试卷隔离（英语题不渗进 408 / 政治 / 数学一，反之亦然）
//   [F] 答案分布 sanity（不能有整年同答案这类采集事故）
//
// 运行：node --experimental-strip-types scripts/verify-english.mts
// 报告写入 scripts/.english-report.txt
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

const outStore = path.join(__dirname, '.english-store.cjs')
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
  answer?: string
  stem?: string
  materialId?: string
  options?: Record<string, string>
  explanation?: string
}

const {
  BANK,
  MATERIALS,
  useQuiz,
  paperOfQuestion,
  paperYears,
  paperSubjects,
  availablePapers,
  practiceCount,
  buildPaperExam,
  examAvailability,
  examQuestionCount,
  examFullScore,
  getQuestion,
} = M

const { getState, setState } = useQuiz

const EN = (BANK as Q[]).filter((q) => paperOfQuestion(q) === '英语一')
const E = { paper: '英语一' }

log('===== 英语一回归 =====\n')
log(`全库 ${BANK.length} 题 · 英语一 ${EN.length} 题 · 共享长文 ${Object.keys(MATERIALS).length} 篇\n`)

// ---------------------------------------------------------------- [A] 规模
log('[A] 题库规模与分卷归属')

const cloze = EN.filter((q) => q.subject === '完形填空')
const reading = EN.filter((q) => q.subject === '阅读理解')

check('英语一 = 560 题（完形 280 + 阅读 280）', EN.length === 560 && cloze.length === 280 && reading.length === 280, {
  total: EN.length,
  cloze: cloze.length,
  reading: reading.length,
})
check('英语一全部为单选（type=single）', EN.every((q) => q.type === 'single'), [...new Set(EN.map((q) => q.type))])
check('英语一每题都带 paper 归属', EN.every((q) => q.paper === '英语一'), EN.filter((q) => q.paper !== '英语一').slice(0, 3).map((q) => q.id))
check('英语一年份 14 年（2010–2023 连续无缺口）', paperYears('英语一').length === 14 && paperYears('英语一')[0] === 2010 && paperYears('英语一')[13] === 2023, paperYears('英语一'))
check('科目 = [完形填空, 阅读理解]（新题型未做）', JSON.stringify(paperSubjects('英语一')) === JSON.stringify(['完形填空', '阅读理解']), paperSubjects('英语一'))

const badYear = paperYears('英语一').filter((y: number) => EN.filter((q) => q.year === y).length !== 40)
check('每年恰好 40 题', badYear.length === 0, badYear)
check(
  '每年 20 完形 + 20 阅读',
  paperYears('英语一').every(
    (y: number) =>
      EN.filter((q) => q.year === y && q.subject === '完形填空').length === 20 &&
      EN.filter((q) => q.year === y && q.subject === '阅读理解').length === 20,
  ),
)
check('英语一 id 无重复', new Set(EN.map((q) => q.id)).size === EN.length)
check('全库 id 仍唯一（英语接入未撞 id）', new Set((BANK as Q[]).map((q) => q.id)).size === BANK.length, BANK.length)
check('availablePapers 含四张卷', JSON.stringify(availablePapers()) === JSON.stringify(['408', '政治', '英语一', '数学一']), availablePapers())

// 选项完整性：normalize 的 readOptions 会丢掉空选项题，这里确认没有漏网
check(
  '每题 A–D 四个选项齐全',
  EN.every((q) => q.options && ['A', 'B', 'C', 'D'].every((k) => typeof q.options![k] === 'string' && q.options![k].trim() !== '')),
  EN.filter((q) => !q.options || ['A', 'B', 'C', 'D'].some((k) => !q.options![k]?.trim())).slice(0, 3).map((q) => q.id),
)
check('每题答案合法 A–D', EN.every((q) => ['A', 'B', 'C', 'D'].includes(q.answer ?? '')), [...new Set(EN.map((q) => q.answer))])

// 选项质量：四个选项必须互不相同（OCR 串行常导致重复选项），且长度合理
// （若选项行把长文正文并进来，长度会异常膨胀 —— 这里卡 160 字符兜底）
const dupOpt = EN.filter((q) => new Set(Object.values(q.options ?? {})).size !== 4)
check('每题四个选项互不相同', dupOpt.length === 0, dupOpt.slice(0, 3).map((q) => [q.id, Object.values(q.options!)]))
const longOpt = EN.filter((q) => Math.max(...Object.values(q.options ?? {}).map((s) => s.length)) >= 160)
check('选项文本长度合理（未把长文误并进选项）', longOpt.length === 0, longOpt.slice(0, 3).map((q) => [q.id, Math.max(...Object.values(q.options!).map((s) => s.length))]))

// 阅读理解题干是完整的英文设问句，不是「第 N 题」式占位。
// 真正该防的是「同组 5 题的题干被错位复制」——按 materialId 分组检查题干两两不同。
const readStemDup: string[] = []
for (const k of new Set(reading.map((q) => q.materialId!))) {
  const group = reading.filter((q) => q.materialId === k)
  if (new Set(group.map((q) => q.stem)).size !== group.length) readStemDup.push(k)
}
check('同组阅读 5 题题干两两不同（无错位复制）', readStemDup.length === 0, readStemDup)

// ---------------------------------------------------------------- [B] 长文
log('\n[B] 共享长文（materials）')

const matKeys = Object.keys(MATERIALS)
const clozeKeys = matKeys.filter((k) => k.includes('cloze'))
const readKeys = matKeys.filter((k) => k.includes('read'))

check('共享长文 70 篇 = 完形 14 + 阅读 56', matKeys.length === 70 && clozeKeys.length === 14 && readKeys.length === 56, {
  total: matKeys.length,
  cloze: clozeKeys.length,
  read: readKeys.length,
})
check('长文正文均非空', matKeys.every((k) => typeof MATERIALS[k] === 'string' && MATERIALS[k].trim().length > 200), matKeys.filter((k) => (MATERIALS[k] ?? '').trim().length <= 200))
check('每题 materialId 都能解析到长文', EN.every((q) => q.materialId && !!MATERIALS[q.materialId]), EN.filter((q) => !q.materialId || !MATERIALS[q.materialId]).slice(0, 3).map((q) => q.id))

// 完形 20 空共用一篇：20 题的 materialId 全相同，且长文含 {{1}}..{{20}} 各一次
const clozeGroups = new Map<string, number>()
for (const q of cloze) clozeGroups.set(q.materialId!, (clozeGroups.get(q.materialId!) ?? 0) + 1)
check('完形每年 20 题共用同一篇长文', clozeGroups.size === 14 && [...clozeGroups.values()].every((n) => n === 20), [...clozeGroups.entries()].slice(0, 5))

const expectMarkers = Array.from({ length: 20 }, (_, i) => i + 1).join(',')
const badMarkers = clozeKeys.filter((k) => {
  const ms = [...MATERIALS[k].matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  return ms.length !== 20 || ms.join(',') !== expectMarkers
})
check('完形长文含 {{1}}–{{20}} 全部空位标记且各一次', badMarkers.length === 0, badMarkers)

// 阅读每 4 篇/年，每篇 5 题
const readGroups = new Map<string, number>()
for (const q of reading) readGroups.set(q.materialId!, (readGroups.get(q.materialId!) ?? 0) + 1)
check('阅读每篇长文对应恰好 5 题', readGroups.size === 56 && [...readGroups.values()].every((n) => n === 5), [...readGroups.entries()].slice(0, 5))
check('阅读长文不含空位标记（只有完形才有）', readKeys.every((k) => !/\{\{\d+\}\}/.test(MATERIALS[k])), readKeys.filter((k) => /\{\{\d+\}\}/.test(MATERIALS[k])))

// 长文只存一份的关键证据：题目自身不带正文，题干里也没有长文首句
const dupLeak = EN.filter((q) => {
  const first = (MATERIALS[q.materialId!] ?? '').slice(0, 40)
  return first.length > 20 && (q.stem ?? '').includes(first)
})
check('题目题干未复制长文正文（长文只存一份）', dupLeak.length === 0, dupLeak.slice(0, 3).map((q) => q.id))

const totalMatChars = matKeys.reduce((a, k) => a + MATERIALS[k].length, 0)
const totalStemChars = EN.reduce((a, q) => a + (q.stem ?? '').length, 0)
log(`    └ 长文合计 ${totalMatChars.toLocaleString()} 字符 · 题干合计 ${totalStemChars.toLocaleString()} 字符`)
check('长文体量远大于题干体量（确认未展开进题干）', totalMatChars > totalStemChars * 2, { mat: totalMatChars, stem: totalStemChars })

// ---------------------------------------------------------------- [C] 判分
log('\n[C] 判分口径')

check('完形每题 0.5 分', cloze.every((q) => q.score === 0.5), [...new Set(cloze.map((q) => q.score))])
check('阅读每题 2 分', reading.every((q) => q.score === 2), [...new Set(reading.map((q) => q.score))])

setState({ attempts: {}, unarchived: [], picked: {}, session: null, index: 0, history: [] })
const c1 = cloze[0]
getState().submitAnswer(c1.id, { t: 'single', k: c1.answer as string })
check(`完形答对 → correct=true（${c1.id} → ${c1.answer}）`, getState().attempts[c1.id]?.correct === true, getState().attempts[c1.id])

const r1 = reading[0]
getState().submitAnswer(r1.id, { t: 'single', k: r1.answer as string })
check(`阅读答对 → correct=true（${r1.id} → ${r1.answer}）`, getState().attempts[r1.id]?.correct === true, getState().attempts[r1.id])

check('完形与阅读答题记录都带 subject（错题归因用）', getState().attempts[c1.id]?.subject === '完形填空' && getState().attempts[r1.id]?.subject === '阅读理解', {
  cloze: getState().attempts[c1.id]?.subject,
  reading: getState().attempts[r1.id]?.subject,
})

// 答错分支：submitAnswer 有「同会话一题只能提交一次」的守卫（picked[qid] 存在即 return），
// 必须先把上一轮的 picked / attempts 清掉，否则会被守卫挡回去、看不到 real 的答错结果。
const wrongKey = (['A', 'B', 'C', 'D'] as string[]).find((k) => k !== c1.answer)!
setState({ picked: {}, attempts: {}, history: [] })
getState().submitAnswer(c1.id, { t: 'single', k: wrongKey })
check(`完形答错 → correct=false（${c1.id} → ${wrongKey}，正确 ${c1.answer}）`, getState().attempts[c1.id]?.correct === false, getState().attempts[c1.id])

// ---------------------------------------------------------------- [D] 组卷
log('\n[D] 组卷蓝图')

setState({ filter: { ...E, years: [], subjects: [], shuffle: false } })
check('英语一组卷题量 = 40（完形 20 + 阅读 20）', examQuestionCount('英语一') === 40, examQuestionCount('英语一'))

const ex = buildPaperExam(getState().filter) as Q[]
check('英语一组卷抽到 40 题', ex.length === 40, ex.length)
check('组卷 = 20 完形 + 20 阅读', ex.filter((q) => q.subject === '完形填空').length === 20 && ex.filter((q) => q.subject === '阅读理解').length === 20, {
  cloze: ex.filter((q) => q.subject === '完形填空').length,
  reading: ex.filter((q) => q.subject === '阅读理解').length,
})
check('组卷 id 无重复', new Set(ex.map((q) => q.id)).size === ex.length)
check('组卷全部来自英语一', ex.every((q) => paperOfQuestion(q) === '英语一'))
check('组卷满分 = 50（20×0.5 + 20×2）', examFullScore(getState().filter) === 50, examFullScore(getState().filter))
check('组卷实际抽到题的分值累加 = 50', ex.reduce((a, q) => a + (q.score ?? 0), 0) === 50, ex.reduce((a, q) => a + (q.score ?? 0), 0))

const av = examAvailability(getState().filter) as { label: string; need: number; have: number; ok: boolean }[]
check('可行性 2 个槽位，标签按科目而非题型', av.length === 2 && av[0].label === '完形填空' && av[1].label === '阅读理解', av.map((s) => s.label))
check('两个槽位都达标且需求量正确（20 / 20）', av.every((s) => s.ok) && av[0].need === 20 && av[1].need === 20, av)
check('完形槽位可用量 = 280（14 年 × 20）', av[0].have === 280, av[0].have)
check('阅读槽位可用量 = 280（14 年 × 20）', av[1].have === 280, av[1].have)

// 单年筛选：组卷必须落在同一年内，且仍是 20 + 20
setState({ filter: { ...E, years: [2016], subjects: [], shuffle: false } })
const ex16 = buildPaperExam(getState().filter) as Q[]
check('单年（2016）组卷仍为 40 题且同年', ex16.length === 40 && ex16.every((q) => q.year === 2016), { n: ex16.length, years: [...new Set(ex16.map((q) => q.year))] })
check('单年（2016）满分仍 = 50', examFullScore(getState().filter) === 50, examFullScore(getState().filter))

// 补全题量到全库
check('全库总量 = 1946（408 673 + 政治 495 + 数学一 218 + 英语一 560）', BANK.length === 1946, BANK.length)
check('408 = 673 题', (BANK as Q[]).filter((q) => paperOfQuestion(q) === '408').length === 673, (BANK as Q[]).filter((q) => paperOfQuestion(q) === '408').length)
check('政治 = 495 题', (BANK as Q[]).filter((q) => paperOfQuestion(q) === '政治').length === 495, (BANK as Q[]).filter((q) => paperOfQuestion(q) === '政治').length)
check('数学一 = 218 题', (BANK as Q[]).filter((q) => paperOfQuestion(q) === '数学一').length === 218, (BANK as Q[]).filter((q) => paperOfQuestion(q) === '数学一').length)

// ---------------------------------------------------------------- [E] 隔离
log('\n[E] 试卷隔离')

// practiceCount 会把「已归档」的题（最近一次答对且无 SRS 跟踪）排除在外，
// [C] 段留下的作答记录会污染计数，这里先清干净再校验总量。
setState({ attempts: {}, history: [], picked: {}, unarchived: [] })

check('英语一练习题数 = 560', practiceCount({ ...E, years: [], subjects: [], shuffle: false }) === 560, practiceCount({ ...E, years: [], subjects: [], shuffle: false }))
check('完形填空单科筛选 = 280', practiceCount({ ...E, years: [], subjects: ['完形填空'], shuffle: false }) === 280, practiceCount({ ...E, years: [], subjects: ['完形填空'], shuffle: false }))
check('旧 filter（无 paper）仍默认 408，不被英语稀释', practiceCount({ years: [], subjects: [], shuffle: false }) === 673, practiceCount({ years: [], subjects: [], shuffle: false }))

setState({ attempts: {}, unarchived: [], filter: { ...E, years: [], subjects: [], shuffle: false }, session: null, index: 0, picked: {} })
getState().startSession()
const ses: string[] = getState().session!
check('英语一会话长度 = 560', ses.length === 560, ses.length)
check('英语一会话不含任何非英语题', ses.every((id) => paperOfQuestion(getQuestion(id)) === '英语一'), ses.filter((id) => paperOfQuestion(getQuestion(id)) !== '英语一').slice(0, 5))

setState({ filter: { paper: '408', years: [], subjects: [], shuffle: false }, session: null, index: 0, picked: {} })
getState().startSession()
const ses408: string[] = getState().session!
check('408 会话不含英语题', ses408.every((id) => paperOfQuestion(getQuestion(id)) === '408'), ses408.filter((id) => paperOfQuestion(getQuestion(id)) !== '408').slice(0, 5))

// setPaper 切到英语一必须清掉 408 的年份/科目筛选（两卷年份区间不重叠）
setState({ filter: { paper: '408', years: [2009], subjects: ['数据结构'], shuffle: true } })
getState().setPaper('英语一')
check(
  'setPaper 切英语一 → 清空年份与科目筛选',
  getState().filter.paper === '英语一' && getState().filter.years.length === 0 && getState().filter.subjects.length === 0,
  getState().filter,
)

// ---------------------------------------------------------------- [F] 答案分布
log('\n[F] 答案分布 sanity（采集事故检测）')

const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }
for (const q of EN) dist[q.answer!]++
const minShare = Math.min(...Object.values(dist)) / EN.length
check('四选项分布无严重偏斜（最少者占比 ≥ 15%）', minShare >= 0.15, { dist, minShare: +minShare.toFixed(3) })

// 整年同答案 = 解析串位的典型症状
const flatYears: number[] = []
for (const y of paperYears('英语一')) {
  const ys = EN.filter((q) => q.year === y)
  const uniq = new Set(ys.map((q) => q.answer))
  if (uniq.size <= 2) flatYears.push(y)
}
check('没有任何一年答案退化成 1–2 种', flatYears.length === 0, flatYears)

// 每年 40 题的答案里 A/B/C/D 都应出现过
const missingKeyYears: string[] = []
for (const y of paperYears('英语一')) {
  const ys = EN.filter((q) => q.year === y)
  const uniq = new Set(ys.map((q) => q.answer))
  if (['A', 'B', 'C', 'D'].some((k) => !uniq.has(k))) missingKeyYears.push(`${y}(${[...uniq].sort().join('')})`)
}
check('每年 A/B/C/D 四个选项都出过答案', missingKeyYears.length === 0, missingKeyYears)

log(`    └ 答案分布 ${Object.entries(dist).map(([k, v]) => `${k}:${v}`).join('  ')}`)

// ---------------------------------------------------------------- 收尾
try {
  fs.unlinkSync(outStore)
} catch {
  /* ignore */
}

const report = [...LINES, '', `===== 结果：${pass} 通过 / ${fail} 失败 =====`].join('\n')
fs.writeFileSync(path.join(__dirname, '.english-report.txt'), report, 'utf-8')
console.log(`\nENGLISH: ${pass} pass / ${fail} fail -> scripts/.english-report.txt`)
if (fail > 0) process.exit(1)
