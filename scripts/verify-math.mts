// 数学一客观题库 + 等价答案判定回归测试（P4）
//
// 数据来源：TsekaLuk/Kaoyan-Math1-Papers（真题 + solutions/YYYY年解析）
// 校验四层：
//   [A] 数据完整性：题量 / 年份 / 题型 / 分值随年份结构变化
//   [B] 归一化 + id 空间
//   [C] 等价答案判定（P4 真正的难点）：分数/小数、LaTeX 结构、x=1 与 1、多解乱序、单位
//   [D] 误判防线：安全边界 + 过度宽容检测（不同答案不能被判成相等）
//
// 运行：node --experimental-strip-types scripts/verify-math.mts
// 报告写入 scripts/.math-report.txt
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

const outNorm = path.join(__dirname, '.math-norm.cjs')
const outGrade = path.join(__dirname, '.math-grade.cjs')
bundle(path.join(root, 'src', 'lib', 'normalize.ts'), outNorm)
bundle(path.join(root, 'src', 'lib', 'grade.ts'), outGrade)

const require = createRequire(import.meta.url)
const { normalizeBank } = require(outNorm)
const { gradeAnswer, blankCorrect, canonText } = require(outGrade)

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

type Spec = { answer: string; accept?: string[]; unit?: string }
type Q = {
  id: string
  year: number
  no: number
  type: string
  subject: string
  paper: string
  stem: string
  options?: Record<string, string>
  answer?: string
  blanks?: Spec[]
  explanation: string
  score?: number
}

const raw = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'data', 'math.json'), 'utf-8'),
) as Q[]
const bank = normalizeBank(raw) as Q[]

log('===== 数学一客观题库 + 等价答案判定回归 =====\n')
log(`原始题数 ${raw.length} · 归一化后 ${bank.length}\n`)

// ---------------------------------------------------------------- [A] 数据
log('[A] 数据完整性')

check('归一化后题数 = 218（源 219，math-2023-06 因选项缺失被剔除）', bank.length === 218, bank.length)
// 与解析器解耦：无论剔除发生在解析阶段还是归一化阶段，走进题库的都不能有空选项题
const emptyOptInBank = bank.filter(
  (q) => q.type === 'single' && ['A', 'B', 'C', 'D'].some((k) => !String(q.options?.[k] ?? '').trim()),
)
check(
  '空选项题一律不进入题库（已知剔除：math-2023-06，源解析该题 A–D 全空）',
  emptyOptInBank.length === 0,
  emptyOptInBank.map((q) => q.id),
)
check('题型仅 single / blank', bank.every((q) => q.type === 'single' || q.type === 'blank'))

const singles = bank.filter((q) => q.type === 'single')
const blanks = bank.filter((q) => q.type === 'blank')
check('选择题 123 题（源 110 - 1 剔除 + 2024 全年 10 + 2025 补 4）', singles.length === 123, singles.length)
check('填空题 95 题（89 + 2024 全年 6）', blanks.length === 95, blanks.length)

const years = [...new Set(bank.map((q) => q.year))].sort((a, b) => a - b)
check(
  '年份 = 2010–2025 连续 16 年（2024 由 TsekaLuk/Kaoyan-Math1-Papers 人工核对补录）',
  years.length === 16 && years[0] === 2010 && years[15] === 2025,
  years,
)

// 2024 / 2025 两年应覆盖全部客观题（10 选择 + 6 填空）
for (const y of [2024, 2025]) {
  const qs = bank.filter((q) => q.year === y)
  check(
    `${y} 年 = 10 选择 + 6 填空，id 连续（math-${y}-01 … 16）`,
    qs.filter((q) => q.type === 'single').length === 10 &&
      qs.filter((q) => q.type === 'blank').length === 6 &&
      qs.every((q, i) => qs.map((x) => x.no).sort((a, b) => a - b)[i] === i + 1),
    qs.map((q) => q.id).join(','),
  )
}

// 题干内嵌图必须有对应文件（public/images/），否则运行时是裂图
const imgRefs = bank.flatMap((q) => [...q.stem.matchAll(/!\[[^\]]*\]\(images\/([^)]+)\)/g)].map((m) => m[1]))
const imgMissing = [...new Set(imgRefs)].filter((f) => !fs.existsSync(path.join(root, 'public', 'images', f)))
check(
  `题干内嵌图均有对应文件（共 ${new Set(imgRefs).size} 张）`,
  imgMissing.length === 0,
  imgMissing,
)

// 存量修复回归：Symbol 字体 PUA 负号（U+F02D）曾把答案变成不可见字符
const ansOf = (id: string) => bank.find((q) => q.id === id)!.blanks![0].answer
check('math-2025-11 答案 = -1（PUA 坏负号已修复）', ansOf('math-2025-11') === '-1', ansOf('math-2025-11'))
check('math-2025-15 答案 = -4（PUA 坏负号已修复）', ansOf('math-2025-15') === '-4', ansOf('math-2025-15'))
check('全库无私有区（PUA）残留字符', !/[\uE000-\uF8FF]/.test(JSON.stringify(bank)))

