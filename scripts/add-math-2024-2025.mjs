/**
 * P4 补录：2024 年数学一客观题（16 道，来自 TsekaLuk/Kaoyan-Math1-Papers，
 * 逐题人工核对答案：1C 2A 3A 4B 5B 6D 7A 8B 9D 10D / 11=6 12=5 13=-1/π
 * 14=x=tan(y+π/4)-y 15=a≥0 16=2/3），并补齐 2025 年缺失的 04/08/09/10 四道。
 *
 * 同时修复两道存量 2025 题的答案负号丢失（源文件 OCR 把「−1」「−4」的负号吃掉了，
 * 解析步骤里可验证应为负值）：math-2025-11: 1 → -1；math-2025-15: 4 → -4。
 *
 * 幂等性：若检测到 math-2024-01 已存在则拒绝重复写入。
 * 用法：node scripts/add-math-2024-2025.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'src', 'data', 'math.json')
const bank = JSON.parse(readFileSync(file, 'utf-8'))

const ids = new Set(bank.map((q) => q.id))
if (ids.has('math-2024-01')) {
  console.error('ABORT: math-2024-01 already exists (already migrated?)')
  process.exit(1)
}

/**
 * 存量修复（源自同一 PDF 抽取源的 Symbol 字体 PUA 残留）：
 *  - math-2025-11 / math-2025-15 的填空答案是 U+F02D（坏负号）→ 应为 -1 / -4
 *  - math-2025-03 / math-2025-07 的解析被 OCR 毁坏（含 10 个 PUA 字符）→ 重写
 *  - math-2025-13 题干把 ∂ 渲染成 α̂/σ̂ → 重写
 * 全局把已知 Symbol-PUA 映射回真实字符，最后断言库内 PUA 清零。
 *
 * 幂等性：若检测到 math-2024-01 已存在则拒绝重复写入。
 * 用法：node scripts/add-math-2024-2025.mjs
 */
// ---- Symbol 字体 PUA → 真实字符（未知码位保留，最后断言清零） ----
const PUA_MAP = {
  '\uF028': '(', '\uF029': ')', '\uF02D': '-', '\uF03D': '=',
  '\uF0B6': '∂', '\uF0F2': '∫',
}
const clean = (s) =>
  typeof s === 'string' ? s.replace(/[\uE000-\uF8FF]/g, (c) => PUA_MAP[c] ?? '') : s
const cleanQ = (q) => {
  for (const k of ['stem', 'explanation']) q[k] = clean(q[k])
  if (q.options) for (const k of Object.keys(q.options)) q.options[k] = clean(q.options[k])
  if (q.blanks)
    for (const b of q.blanks) {
      b.answer = clean(b.answer)
      if (b.accept) b.accept = b.accept.map(clean)
    }
  return q
}
for (const q of bank) cleanQ(q)

// ---- 重写两段被 OCR 毁坏的解析 ----
const setExpl = (id, text) => {
  const q = bank.find((x) => x.id === id)
  if (!q) throw new Error(`${id} not found`)
  q.explanation = text
}
setExpl(
  'math-2025-03',
  'A 错：反例 $f(x)=\\dfrac{\\sin x^2}{x}$，$\\lim\\limits_{x\\to+\\infty}f(x)=0$ 但 $\\lim\\limits_{x\\to+\\infty}f\'(x)$ 不存在；B 错：反例 $f(x)=\\sqrt x$，$\\lim\\limits_{x\\to+\\infty}f\'(x)=0$ 但 $\\lim\\limits_{x\\to+\\infty}f(x)$ 不存在；C 错：反例 $f(x)=\\cos x$，$\\lim\\limits_{x\\to+\\infty}\\dfrac{1}{x}\\int_0^x f(t)\\mathrm{d}t=\\lim\\limits_{x\\to+\\infty}\\dfrac{\\sin x}{x}=0$ 存在，但 $\\lim\\limits_{x\\to+\\infty}f(x)$ 不存在；D 正确：设 $\\lim\\limits_{x\\to+\\infty}f(x)=A$，则 $f(t)=A+o(1)$，$\\int_0^x f(t)\\mathrm{d}t=Ax+o(x)$，除以 $x$ 的极限为 $A$。故选 D。',
)
setExpl(
  'math-2025-07',
  '排除法：取 $n=2$，$A=\\begin{pmatrix}1&0\\\\0&0\\end{pmatrix}$，$B=\\begin{pmatrix}0&0\\\\0&1\\end{pmatrix}$，$C=E$，则 $r(A)+r(B)+r(C)=1+1+2=4$，而 $ABC=O$，$r(ABC)+2n=0+4=4$，满足条件；但 $r(A)=r(B)=1<n$，排除③，$r(AB)=r(BC)=0\\neq n$，排除④。故排除 B、C、D，选 A。（①② 可由西尔维斯特不等式 $r(ABC)\\geqslant r(A)+r(B)+r(C)-2n$ 逐级取等证得。）',
)

