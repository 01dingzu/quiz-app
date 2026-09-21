// 政治客观题库回归测试（P3）
//
// 数据来源：mrwoov/kyzz（2010–2024 共 15 年回忆版 + 机构解析）
// 校验三层：
//   [A] 数据完整性：题量 / 年份覆盖 / 学科映射 / 分值与题干选项
//   [B] 归一化：整批通过 normalizeBank，且 id 不与 408 冲突
//   [C] 判分语义：多选「少选 / 错选 / 多选均不得分」这条考研规则
//
// 运行：node --experimental-strip-types scripts/verify-politics.mts
// 报告写入 scripts/.politics-report.txt（PowerShell 会话按 GBK 解码 stdout，中文必乱码）
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

const outNorm = path.join(__dirname, '.pol-norm.cjs')
const outGrade = path.join(__dirname, '.pol-grade.cjs')
bundle(path.join(root, 'src', 'lib', 'normalize.ts'), outNorm)
bundle(path.join(root, 'src', 'lib', 'grade.ts'), outGrade)

const require = createRequire(import.meta.url)
const { normalizeBank } = require(outNorm)
const { gradeAnswer, formatCorrectAnswer, typeLabel } = require(outGrade)

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
  year: number
  no: number
  type: string
  subject: string
  paper: string
  stem: string
  options?: Record<string, string>
  answer: string | string[]
  explanation: string
  score?: number
}

const raw = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'data', 'politics.json'), 'utf-8'),
) as Q[]
const bank = normalizeBank(raw) as Q[]

log('===== 政治客观题库回归 =====\n')
log(`原始题数 ${raw.length} · 归一化后 ${bank.length}\n`)

// ---------------------------------------------------------------- [A] 数据
log('[A] 数据完整性')

check('题数 = 495', bank.length === 495, bank.length)
check('全部归入 single / multi 两类', bank.every((q) => q.type === 'single' || q.type === 'multi'))

const singles = bank.filter((q) => q.type === 'single')
const multis = bank.filter((q) => q.type === 'multi')
check('单选 240 题', singles.length === 240, singles.length)
check('多选 255 题', multis.length === 255, multis.length)

const years = [...new Set(bank.map((q) => q.year))].sort((a, b) => a - b)
check('年份 = 2010–2024 连续 15 年', years.length === 15 && years[0] === 2010 && years[14] === 2024, years)

const perYear = new Map<number, { s: number; m: number }>()
for (const q of bank) {
  const st = perYear.get(q.year) ?? { s: 0, m: 0 }
  if (q.type === 'single') st.s++
  else st.m++
  perYear.set(q.year, st)
}
const yearBad = [...perYear.entries()].filter(([, v]) => v.s !== 16 || v.m !== 17)
check(
  '每年结构 = 16 单选 + 17 多选（共 33 题）',
  yearBad.length === 0,
  yearBad.map(([y, v]) => `${y}:${v.s}+${v.m}`),
)

// 学科映射：单选 1-4 马原 / 5-8 毛中特 / 9-12 史纲 / 13-14 思修法纪 / 15-16 时政
function expectSubject(type: string, no: number): string {
  if (type === 'single') {
    if (no <= 4) return '马原'
    if (no <= 8) return '毛中特'
    if (no <= 12) return '史纲'
    if (no <= 14) return '思修法纪'
    return '时政'
  }
  if (no <= 21) return '马原'
  if (no <= 26) return '毛中特'
  if (no <= 29) return '史纲'
  if (no <= 31) return '思修法纪'
  return '时政'
}
const wrongSubject = bank.filter((q) => q.subject !== expectSubject(q.type, q.no))
check('学科号段映射全部正确', wrongSubject.length === 0, wrongSubject.slice(0, 5).map((q) => `${q.id}:${q.subject}`))

const subjCount = new Map<string, number>()
for (const q of bank) subjCount.set(q.subject, (subjCount.get(q.subject) ?? 0) + 1)
check('五科齐全', subjCount.size === 5, [...subjCount.entries()])
check(
  '学科分布符合试卷结构（马原 135 / 毛中特 135 / 史纲 105 / 思修法纪 60 / 时政 60）',
  subjCount.get('马原') === 135 &&
    subjCount.get('毛中特') === 135 &&
    subjCount.get('史纲') === 105 &&
    subjCount.get('思修法纪') === 60 &&
    subjCount.get('时政') === 60,
  [...subjCount.entries()],
)

