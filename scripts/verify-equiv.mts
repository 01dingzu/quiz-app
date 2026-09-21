// 答案等价判定验证：受限求值器安全性 / LaTeX 归一 / 四层等价 / 全库自洽
// 运行: node scripts/verify-equiv.mts   (cwd = quiz-app)
import { buildSync } from 'esbuild'
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outfile = path.join(__dirname, 'equiv-bundle.cjs')

buildSync({
  stdin: {
    contents: `export * from './src/lib/mathExpr'\nexport * from './src/lib/equiv'`,
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
const mod = require(outfile)
const { evaluateMath, nearlyEqual, latexToText, canonMath, splitMulti, mathEqual } = mod

// 这里直接读原始 JSON（199 题），校验的是求值器与等价规则本身。
// 「归一化后进入题库的可用题量（198，剔除 math-2023-06 空选项题）」由
// scripts/verify-math.mts 负责，两份脚本分工不要混。
const mathBank = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'math.json'), 'utf8'))

let pass = 0
let fail = 0
const LINES = []
// 输出直接写文件：PowerShell 会话按 GBK 解码 node 的 UTF-8 stdout，中文必乱码
const log = (s) => {
  LINES.push(String(s))
}
function assert(name, cond, extra = '') {
  if (cond) {
    pass++
    log(`  \u2713 ${name}`)
  } else {
    fail++
    log(`  \u2717 ${name} ${extra}`)
  }
}
const val = (s) => {
  const r = evaluateMath(s)
  return r.ok ? r.value : null
}

// ============================================================
log('\n[A] 受限求值器：功能')
// ============================================================
assert('1+1 = 2', val('1+1') === 2)
assert('2*3+4 = 10', val('2*3+4') === 10)
assert('2^10 = 1024', val('2^10') === 1024)
assert('2^3^2 = 512（右结合）', val('2^3^2') === 512)
assert('(1+2)*3 = 9', val('(1+2)*3') === 9)
assert('隐式乘法 2pi', nearlyEqual(val('2pi'), 2 * Math.PI))
assert('隐式乘法 2(3+1) = 8', val('2(3+1)') === 8)
assert('隐式乘法 2ln2', nearlyEqual(val('2ln2'), 2 * Math.LN2))
assert('sqrt(2)', nearlyEqual(val('sqrt(2)'), Math.SQRT2))
assert('sqrt2 无括号', nearlyEqual(val('sqrt2'), Math.SQRT2))
assert('ln(e) = 1', nearlyEqual(val('ln(e)'), 1))
assert('sin(pi/2) = 1', nearlyEqual(val('sin(pi/2)'), 1))
assert('负号 -3+1 = -2', val('-3+1') === -2)
assert('小数 .5', val('.5') === 0.5)
assert('1/0 得 Infinity', val('1/0') === Infinity)

// ============================================================
log('\n[B] 受限求值器：安全边界（绝不能执行代码）')
// ============================================================
for (const evil of [
  'constructor',
  'globalThis',
  'process',
  'process.exit(1)',
  '(()=>{})()',
  '1;2',
  'a=1',
  'this',
  'require("fs")',
  'alert(1)',
  '[].constructor',
  '1+1; 2+2',
]) {
  const r = evaluateMath(evil)
  assert(`拒绝 ${JSON.stringify(evil)}`, r.ok === false, JSON.stringify(r))
}
assert('空输入被拒', evaluateMath('').ok === false)
assert('纯符号被拒', evaluateMath('\\alpha+1'.replace('\\', '')).ok === false)

// ============================================================
log('\n[C] LaTeX 归一')
// ============================================================
assert('去 $', latexToText('$x^2$') === 'x^2')
assert('\\frac 展开', latexToText('\\frac{1}{2}') === '((1)/(2))')
assert('嵌套 \\frac', !latexToText('\\frac{\\frac{1}{2}}{3}').includes('frac'))
assert('\\sqrt 展开', latexToText('\\sqrt{2}') === 'sqrt(2)')
assert('\\sqrt[n]{x} 展开', latexToText('\\sqrt[3]{8}').includes('^(1/(3))'))
assert('\\mathrm{e} -> e', latexToText('\\mathrm{e}^x') === 'e^x')
assert('\\ln -> ln', latexToText('\\ln (1 + \\sqrt{2})').startsWith('ln'))
assert('\\pi -> pi', latexToText('\\frac{\\pi}{4}') === '((pi)/(4))')
assert('去 left/right', !latexToText('\\left(1\\right)').includes('left'))
assert('全角括号转半角', canonMath('（1）') === '(1)')