// ---- 修复 2025-13 题干（∂ 被抽成 α̂/σ̂ 字形，且方向记号重复） ----
const q13 = bank.find((x) => x.id === 'math-2025-13')
q13.stem =
  '已知函数 $u(x,y,z)=xy^2z^3$，向量 $\\boldsymbol{n}=(2,2,-1)$，则 $\\left.\\dfrac{\\partial u}{\\partial \\boldsymbol{n}}\\right|_{(1,1,1)}=$\\_．'

// 断言负号修复到位
const ans11 = bank.find((x) => x.id === 'math-2025-11').blanks[0].answer
const ans15 = bank.find((x) => x.id === 'math-2025-15').blanks[0].answer
if (ans11 !== '-1') throw new Error(`math-2025-11 answer unexpected: ${JSON.stringify(ans11)}`)
if (ans15 !== '-4') throw new Error(`math-2025-15 answer unexpected: ${JSON.stringify(ans15)}`)
for (const q of bank) {
  if (/[\uE000-\uF8FF]/.test(JSON.stringify(q))) throw new Error(`PUA remains in ${q.id}`)
}

const M = (id, no, subject, type, extra) => ({ id, year: 2024, no, paper: '数学一', subject, type, ...extra })

const NEW = [
  // ---------------- 2024 选择题 ----------------
  M('math-2024-01', 1, '高等数学', 'single', {
    stem: '已知函数 $f(x)=\\int_0^x \\mathrm{e}^{\\cos t}\\,\\mathrm{d}t$，$g(x)=\\int_0^{\\sin x}\\mathrm{e}^{t^2}\\,\\mathrm{d}t$，则（　）',
    options: {
      A: '$f(x)$ 为奇函数，$g(x)$ 为偶函数',
      B: '$f(x)$ 为偶函数，$g(x)$ 为奇函数',
      C: '$f(x)$ 与 $g(x)$ 均为奇函数',
      D: '$f(x)$ 与 $g(x)$ 均为周期函数',
    },
    answer: 'C',
    explanation: '$\\mathrm{e}^{\\cos t}$ 是 $t$ 的偶函数，故 $f(x)=\\int_0^x\\mathrm{e}^{\\cos t}\\mathrm{d}t$ 是奇函数；令 $F(u)=\\int_0^u\\mathrm{e}^{t^2}\\mathrm{d}t$，因 $\\mathrm{e}^{t^2}$ 为偶函数，$F(u)$ 为奇函数，又 $\\sin x$ 为奇函数，故 $g(x)=F(\\sin x)$ 仍为奇函数。应选 C。',
    score: 5,
  }),
  M('math-2024-02', 2, '高等数学', 'single', {
    stem: '设 $P=P(x,y,z)$，$Q=Q(x,y,z)$ 均为连续函数，$\\Sigma$ 为曲面 $z=\\sqrt{1-x^2-y^2}$（$x\\geqslant 0,\\ y\\geqslant 0$）的上侧，则 $\\iint_{\\Sigma} P\\,\\mathrm{d}y\\mathrm{d}z+Q\\,\\mathrm{d}z\\mathrm{d}x=$（　）',
    options: {
      A: '$\\iint_{\\Sigma}\\left(\\dfrac{x}{z}P+\\dfrac{y}{z}Q\\right)\\mathrm{d}x\\mathrm{d}y$',
      B: '$\\iint_{\\Sigma}\\left(-\\dfrac{x}{z}P+\\dfrac{y}{z}Q\\right)\\mathrm{d}x\\mathrm{d}y$',
      C: '$\\iint_{\\Sigma}\\left(\\dfrac{x}{z}P-\\dfrac{y}{z}Q\\right)\\mathrm{d}x\\mathrm{d}y$',
      D: '$\\iint_{\\Sigma}\\left(-\\dfrac{x}{z}P-\\dfrac{y}{z}Q\\right)\\mathrm{d}x\\mathrm{d}y$',
    },
    answer: 'A',
    explanation: '上侧曲面投影到 $xOy$ 面：$z_x=-\\dfrac{x}{z},\\ z_y=-\\dfrac{y}{z}$，故 $\\mathrm{d}y\\mathrm{d}z=-z_x\\,\\mathrm{d}x\\mathrm{d}y=\\dfrac{x}{z}\\mathrm{d}x\\mathrm{d}y$，$\\mathrm{d}z\\mathrm{d}x=-z_y\\,\\mathrm{d}x\\mathrm{d}y=\\dfrac{y}{z}\\mathrm{d}x\\mathrm{d}y$。代入即得 $\\iint_{\\Sigma}\\left(\\frac{x}{z}P+\\frac{y}{z}Q\\right)\\mathrm{d}x\\mathrm{d}y$。应选 A。',
    score: 5,
  }),
  M('math-2024-03', 3, '高等数学', 'single', {
    stem: '已知幂级数 $\\sum\\limits_{n=0}^{\\infty}a_nx^n$ 的和函数为 $\\ln(2+x)$，则 $\\sum\\limits_{n=0}^{\\infty}na_{2n}=$（　）',
    options: { A: '$-\\dfrac{1}{6}$', B: '$-\\dfrac{1}{3}$', C: '$\\dfrac{1}{6}$', D: '$\\dfrac{1}{3}$' },
    answer: 'A',
    explanation: '$\\ln(2+x)=\\ln 2+\\ln\\left(1+\\frac{x}{2}\\right)=\\ln 2+\\sum\\limits_{n=1}^{\\infty}\\dfrac{(-1)^{n-1}}{n\\cdot 2^n}x^n$，故 $a_{2n}=\\dfrac{(-1)^{2n-1}}{2n\\cdot 4^n}=-\\dfrac{1}{2n\\cdot 4^n}$（$n\\geqslant 1$）。于是 $\\sum\\limits_{n=0}^{\\infty}na_{2n}=\\sum\\limits_{n=1}^{\\infty}-\\dfrac{1}{2\\cdot 4^n}=-\\dfrac{1}{2}\\cdot\\dfrac{1/4}{1-1/4}=-\\dfrac{1}{6}$。应选 A。',
    score: 5,
  }),
  M('math-2024-04', 4, '高等数学', 'single', {
    stem: '设函数 $f(x)$ 在区间 $(-1,1)$ 内有定义，且 $\\lim\\limits_{x\\to 0}f(x)=0$，则（　）',
    options: {
      A: '当 $\\lim\\limits_{x\\to 0}\\dfrac{f(x)}{x}=m$ 时，$f\'(0)=m$',
      B: '当 $f\'(0)=m$ 时，$\\lim\\limits_{x\\to 0}\\dfrac{f(x)}{x}=m$',
      C: '当 $\\lim\\limits_{x\\to 0}f\'(x)=m$ 时，$f\'(0)=m$',
      D: '当 $f\'(0)=m$ 时，$\\lim\\limits_{x\\to 0}f\'(x)=m$',
    },
    answer: 'B',
    explanation: '若 $f\'(0)=m$，则 $f$ 在 $x=0$ 处连续，故 $f(0)=\\lim\\limits_{x\\to 0}f(x)=0$，于是 $\\lim\\limits_{x\\to 0}\\dfrac{f(x)}{x}=\\lim\\limits_{x\\to 0}\\dfrac{f(x)-f(0)}{x}=f\'(0)=m$，B 正确。A、C 的反例：$f(x)=\\begin{cases}mx, & x\\neq 0\\\\ 1, & x=0\\end{cases}$；D 的反例：$f(x)=mx+x^2\\sin\\dfrac{1}{x}$（$x\\neq 0$），$f(0)=0$，此时 $\\lim\\limits_{x\\to 0}f\'(x)$ 不存在。应选 B。',
    score: 5,
  }),
  M('math-2024-05', 5, '线性代数', 'single', {
    stem: '在空间直角坐标系 $O-xyz$ 中，三张平面 $\\pi_i: a_ix+b_iy+c_iz=d_i$（$i=1,2,3$）的位置关系如图所示，记 $\\boldsymbol{\\alpha}_i=(a_i,b_i,c_i)$，$\\boldsymbol{\\beta}_i=(a_i,b_i,c_i,d_i)$。若 $r\\begin{pmatrix}\\boldsymbol{\\alpha}_1\\\\\\boldsymbol{\\alpha}_2\\\\\\boldsymbol{\\alpha}_3\\end{pmatrix}=m$，$r\\begin{pmatrix}\\boldsymbol{\\beta}_1\\\\\\boldsymbol{\\beta}_2\\\\\\boldsymbol{\\beta}_3\\end{pmatrix}=n$，则（　）\n![](images/2fbda3b762a9ad8fc18a861a7db3f2966a6cab9c555a1be5ed4d6b62f8f71a5e.jpg)',
    options: { A: '$m=1,\\ n=2$', B: '$m=n=2$', C: '$m=2,\\ n=3$', D: '$m=n=3$' },
    answer: 'B',
    explanation: '如图，三张平面相交于同一条直线，方程组有无穷多解，故 $r(\\alpha_1;\\alpha_2;\\alpha_3)=r(\\beta_1;\\beta_2;\\beta_3)<3$，即 $m=n<3$；又三张平面互不相同（法向量两两不共线），故秩不能为 1，只能 $r=2$，即 $m=n=2$。应选 B。',
    score: 5,
  }),
  M('math-2024-06', 6, '线性代数', 'single', {
    stem: '设向量 $\\boldsymbol{\\alpha}_1=\\begin{pmatrix}a\\\\1\\\\-1\\\\1\\end{pmatrix}$，$\\boldsymbol{\\alpha}_2=\\begin{pmatrix}1\\\\1\\\\b\\\\a\\end{pmatrix}$，$\\boldsymbol{\\alpha}_3=\\begin{pmatrix}1\\\\a\\\\-1\\\\1\\end{pmatrix}$。若 $\\boldsymbol{\\alpha}_1,\\boldsymbol{\\alpha}_2,\\boldsymbol{\\alpha}_3$ 线性相关，且其中任意两个向量均线性无关，则（　）',
    options: { A: '$a=1,\\ b\\neq -1$', B: '$a=1,\\ b=-1$', C: '$a\\neq -2,\\ b=2$', D: '$a=-2,\\ b=2$' },
    answer: 'D',
    explanation: '若 $a=1$，则 $\\alpha_1=\\alpha_3$，与任意两个线性无关矛盾，故 $a\\neq 1$。线性相关时 $4\\times 3$ 矩阵各 3 阶子式全为 0：取第 1,2,4 行得 $-a^3+3a-2=0$，即 $(a-1)^2(a+2)=0$，故 $a=-2$；再取第 1,2,3 行得 $-3b+6=0$，故 $b=2$。验证：$a=-2,\\ b=2$ 时 $\\alpha_1+\\alpha_3=-\\alpha_2$，秩为 2 且两两无关。应选 D。',
    score: 5,
  }),
  M('math-2024-07', 7, '线性代数', 'single', {
    stem: '设 $A$ 是秩为 2 的 3 阶矩阵，$\\boldsymbol{\\alpha}$ 是满足 $A\\boldsymbol{\\alpha}=\\boldsymbol{0}$ 的非零向量。若对满足 $\\boldsymbol{\\beta}^T\\boldsymbol{\\alpha}=\\boldsymbol{0}$ 的任意 3 维列向量 $\\boldsymbol{\\beta}$，均有 $A\\boldsymbol{\\beta}=\\boldsymbol{\\beta}$，则（　）',
    options: { A: '$A^3$ 的迹为 2', B: '$A^3$ 的迹为 5', C: '$A^2$ 的迹为 8', D: '$A^2$ 的迹为 9' },
    answer: 'A',
    explanation: '由 $A\\alpha=\\boldsymbol{0}$（$\\alpha\\neq\\boldsymbol{0}$）知 $\\lambda_1=0$。与 $\\alpha$ 垂直的平面中存在两个线性无关的向量 $\\beta_1,\\beta_2$，且 $A\\beta_i=\\beta_i$，故 $\\lambda=1$ 至少为二重根，$A$ 的特征值为 $0,1,1$。从而 $\\mathrm{tr}(A^3)=0+1+1=2$，$\\mathrm{tr}(A^2)=2$，只有 A 正确。应选 A。',
    score: 5,
  }),
  M('math-2024-08', 8, '概率统计', 'single', {
    stem: '设随机变量 $X$ 与 $Y$ 相互独立，且 $X$ 服从正态分布 $N(0,2)$，$Y$ 服从正态分布 $N(-2,2)$。若 $P\\{2X+Y<a\\}=P\\{X>Y\\}$，则 $a=$（　）',
    options: { A: '$-2-\\sqrt{10}$', B: '$-2+\\sqrt{10}$', C: '$-2-\\sqrt{6}$', D: '$-2+\\sqrt{6}$' },
    answer: 'B',
    explanation: '$2X+Y\\sim N(-2,\\ 4\\times 2+2)=N(-2,10)$；$X-Y\\sim N(2,\\ 4)$，故 $P\\{X>Y\\}=P\\{X-Y>0\\}=P\\{N(0,4)<2\\}=\\Phi(1)$。由 $\\Phi\\left(\\dfrac{a+2}{\\sqrt{10}}\\right)=\\Phi(1)$ 得 $\\dfrac{a+2}{\\sqrt{10}}=1$，即 $a=-2+\\sqrt{10}$。应选 B。',
    score: 5,
  }),
  M('math-2024-09', 9, '概率统计', 'single', {
    stem: '设随机变量 $X$ 的概率密度为 $f(x)=\\begin{cases}2(1-x), & 0<x<1\\\\ 0, & \\text{其他}\\end{cases}$。在 $X=x$（$0<x<1$）的条件下，随机变量 $Y$ 在区间 $(x,1)$ 上服从均匀分布，则 $\\mathrm{cov}(X,Y)=$（　）',
    options: { A: '$-\\dfrac{1}{36}$', B: '$-\\dfrac{1}{72}$', C: '$\\dfrac{1}{72}$', D: '$\\dfrac{1}{36}$' },
    answer: 'D',
    explanation: '联合密度 $f(x,y)=f(x)\\cdot f_{Y|X}(y|x)=\\dfrac{2}{1-x}$（$0<x<y<1$）。$E(XY)=\\displaystyle\\int_0^1\\mathrm{d}y\\int_0^y 2xy\\,\\mathrm{d}x=\\int_0^1 y^3\\,\\mathrm{d}y=\\dfrac{1}{4}$；$E(X)=\\displaystyle\\int_0^1 2x(1-x)\\,\\mathrm{d}x=\\dfrac{1}{3}$；$E(Y)=\\displaystyle\\int_0^1\\mathrm{d}y\\int_0^y 2y\\,\\mathrm{d}x=\\dfrac{2}{3}$。故 $\\mathrm{cov}(X,Y)=\\dfrac{1}{4}-\\dfrac{1}{3}\\cdot\\dfrac{2}{3}=\\dfrac{1}{36}$。应选 D。',
    score: 5,
  }),
  M('math-2024-10', 10, '概率统计', 'single', {
    stem: '设随机变量 $X$ 与 $Y$ 相互独立，且均服从参数为 $\\lambda$ 的指数分布。令 $Z=|X-Y|$，则下列随机变量与 $Z$ 服从同一分布的是（　）',
    options: { A: '$X+Y$', B: '$\\dfrac{X+Y}{2}$', C: '$2X$', D: '$X$' },
    answer: 'D',
    explanation: '独立性下 $X-Y$ 的密度为 $f(t)=\\dfrac{\\lambda}{2}\\mathrm{e}^{-\\lambda|t|}$（Laplace 分布），故当 $z\\geqslant 0$ 时 $F_Z(z)=P\\{|X-Y|\\leqslant z\\}=1-\\mathrm{e}^{-\\lambda z}$，即 $Z\\sim E(\\lambda)$，与 $X$ 同分布。应选 D。',
    score: 5,
  }),
  // ---------------- 2024 填空题 ----------------
  M('math-2024-11', 11, '高等数学', 'blank', {
    stem: '若 $\\lim\\limits_{x\\to 0}\\dfrac{\\left(1+ax^2\\right)^{\\sin x}-1}{x^3}=6$，则 $a=$\\_．',
    blanks: [{ answer: '6' }],
    explanation: '$(1+ax^2)^{\\sin x}-1\\sim \\sin x\\cdot\\ln(1+ax^2)\\sim x\\cdot ax^2=ax^3$，故极限等于 $a$，从而 $a=6$。',
    score: 5,
  }),
  M('math-2024-12', 12, '高等数学', 'blank', {
    stem: '已知 $z=f(u,v)$ 具有二阶连续偏导数，且 $\\mathrm{d}f\\big|_{(1,1)}=3\\,\\mathrm{d}u+4\\,\\mathrm{d}v$。若 $y=f(\\cos x,\\ 1+x^2)$，则 $\\left.\\dfrac{\\mathrm{d}^2y}{\\mathrm{d}x^2}\\right|_{x=0}=$\\_．',
    blanks: [{ answer: '5' }],
    explanation: '$f_u(1,1)=3,\\ f_v(1,1)=4$。$\\dfrac{\\mathrm{d}y}{\\mathrm{d}x}=-\\sin x\\,f_u+2x\\,f_v$，$\\dfrac{\\mathrm{d}^2y}{\\mathrm{d}x^2}=-\\cos x\\,f_u-\\sin x\\,(\\cdots)+2f_v+2x\\,(\\cdots)$。在 $x=0$（此时 $u=1,v=1$）处 $\\dfrac{\\mathrm{d}^2y}{\\mathrm{d}x^2}\\Big|_{x=0}=-f_u(1,1)+2f_v(1,1)=-3+8=5$。',
    score: 5,
  }),
  M('math-2024-13', 13, '高等数学', 'blank', {
    stem: '已知 $f(x)=1+x$，若 $f(x)=\\dfrac{a_0}{2}+\\sum\\limits_{n=1}^{\\infty}a_n\\cos nx$（$x\\in[0,\\pi]$），则 $\\lim\\limits_{n\\to\\infty}n^2\\sin a_{2n-1}=$\\_．',
    blanks: [{ answer: '$-\\dfrac{1}{\\pi}$', accept: ['-1/π', '-1/pi', '-0.3183098861837907'] }],
    explanation: '偶延拓后 $a_n=\\dfrac{2}{\\pi}\\displaystyle\\int_0^{\\pi}(1+x)\\cos nx\\,\\mathrm{d}x=\\dfrac{2\\left[(-1)^n-1\\right]}{n^2\\pi}$，故 $a_{2n-1}=-\\dfrac{4}{(2n-1)^2\\pi}$。由 $\\sin a_{2n-1}\\sim a_{2n-1}$（$n\\to\\infty$），极限 $=\\lim\\limits_{n\\to\\infty}\\dfrac{-4n^2}{(2n-1)^2\\pi}=-\\dfrac{1}{\\pi}$。',
    score: 5,
  }),
  M('math-2024-14', 14, '高等数学', 'blank', {
    stem: '微分方程 $y\'=\\dfrac{1}{(x+y)^2}$ 满足条件 $y(1)=0$ 的解为\\_．',
    blanks: [{ answer: '$x=\\tan\\left(y+\\dfrac{\\pi}{4}\\right)-y$', accept: ['x=tan(y+π/4)-y', 'x=tan(y+pi/4)-y'] }],
    explanation: '令 $u=x+y$，则 $u\'=1+y\'=1+\\dfrac{1}{u^2}=\\dfrac{u^2+1}{u^2}$，分离变量 $\\dfrac{u^2}{u^2+1}\\mathrm{d}u=\\mathrm{d}x$，积分得 $u-\\arctan u=x+C$，即 $y-\\arctan(x+y)=C$。代入 $y(1)=0$ 得 $C=-\\dfrac{\\pi}{4}$，故 $\\arctan(x+y)=y+\\dfrac{\\pi}{4}$，即 $x=\\tan\\left(y+\\dfrac{\\pi}{4}\\right)-y$。',
    score: 5,
  }),
  M('math-2024-15', 15, '线性代数', 'blank', {
    stem: '设实矩阵 $A=\\begin{pmatrix}a+1 & a\\\\ a & a\\end{pmatrix}$。若对任意实向量 $\\boldsymbol{\\alpha}=\\begin{pmatrix}x_1\\\\x_2\\end{pmatrix}$，$\\boldsymbol{\\beta}=\\begin{pmatrix}y_1\\\\y_2\\end{pmatrix}$，都有 $\\left(\\boldsymbol{\\alpha}^TA\\boldsymbol{\\beta}\\right)^2\\leqslant\\left(\\boldsymbol{\\alpha}^TA\\boldsymbol{\\alpha}\\right)\\left(\\boldsymbol{\\beta}^TA\\boldsymbol{\\beta}\\right)$，则 $a$ 的取值范围是\\_．',
    blanks: [{ answer: '$a\\geqslant 0$', accept: ['a>=0', 'a≥0', '[0,+∞)'] }],
    explanation: '该不等式对一切 $\\alpha,\\beta$ 成立，等价于 $g(\\alpha,\\beta)=\\alpha^TA\\beta$ 满足柯西—施瓦茨不等式，充要条件为 $A$ 半正定。顺序主子式 $a+1\\geqslant 0$ 且 $\\det A=a(a+1)-a^2=a\\geqslant 0$，得 $a\\geqslant 0$。',
    score: 5,
  }),
  M('math-2024-16', 16, '概率统计', 'blank', {
    stem: '随机试验每次成功的概率为 $p$（$0<p<1$），现进行三次独立重复试验。已知在至少成功一次的条件下全部成功的概率为 $\\dfrac{4}{13}$，则 $p=$\\_．',
    blanks: [{ answer: '$\\dfrac{2}{3}$', accept: ['2/3', '0.6666666667'] }],
    explanation: '$P(\\text{全成}\\mid\\text{至少一成})=\\dfrac{p^3}{1-(1-p)^3}=\\dfrac{4}{13}$。令 $q=1-p$，化简得 $3q^3-13q^2+13q-3=0$，$q=\\dfrac{1}{3}$ 为其根（其余两根不在 $(0,1)$ 内），故 $p=\\dfrac{2}{3}$。',
    score: 5,
  }),
  // ---------------- 2025 补缺（04 / 08 / 09 / 10）----------------
  {
    id: 'math-2025-04', year: 2025, no: 4, paper: '数学一', subject: '高等数学', type: 'single',
    stem: '设函数 $f(x,y)$ 连续，则 $\\displaystyle\\int_{-2}^{2}\\mathrm{d}x\\int_{4-x^2}^{4}f(x,y)\\,\\mathrm{d}y=$（　）',
    options: {
      A: '$\\displaystyle\\int_0^4\\left[\\int_{-2}^{-\\sqrt{4-y}}f(x,y)\\,\\mathrm{d}x+\\int_{\\sqrt{4-y}}^{2}f(x,y)\\,\\mathrm{d}x\\right]\\mathrm{d}y$',
      B: '$\\displaystyle\\int_0^4\\left[\\int_{-2}^{\\sqrt{4-y}}f(x,y)\\,\\mathrm{d}x+\\int_{\\sqrt{4-y}}^{2}f(x,y)\\,\\mathrm{d}x\\right]\\mathrm{d}y$',
      C: '$\\displaystyle\\int_0^4\\left[\\int_{-2}^{-\\sqrt{4-y}}f(x,y)\\,\\mathrm{d}x+\\int_{2}^{\\sqrt{4-y}}f(x,y)\\,\\mathrm{d}x\\right]\\mathrm{d}y$',
      D: '$2\\displaystyle\\int_0^4\\mathrm{d}y\\int_{\\sqrt{4-y}}^{2}f(x,y)\\,\\mathrm{d}x$',
    },
    answer: 'A',
    explanation: '区域 $D=\\{(x,y)\\mid 4-x^2\\leqslant y\\leqslant 4,\\ -2\\leqslant x\\leqslant 2\\}$，即抛物线 $y=4-x^2$ 之上、直线 $y=4$ 之下。交换次序后对 $y\\in[0,4]$，$x$ 分两段：$[-2,-\\sqrt{4-y}]$ 与 $[\\sqrt{4-y},2]$，故选 A。',
    score: 5,
  },
  {
    id: 'math-2025-08', year: 2025, no: 8, paper: '数学一', subject: '概率统计', type: 'single',
    stem: '设二维随机变量 $(X,Y)$ 服从正态分布 $N(0,0;1,1;\\rho)$，其中 $\\rho\\in(-1,1)$。若 $a,b$ 为满足 $a^2+b^2=1$ 的任意实数，则 $D(aX+bY)$ 的最大值为（　）',
    options: { A: '$1$', B: '$2$', C: '$1+|\\rho|$', D: '$1+\\rho^2$' },
    answer: 'C',
    explanation: '$D(aX+bY)=a^2D(X)+b^2D(Y)+2ab\\,\\mathrm{cov}(X,Y)=1+2ab\\rho$。由 $2|ab|\\leqslant a^2+b^2=1$（$a^2=b^2=\\frac{1}{2}$ 时取等），且可取 $ab$ 与 $\\rho$ 同号，故最大值为 $1+|\\rho|$。应选 C。',
    score: 5,
  },
  {
    id: 'math-2025-09', year: 2025, no: 9, paper: '数学一', subject: '概率统计', type: 'single',
    stem: '设 $X_1,X_2,\\cdots,X_{20}$ 是来自总体 $B(1,0.1)$ 的简单随机样本。令 $T=\\sum\\limits_{i=1}^{20}X_i$，利用泊松分布近似表示二项分布的方法可得 $P\\{T\\leqslant 1\\}\\approx$（　）',
    options: { A: '$\\dfrac{1}{\\mathrm{e}^2}$', B: '$\\dfrac{2}{\\mathrm{e}^2}$', C: '$\\dfrac{3}{\\mathrm{e}^2}$', D: '$\\dfrac{4}{\\mathrm{e}^2}$' },
    answer: 'C',
    explanation: '$T\\sim B(20,\\ 0.1)$，$\\lambda=np=2$。泊松近似：$P\\{T\\leqslant 1\\}\\approx\\dfrac{2^0}{0!}\\mathrm{e}^{-2}+\\dfrac{2^1}{1!}\\mathrm{e}^{-2}=\\dfrac{3}{\\mathrm{e}^2}$。应选 C。',
    score: 5,
  },
  {
    id: 'math-2025-10', year: 2025, no: 10, paper: '数学一', subject: '概率统计', type: 'single',
    stem: '设 $X_1,X_2,\\cdots,X_n$ 为来自正态总体 $N(\\mu,2)$ 的简单随机样本。记 $\\overline{X}=\\dfrac{1}{n}\\sum\\limits_{i=1}^{n}X_i$，$Z_\\alpha$ 表示标准正态分布的上侧 $\\alpha$ 分位数。假设检验问题 $H_0:\\ \\mu\\leqslant 1$，$H_1:\\ \\mu>1$ 的显著性水平为 $\\alpha$ 的检验的拒绝域为（　）',
    options: {
      A: '$\\left\\{(X_1,\\cdots,X_n)\\ \\middle|\\ \\overline{X}>1+\\dfrac{2}{n}Z_\\alpha\\right\\}$',
      B: '$\\left\\{(X_1,\\cdots,X_n)\\ \\middle|\\ \\overline{X}>1+\\dfrac{\\sqrt{2}}{n}Z_\\alpha\\right\\}$',
      C: '$\\left\\{(X_1,\\cdots,X_n)\\ \\middle|\\ \\overline{X}>1+\\dfrac{2}{\\sqrt{n}}Z_\\alpha\\right\\}$',
      D: '$\\left\\{(X_1,\\cdots,X_n)\\ \\middle|\\ \\overline{X}>1+\\dfrac{\\sqrt{2}}{\\sqrt{n}}Z_\\alpha\\right\\}$',
    },
    answer: 'D',
    explanation: '$\\sigma^2=2$ 已知，$\\dfrac{\\overline{X}-\\mu}{\\sqrt{2/n}}\\sim N(0,1)$。在 $H_0$ 最不利点 $\\mu=1$ 处控制第一类错误：$P\\left\\{\\overline{X}>1+\\sqrt{\\dfrac{2}{n}}Z_\\alpha\\right\\}=\\alpha$，故拒绝域为 $\\overline{X}>1+\\dfrac{\\sqrt{2}}{\\sqrt{n}}Z_\\alpha$。应选 D。',
    score: 5,
  },
]

for (const q of NEW) {
  if (ids.has(q.id)) throw new Error(`duplicate id: ${q.id}`)
  bank.push(q)
  ids.add(q.id)
}

writeFileSync(file, JSON.stringify(bank, null, 1) + '\n', 'utf-8')
console.log(`OK: +${NEW.length} questions, total ${bank.length}; sign fixes applied`)