check('全部标记 paper=政治', bank.every((q) => q.paper === '政治'))
check('单选分值 = 1', singles.every((q) => q.score === 1), [...new Set(singles.map((q) => q.score))])
check('多选分值 = 2', multis.every((q) => q.score === 2), [...new Set(multis.map((q) => q.score))])
check('每题 4 个选项且均非空', bank.every((q) => q.options && ['A', 'B', 'C', 'D'].every((k) => !!q.options[k]?.trim())))
// 解析覆盖率：源仓库（mrwoov/kyzz）对 2022 / 2024 的 4 道时政题（15/16/32/33）
// 本身就没有解析（填的是「无」或空），这是数据源缺口而非解析器问题，故按覆盖率断言。
const noExpl = bank.filter((q) => q.explanation.trim().length <= 10)
check(
  '解析覆盖率 ≥ 98%（≥ 487/495）',
  noExpl.length <= 8 && bank.length - noExpl.length >= 487,
  { missing: noExpl.length, covered: bank.length - noExpl.length },
)
log(
  `    └ 已知缺口 ${noExpl.length} 题：${noExpl.map((q) => q.id).join(', ')} —— 源仓库该批时政题无解析，已记录`,
)
check('题干非空', bank.every((q) => q.stem.trim().length > 5))
check('id 唯一', new Set(bank.map((q) => q.id)).size === bank.length)

// ---------------------------------------------------------------- [B] 归一化
log('\n[B] 归一化与 id 空间')

const raw408 = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'data', 'questions.json'), 'utf-8'),
) as { id: string }[]
const ids408 = new Set(raw408.map((q) => q.id))
check('不与 408 单选 id 冲突', bank.every((q) => !ids408.has(q.id)))
check('id 前缀统一为 zz-', bank.every((q) => q.id.startsWith('zz-')))
check('归一化幂等', (normalizeBank(bank) as Q[]).length === bank.length)

// ---------------------------------------------------------------- [C] 判分
log('\n[C] 多选判分语义（少选 / 错选 / 多选均不得分）')

const KEYS = ['A', 'B', 'C', 'D']
const sampleMulti = multis[0]
check('多选答案至少 2 项', multis.every((q) => Array.isArray(q.answer) && q.answer.length >= 2), sampleMulti.answer)
check('多选答案无重复项', multis.every((q) => new Set(q.answer).size === q.answer.length))

const g1 = gradeAnswer(sampleMulti, { t: 'multi', ks: [...sampleMulti.answer] })
check('全选对 → 判对', g1.correct === true, g1)

const subset = { t: 'multi', ks: sampleMulti.answer.slice(0, sampleMulti.answer.length - 1) }
const g2 = gradeAnswer(sampleMulti, subset)
check('少选 → 判错（不给部分分）', g2.correct === false && g2.ratio === 0, g2)

const extra = KEYS.filter((k) => !sampleMulti.answer.includes(k))[0]
const g3 = gradeAnswer(sampleMulti, { t: 'multi', ks: [...sampleMulti.answer, extra] })
check('多选（含干扰项）→ 判错', g3.correct === false, g3)

const g4 = gradeAnswer(sampleMulti, { t: 'multi', ks: [extra] })
check('全错 → 判错', g4.correct === false, g4)

const g5 = gradeAnswer(sampleMulti, { t: 'multi', ks: [] })
check('空作答 → 不算有效作答', g5.answered === false, g5)

// 顺序无关：把正确项倒序提交仍应判对
const g6 = gradeAnswer(sampleMulti, { t: 'multi', ks: [...sampleMulti.answer].reverse() })
check('选项顺序无关', g6.correct === true, g6)

// 题干混入单选判定 → 应判为无效作答（类型不匹配）
const g7 = gradeAnswer(sampleMulti, { t: 'single', k: 'A' })
check('作答类型不匹配 → 无效', g7.answered === false, g7)

// 单选判分
const s1 = singles[0]
check('单选全对 → 判对', gradeAnswer(s1, { t: 'single', k: s1.answer as string }).correct === true)
const wrongKey = KEYS.find((k) => k !== s1.answer)!
check('单选选错 → 判错', gradeAnswer(s1, { t: 'single', k: wrongKey }).correct === false)

// 全库自洽：每题用标准答案作答都必须判对
const selfBad = bank.filter((q) => {
  const a = q.type === 'single' ? { t: 'single', k: q.answer as string } : { t: 'multi', ks: q.answer as string[] }
  return !gradeAnswer(q, a).correct
})
check('全库自洽：495 题以标准答案作答均判对', selfBad.length === 0, selfBad.slice(0, 5).map((q) => q.id))

log('\n[D] 展示口径')
check('typeLabel 覆盖 single/multi', typeLabel({ type: 'single' }) === '单选' && typeLabel({ type: 'multi' }) === '多选')
check('多选标准答案按字典序拼接展示', formatCorrectAnswer(sampleMulti) === [...sampleMulti.answer].sort().join(''), formatCorrectAnswer(sampleMulti))

// ---------------------------------------------------------------- 收尾
try {
  fs.unlinkSync(outNorm)
  fs.unlinkSync(outGrade)
} catch {
  /* ignore */
}

const report = [...LINES, '', `===== 结果：${pass} 通过 / ${fail} 失败 =====`].join('\n')
fs.writeFileSync(path.join(__dirname, '.politics-report.txt'), report, 'utf-8')
console.log(`\nPOLITICS: ${pass} pass / ${fail} fail -> scripts/.politics-report.txt`)
if (fail > 0) process.exit(1)