const perYear = new Map<number, { s: number; b: number }>()
for (const q of bank) {
  const st = perYear.get(q.year) ?? { s: 0, b: 0 }
  if (q.type === 'single') st.s++
  else st.b++
  perYear.set(q.year, st)
}
const thinYears = [...perYear.entries()].filter(([, v]) => v.s + v.b < 10)
check('每年至少 10 题（源 OCR 缺口已控制在个位数）', thinYears.length === 0, thinYears)
log(
  `    └ 各年题量：${[...perYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, v]) => `${y}:${v.s}+${v.b}`)
    .join('  ')}`,
)

check('全部标记 paper=数学一', bank.every((q) => q.paper === '数学一'))
const scores = [...new Set(bank.map((q) => q.score))].sort()
check('分值仅 4 / 5（2023 起试卷结构由 8 选择改为 10 选择，逐题分值随年份变化）', scores.every((s) => s === 4 || s === 5), scores)
check('选择题每题 4 个非空选项', singles.every((q) => q.options && ['A', 'B', 'C', 'D'].every((k) => !!q.options![k]?.trim())))
check('选择题答案合法', singles.every((q) => ['A', 'B', 'C', 'D'].includes(q.answer as string)))
check('填空题至少 1 空且答案非空', blanks.every((q) => q.blanks!.length >= 1 && q.blanks!.every((b) => b.answer.trim().length > 0)))
check('三科齐全（高等数学 / 线性代数 / 概率统计）', new Set(bank.map((q) => q.subject)).size === 3, [...new Set(bank.map((q) => q.subject))])
check('id 唯一', new Set(bank.map((q) => q.id)).size === bank.length)

const withExpl = bank.filter((q) => q.explanation.trim().length > 20).length
check('解析覆盖率 ≥ 90%（源自 solutions 目录的完整解析）', withExpl / bank.length >= 0.9, {
  withExpl,
  total: bank.length,
  pct: Math.round((withExpl / bank.length) * 100),
})

// ---------------------------------------------------------------- [B] 归一化
log('\n[B] 归一化与 id 空间')

const otherIds = new Set<string>([
  ...(JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'questions.json'), 'utf-8')) as { id: string }[]).map((q) => q.id),
  ...(JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'applied.json'), 'utf-8')) as { id: string }[]).map((q) => q.id),
  ...(JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'politics.json'), 'utf-8')) as { id: string }[]).map((q) => q.id),
])
check('不与 408 / 政治 id 冲突', bank.every((q) => !otherIds.has(q.id)))
check('id 前缀统一为 math-', bank.every((q) => q.id.startsWith('math-')))
check('归一化幂等', (normalizeBank(bank) as Q[]).length === bank.length)

// ---------------------------------------------------------------- [C] 等价判定
log('\n[C] 等价答案判定（P4 核心难点）')

const EQ: [Spec, string, boolean, string][] = [
  [{ answer: '2/3' }, '0.6666666667', true, '分数 ↔ 小数'],
  [{ answer: '1/2' }, '0.5', true, '分数 ↔ 小数（精确）'],
  [{ answer: '$\\frac{\\pi}{4}$' }, 'pi/4', true, 'LaTeX \\frac ↔ 纯文本'],
  [{ answer: '$\\frac{\\pi}{4}$' }, '0.7853981633974483', true, 'LaTeX 分数 ↔ 数值'],
  [{ answer: '$\\sqrt{2}$' }, '2^(1/2)', true, 'LaTeX 根式 ↔ 幂形式'],
  [{ answer: '$\\sqrt{3}$' }, '1.7320508075688772', true, '根式 ↔ 数值'],
  [{ answer: '$x=1$' }, '1', true, '带变量名 ↔ 裸值'],
  [{ answer: '$\\pi$' }, 'pi', true, 'π ↔ pi'],
  [{ answer: '$\\pi$' }, '3.14159265358979', true, 'π ↔ 数值'],
  [{ answer: '1', accept: ['一'] }, '一', true, 'accept 白名单'],
  [{ answer: '-1,1' }, '1,-1', true, '多解乱序'],
  [{ answer: '2', unit: '个' }, '2', true, '带单位'],
  [{ answer: '(1,2)' }, '（1,2）', true, '全角括号'],
  [{ answer: 'e^{-1}' }, '0.3678794411714423', true, '指数表达式 ↔ 数值'],
  [{ answer: '$\\frac{1}{2}$' }, '1/2', true, 'LaTeX 分数 ↔ 斜杠分数'],

  [{ answer: '1/2' }, '2', false, '不同值不判等'],
  [{ answer: '0' }, '1', false, '0 与 1 不判等'],
  [{ answer: '-1,1' }, '1,2', false, '多解集合不同不判等'],
  [{ answer: '2/3' }, '0.7', false, '超出容差不判等'],
  [{ answer: '1' }, '', false, '空输入不判等'],
]