// ============================================================
log('\n[D] 等价判定：应当判对')
// ============================================================
const E = (answer, input, accept) => mathEqual({ answer, accept }, input)
assert('\\frac{\\pi}{4} ≈ pi/4', E('$\\frac{\\pi}{4}$', 'pi/4'))
assert('\\frac{\\pi}{4} ≈ \\pi/4', E('$\\frac{\\pi}{4}$', '\\pi/4'))
assert('\\frac{\\pi}{4} ≈ 0.7853981634', E('$\\frac{\\pi}{4}$', '0.7853981634'))
assert('2/3 ≈ 0.6666666667', E('$\\frac{2}{3}$', '0.6666666667'))
assert('\\ln(1+\\sqrt{2}) ≈ ln(1+sqrt2)', E('$\\ln (1 + \\sqrt{2})$', 'ln(1+sqrt2)'))
assert('x=1 接受 1', E('$x = 1$', '1'))
assert('多解 1 或 -1 接受 -1,1', E('$1$ 或 $-1$', '-1,1'))
assert('多解 1 或 -1 接受 1;-1', E('$1$ 或 $-1$', '1;-1'))
assert('2x-y-z-1=0 原样', E('$2x - y - z - 1 = 0$', '2x-y-z-1=0'))
assert('e^x 原样', E('$\\mathrm{e}^x$', 'e^x'))
assert('e^{-2} ≈ 0.1353352832', E('$\\mathrm{e}^{-2}$', '0.1353352832'))
assert('accept 白名单', E('$\\frac{1}{2}$', '0.5', ['0.5']))
assert('4 与 4.0', E('$4$', '4.0'))
assert('-\\frac{1}{2} ≈ -0.5', E('$-\\frac{1}{2}$', '-0.5'))
assert('\\sqrt{3} ≈ 1.7320508076', E('$\\sqrt{3}$', '1.7320508076'))
assert('空白容忍', E('$ 1 $', ' 1 '))

// ============================================================
log('\n[E] 等价判定：应当判错')
// ============================================================
assert('π/4 ≠ pi/3', !E('$\\frac{\\pi}{4}$', 'pi/3'))
assert('2/3 ≠ 0.667（近似值不够精确）', !E('$\\frac{2}{3}$', '0.667'))
assert('1 ≠ -1', !E('$1$', '-1'))
assert('空输入判错', !E('$1$', '   '))
assert('多解少给一项判错', !E('$1$ 或 $-1$', '1'))
assert('多解多给一项判错', !E('$1$ 或 $-1$', '1,-1,0'))
assert('错答判错', !E('$\\ln 2$', 'ln3'))
assert('非数学字符串不误判', !E('$\\alpha$', 'x'))

// ============================================================
log('\n[F] 全库自洽：199 道数学题答案必须判自己为对')
// ============================================================
const blanks = mathBank.filter((q) => q.type === 'blank')
const choices = mathBank.filter((q) => q.type === 'single')
assert(`填空题 ${blanks.length} 道`, blanks.length > 80, String(blanks.length))
assert(`选择题 ${choices.length} 道`, choices.length > 100, String(choices.length))

const badBlank = blanks.filter((q) => !mathEqual(q.blanks[0], q.blanks[0].answer))
assert('每道填空题的答案自洽', badBlank.length === 0, badBlank.slice(0, 4).map((q) => q.id + ' ' + q.blanks[0].answer).join(' | '))

const blankNoNumber = blanks.filter((q) => evaluateMath(latexToText(q.blanks[0].answer)).ok)
assert(
  `可数值化的填空题 ${blankNoNumber.length} 道（其余为方程/表达式类）`,
  blankNoNumber.length > 0,
)

// 归一后不应残留 LaTeX 残渣
const dirty = blanks.filter((q) => /[\\{}]/.test(latexToText(q.blanks[0].answer)))
assert('归一后无 LaTeX 残渣', dirty.length === 0, dirty.slice(0, 4).map((q) => q.id + ' ' + latexToText(q.blanks[0].answer)).join(' | '))

// 选项文本不应含残留 $
const dirtyOpt = choices.filter((q) => Object.values(q.options).some((v) => (v.match(/\$/g) || []).length % 2 === 1))
assert(`选项 LaTeX 已配平（${choices.length} 道中）`, dirtyOpt.length === 0, dirtyOpt.slice(0, 4).map((q) => q.id).join(' | '))

log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`)
writeFileSync(path.join(__dirname, '.equiv-report.txt'), LINES.join('\n'), 'utf8')
process.exit(fail === 0 ? 0 : 1)
