// 题型引擎端到端验证：题库归一化 / 四类题型判分 / 持久化迁移
// 运行: node scripts/verify-engine.mjs   (cwd = quiz-app)
import { buildSync } from 'esbuild'
import { createRequire } from 'module'
import { unlinkSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outfile = path.join(__dirname, 'engine-bundle.cjs')

// 把 normalize.ts + grade.ts 打包成一个 CJS（无需临时入口文件）
buildSync({
  stdin: {
    contents: `export * from './src/lib/normalize'\nexport * from './src/lib/grade'`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile,
  logLevel: 'silent',
})

const require = createRequire(import.meta.url)
const eng = require(outfile)
const { normalizeBank, normalizeQuestion, normalizeAnswer, canonText, blankCorrect, gradeAnswer, isCorrect, isAnswered, formatAnswer } = eng

const raw = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'questions.json'), 'utf8'))

let pass = 0
let fail = 0
function assert(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  \u2713 ${name}`)
  } else {
    fail++
    console.log(`  \u2717 ${name} ${extra}`)
  }
}

// ============================================================
console.log('\n[A] 存量题库归一化（596 题零迁移）')
// ============================================================
const bank = normalizeBank(raw)
assert(`题数保持 596`, bank.length === raw.length, `got ${bank.length} vs ${raw.length}`)
assert(`全部归入 single 分支`, bank.every((q) => q.type === 'single'))
assert(`全部补齐 paper`, bank.every((q) => q.paper === '408'))
assert(
  `subject 分布不变`,
  JSON.stringify(countBy(bank, (q) => q.subject)) === JSON.stringify(countBy(raw, (q) => q.subject)),
  JSON.stringify(countBy(bank, (q) => q.subject)),
)
assert(
  `answer 全部合法 A-D`,
  bank.every((q) => ['A', 'B', 'C', 'D'].includes(q.answer)),
)
assert(
  `options 全部 4 键完整`,
  bank.every((q) => q.options && ['A', 'B', 'C', 'D'].every((k) => typeof q.options[k] === 'string')),
)
assert(`id 唯一`, new Set(bank.map((q) => q.id)).size === bank.length)
const latexStem = bank.filter((q) => q.stem.includes('$')).length
const latexAny = bank.filter((q) => q.stem.includes('$') || q.explanation.includes('$')).length
assert(`题干含 LaTeX 的题 = 108`, latexStem === 108, `got ${latexStem}`)
assert(`题干或解析含 LaTeX 的题 = 133（公式渲染受益面）`, latexAny === 133, `got ${latexAny}`)
assert(`归一化幂等`, normalizeBank(bank).length === bank.length)

// 不可用数据应被剔除
assert(`缺 id 被剔除`, normalizeQuestion({ stem: 'x', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'A' }) === null)
assert(`缺 stem 被剔除`, normalizeQuestion({ id: 'x', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'A' }) === null)
assert(`answer 非法被剔除`, normalizeQuestion({ id: 'x', stem: 's', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'Z' }) === null)
assert(`options 缺键被剔除`, normalizeQuestion({ id: 'x', stem: 's', options: { A: '1', B: '2' }, answer: 'A' }) === null)
assert(`重复 id 去重`, normalizeBank([
  { id: 'd1', stem: 's', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'A' },
  { id: 'd1', stem: 's2', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'B' },
]).length === 1)

// ============================================================
console.log('\n[B] 旧持久化数据迁移（v0 裸字符串 → v1 判别联合）')
// ============================================================
assert(`'A' → single`, JSON.stringify(normalizeAnswer('A')) === JSON.stringify({ t: 'single', k: 'A' }))
assert(`null → null`, normalizeAnswer(null) === null)
assert(`undefined → null`, normalizeAnswer(undefined) === null)
assert(
  `新格式透传`,
  JSON.stringify(normalizeAnswer({ t: 'multi', ks: ['A', 'C'] })) === JSON.stringify({ t: 'multi', ks: ['A', 'C'] }),
)
assert(
  `无 t 但有 k 的能救回`,
  JSON.stringify(normalizeAnswer({ k: 'B' })) === JSON.stringify({ t: 'single', k: 'B' }),
)
assert(`无法识别的返回 null`, normalizeAnswer({ foo: 1 }) === null)

// ============================================================
console.log('\n[C] 单选判分')
// ============================================================
const sc = { id: 's1', type: 'single', year: 2020, no: 1, subject: '数据结构', paper: '408', stem: 'q', explanation: '', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'C' }
assert(`选对 → correct`, gradeAnswer(sc, { t: 'single', k: 'C' }).correct === true)
assert(`选错 → incorrect`, gradeAnswer(sc, { t: 'single', k: 'A' }).correct === false)
assert(`未作答 → answered=false`, gradeAnswer(sc, null).answered === false)
assert(`作答类型不匹配 → 未作答`, gradeAnswer(sc, { t: 'multi', ks: ['C'] }).answered === false)
assert(`文案含正确答案`, gradeAnswer(sc, { t: 'single', k: 'A' }).label.includes('C'))

// ============================================================
console.log('\n[D] 多选判分（少选/错选/多选均不得分）')
// ============================================================
const mc = { ...sc, id: 'm1', type: 'multi', answer: ['A', 'C'] }
assert(`全对 → correct`, gradeAnswer(mc, { t: 'multi', ks: ['A', 'C'] }).correct === true)
assert(`顺序无关`, gradeAnswer(mc, { t: 'multi', ks: ['C', 'A'] }).correct === true)
assert(`少选 → 错`, gradeAnswer(mc, { t: 'multi', ks: ['A'] }).correct === false)
assert(`多选 → 错`, gradeAnswer(mc, { t: 'multi', ks: ['A', 'C', 'D'] }).correct === false)
assert(`错选 → 错`, gradeAnswer(mc, { t: 'multi', ks: ['A', 'B'] }).correct === false)
assert(`空选 → 未作答`, gradeAnswer(mc, { t: 'multi', ks: [] }).answered === false)
assert(`少选提示文案`, gradeAnswer(mc, { t: 'multi', ks: ['A'] }).label.includes('少选'))

// ============================================================
console.log('\n[E] 填空等价性判定')
// ============================================================
assert(`精确匹配`, blankCorrect({ answer: '192' }, '192') === true)
assert(`首尾空白忽略`, blankCorrect({ answer: '192' }, '  192  ') === true)
assert(`中间空白忽略`, blankCorrect({ answer: '1 024' }, '1024') === true)
assert(`全角括号等价`, blankCorrect({ answer: '(1,2)' }, '（1,2）') === true)
assert(`全角逗号等价`, blankCorrect({ answer: '1,2' }, '1，2') === true)
assert(`大小写不敏感`, blankCorrect({ answer: 'AbC' }, 'abc') === true)
assert(`分数与小数等价 1/2 = 0.5`, blankCorrect({ answer: '1/2' }, '0.5') === true)
assert(`尾随句号忽略`, blankCorrect({ answer: '192' }, '192.') === true)
assert(`不同答案不误判`, blankCorrect({ answer: '192' }, '193') === false)
assert(`空输入不通过`, blankCorrect({ answer: '192' }, '') === false)
assert(`accept 白名单命中`, blankCorrect({ answer: 'x=1', accept: ['1'] }, '1') === true)
// P4 起等价判定会剥离变量名前缀（x=1 与 1 等价）—— 这是刻意的规则，
// 因为考研填空题的答案常写成 "x=1"，而考生只填数值。故原来那条
// 「accept 白名单外不通过」的断言与新规则矛盾，改测白名单的真实职责：
// 提供「非数值同义别名」（中文名、等价符号等）的兜底。
assert(`变量名前缀剥离（P4 规则：x=1 与 1 等价）`, blankCorrect({ answer: 'x=1' }, '1') === true)
assert(`accept 白名单用于同义别名`, blankCorrect({ answer: '192', accept: ['一百九十二'] }, '一百九十二') === true)
assert(`白名单外仍不通过（数值不等）`, blankCorrect({ answer: '192', accept: ['一百九十二'] }, '193') === false)
assert(`1/3 不与 0.333 混同（容差收紧）`, blankCorrect({ answer: '1/3' }, '0.333') === false)

const bq = { ...sc, id: 'b1', type: 'blank', blanks: [{ answer: '192' }, { answer: '64' }] }
assert(`双空全对`, gradeAnswer(bq, { t: 'blank', vs: ['192', '64'] }).correct === true)
assert(`部分对 ratio=0.5`, Math.abs(gradeAnswer(bq, { t: 'blank', vs: ['192', '60'] }).ratio - 0.5) < 1e-9)
assert(`部分对 → correct=false`, gradeAnswer(bq, { t: 'blank', vs: ['192', '60'] }).correct === false)
assert(`全空 → 未作答`, gradeAnswer(bq, { t: 'blank', vs: ['', ''] }).answered === false)

// ============================================================
console.log('\n[F] 综合应用题自评判分')
// ============================================================
const aq = {
  ...sc, id: 'a1', type: 'applied', totalScore: 15, paper: '408',
  parts: [
    { no: 1, stem: '设计思想', answer: '哈希辅助', score: 4 },
    { no: 2, stem: '类型定义', answer: 'struct', score: 3 },
    { no: 3, stem: '算法描述', answer: '代码', score: 5 },
    { no: 4, stem: '复杂度', answer: 'O(m)', score: 3 },
  ],
}
assert(`全自评满分 → correct`, gradeAnswer(aq, { t: 'applied', scores: [1, 1, 1, 1] }).correct === true)
assert(`全 0 → incorrect, ratio 0`, (() => { const g = gradeAnswer(aq, { t: 'applied', scores: [0, 0, 0, 0] }); return g.correct === false && g.ratio === 0 })())
assert(`3 对 1 错 → ratio 0.75`, Math.abs(gradeAnswer(aq, { t: 'applied', scores: [1, 1, 1, 0] }).ratio - 0.75) < 1e-9)
assert(`2 对 2 半 → ratio 0.75`, Math.abs(gradeAnswer(aq, { t: 'applied', scores: [1, 1, 0.5, 0.5] }).ratio - 0.75) < 1e-9)
assert(`恰好 60% → 判定为掌握`, gradeAnswer(aq, { t: 'applied', scores: [1, 1, 0.5, 0] }).correct === true)
assert(`低于 60% → 未掌握`, gradeAnswer(aq, { t: 'applied', scores: [1, 0.5, 0, 0] }).correct === false)
assert(`空自评 → 未作答`, gradeAnswer(aq, { t: 'applied', scores: [] }).answered === false)
assert(`越界分数被夹紧`, Math.abs(gradeAnswer(aq, { t: 'applied', scores: [2, 2, 2, 2] }).ratio - 1) < 1e-9)

// ============================================================
console.log('\n[G] 工具函数')
// ============================================================
assert(`isCorrect 便捷`, isCorrect(sc, { t: 'single', k: 'C' }) === true)
assert(`isAnswered 单选`, isAnswered({ t: 'single', k: 'A' }) === true)
assert(`isAnswered 空填空`, isAnswered({ t: 'blank', vs: ['', '  '] }) === false)
assert(`formatAnswer 单选`, formatAnswer({ t: 'single', k: 'B' }) === 'B')
assert(`formatAnswer 多选排序`, formatAnswer({ t: 'multi', ks: ['C', 'A'] }) === 'AC')
assert(`formatAnswer null`, formatAnswer(null) === '—')
assert(`formatAnswer 自评百分比`, formatAnswer({ t: 'applied', scores: [1, 1, 1, 0] }) === '自评 75%')
assert(`canonText 归一`, canonText('  1 024．') === '1024')

// ============================================================
console.log('\n[H] 真实题库回归（用引擎重判全部 596 题）')
// ============================================================
let mismatch = 0
for (const q of bank) {
  const g = gradeAnswer(q, { t: 'single', k: q.answer })
  if (!g.correct) mismatch++
  const bad = gradeAnswer(q, { t: 'single', k: q.answer === 'A' ? 'B' : 'A' })
  if (bad.correct) mismatch++
}
assert(`596 题正答全部判对、误答全部判错`, mismatch === 0, `mismatch=${mismatch}`)

function countBy(arr, fn) {
  const m = {}
  for (const x of arr) {
    const k = fn(x)
    m[k] = (m[k] || 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort())
}

console.log(`\n===== 结果: ${pass} 通过, ${fail} 失败 =====`)
try { unlinkSync(outfile) } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1)