for (const [spec, input, want, why] of EQ) {
  const got = blankCorrect(spec, input)
  check(`${want ? '应判等' : '不应判等'} · ${why}：${JSON.stringify(spec.answer)} vs ${JSON.stringify(input)}`, got === want, { got, want })
}

// 全库自洽：每题以标准答案作答必须判对
const selfBad = bank.filter((q) => {
  if (q.type === 'single') return !gradeAnswer(q, { t: 'single', k: q.answer as string }).correct
  return !gradeAnswer(q, { t: 'blank', vs: q.blanks!.map((b) => b.answer) }).correct
})
check('全库自洽：218 题以标准答案作答均判对', selfBad.length === 0, selfBad.slice(0, 5).map((q) => q.id))

// ---------------------------------------------------------------- [D] 误判防线
log('\n[D] 误判防线')

const SECURITY = [
  'constructor',
  'globalThis',
  'process.exit(1)',
  '(()=>{})()',
  'require("fs")',
  '[].constructor',
  '__proto__',
  'toString()',
  'this',
  'eval("1")',
]
const securityHits = SECURITY.filter((s) => blankCorrect({ answer: '1' }, s))
check('原型链 / 全局对象 / 语句注入一律不判等（受限求值器无成员访问与赋值语法）', securityHits.length === 0, securityHits)

const junkHits = ['√√√', '???', 'zzzz', '***', '///'].filter((s) => blankCorrect({ answer: '2/3' }, s))
check('垃圾输入不误判为正确', junkHits.length === 0, junkHits)

// 过度宽容检测：答案库里数值明显不同的两项，不能被判成相等
const numOf = (s: string): number | null => {
  const t = canonText(s)
  const n = Number(t)
  if (Number.isFinite(n)) return n
  const m = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(t)
  if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2])
  return null
}
const specs = blanks
  .map((q) => ({ id: q.id, spec: q.blanks![0] }))
  .filter((x) => numOf(x.spec.answer) !== null)

let checkedPairs = 0
const overPermissive: string[] = []
for (let i = 0; i < specs.length; i++) {
  for (let j = i + 1; j < specs.length; j++) {
    const va = numOf(specs[i].spec.answer)!
    const vb = numOf(specs[j].spec.answer)!
    if (Math.abs(va - vb) <= 0.01) continue
    checkedPairs++
    if (checkedPairs > 400) break
    if (blankCorrect(specs[i].spec, specs[j].spec.answer)) {
      overPermissive.push(`${specs[i].id}(${specs[i].spec.answer}) ≈ ${specs[j].id}(${specs[j].spec.answer})`)
    }
  }
  if (checkedPairs > 400) break
}
check(
  `过度宽容检测：抽查 ${checkedPairs} 组数值明显不同的答案，均不判等`,
  overPermissive.length === 0,
  overPermissive.slice(0, 5),
)

// 受限求值器在真实题库上的覆盖率（说明等价判定确实在干活，而不是全靠字符串比较）
const evaluable = specs.filter((x) => {
  const t = canonText(x.spec.answer)
  return blankCorrect({ answer: t }, String(numOf(x.spec.answer)))
}).length
log(`    └ 填空题中纯数值可求值的 ${specs.length}/${blanks.length} 题，其中 ${evaluable} 题数值等价路径生效`)

// 填空部分对 → ratio 反映比例
const multiBlank = blanks.find((q) => q.blanks!.length >= 2)
if (multiBlank) {
  const vs = multiBlank.blanks!.map((b, i) => (i === 0 ? b.answer : '###zzz###'))
  const g = gradeAnswer(multiBlank, { t: 'blank', vs })
  check('填空部分答对 → ratio = 答对空数 / 总空数', g.correct === false && Math.abs(g.ratio - 1 / multiBlank.blanks!.length) < 1e-9, { id: multiBlank.id, ratio: g.ratio, n: multiBlank.blanks!.length })
} else {
  log('    └ （题库中无多空填空题，跳过 ratio 比例用例）')
}

// ---------------------------------------------------------------- 收尾
try {
  fs.unlinkSync(outNorm)
  fs.unlinkSync(outGrade)
} catch {
  /* ignore */
}

const report = [...LINES, '', `===== 结果：${pass} 通过 / ${fail} 失败 =====`].join('\n')
fs.writeFileSync(path.join(__dirname, '.math-report.txt'), report, 'utf-8')
console.log(`\nMATH: ${pass} pass / ${fail} fail -> scripts/.math-report.txt`)
if (fail > 0) process.exit(1)
