import type { Lesson } from './shared'
import { q } from './shared'

// ============================================================
// 高等数学 · 极限与中值定理与级数
// ============================================================

const LSN_TAYLOR = 'lsn-taylor'
const LSN_MVT = 'lsn-mvt'
const LSN_SERIES = 'lsn-series'

export const CALCULUS1_LESSONS: Lesson[] = [
  {
    id: LSN_TAYLOR,
    title: '用泰勒展开求极限',
    paper: '数学一',
    subject: '高等数学',
    level: '高频大题',
    goal: '5 分钟内独立做对加减型极限，能识别等价无穷小的误用',
    intro: [
      '求 $\\dfrac{0}{0}$ 型极限时，泰勒展开是最通用、最不容易翻车的方法 —— 比洛必达快（不用反复求导验证），比等价无穷小安全（加减场合不失真）。基本姿势：',
      '$$\\lim_{x\\to 0}\\frac{f(x)}{g(x)}=\\lim_{x\\to 0}\\frac{\\text{分子展开到 } x^n}{g(x)}\\qquad(n=\\text{分母首次"露出"的幂次})$$',
      '展开阶数<b>跟着分母走</b>：分母是 $x^2$ 就展开到 $x^2$，是 $x^3$ 就展开到 $x^3$。展开后 $o(x^n)$ 除以 $x^n$ 极限为 0，直接扔掉。',
    ],
    formulaTable: [
      '<table>',
      '<tr><th>函数</th><th>展开式（到常用阶数）</th></tr>',
      '<tr><td>$e^x$</td><td>$1+x+\\dfrac{x^2}{2!}+\\dfrac{x^3}{3!}+o(x^3)$</td></tr>',
      '<tr><td>$\\sin x$</td><td>$x-\\dfrac{x^3}{3!}+o(x^4)$</td></tr>',
      '<tr><td>$\\cos x$</td><td>$1-\\dfrac{x^2}{2!}+\\dfrac{x^4}{4!}+o(x^5)$</td></tr>',
      '<tr><td>$\\tan x$</td><td>$x+\\dfrac{x^3}{3}+o(x^4)$</td></tr>',
      '<tr><td>$\\ln(1+x)$</td><td>$x-\\dfrac{x^2}{2}+\\dfrac{x^3}{3}+o(x^3)$</td></tr>',
      '<tr><td>$(1+x)^\\alpha$</td><td>$1+\\alpha x+\\dfrac{\\alpha(\\alpha-1)}{2}x^2+o(x^2)$</td></tr>',
      '<tr><td>$\\arcsin x$</td><td>$x+\\dfrac{x^3}{6}+o(x^4)$</td></tr>',
      '<tr><td>$\\arctan x$</td><td>$x-\\dfrac{x^3}{3}+o(x^4)$</td></tr>',
      '</table>',
    ].join(''),
    pitfall:
      '<b>等价无穷小只能用在乘除因子上，加减项里直接替换会丢高阶信息。</b>加减场合一律泰勒展开 —— 本考点 90% 的错误来自这里，见例 2。',
    examples: [
      {
        title: '例 1（基础）',
        stem: '求 $\\displaystyle\\lim_{x\\to 0}\\dfrac{e^x-1-x}{x^2}$',
        steps: [
          '分母是 $x^2$，把 $e^x$ 展开到 $x^2$：$e^x=1+x+\\dfrac{x^2}{2}+o(x^2)$',
          '$e^x-1-x=\\Big(1+x+\\dfrac{x^2}{2}+o(x^2)\\Big)-1-x=\\dfrac{x^2}{2}+o(x^2)$',
        ],
        result: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{e^x-1-x}{x^2}=\\lim_{x\\to 0}\\dfrac{\\frac{x^2}{2}+o(x^2)}{x^2}=\\dfrac{1}{2}$',
        note: '展开阶数跟分母走；$o(x^2)$ 除以 $x^2$ 直接扔掉。',
      },
      {
        title: '例 2（经典陷阱）',
        stem: '求 $\\displaystyle\\lim_{x\\to 0}\\dfrac{\\tan x-\\sin x}{x^3}$',
        wrong:
          '把 $\\tan x\\sim x$、$\\sin x\\sim x$ 代入加减式，得 $\\dfrac{x-x}{x^3}=0$。加减中替换等价无穷小，把三阶主部全丢了 —— 这是每年都有人写出来的错误。',
        steps: [
          '加减场合，两项各自展开到 $x^3$：$\\tan x=x+\\dfrac{x^3}{3}+o(x^3)$，$\\sin x=x-\\dfrac{x^3}{6}+o(x^3)$',
          '相减：$\\tan x-\\sin x=\\Big(x+\\dfrac{x^3}{3}\\Big)-\\Big(x-\\dfrac{x^3}{6}\\Big)+o(x^3)=\\dfrac{x^3}{2}+o(x^3)$',
        ],
        result: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{\\tan x-\\sin x}{x^3}=\\dfrac{1}{2}$',
        note: '$x$ 的一阶项相消后三阶项才是主角 —— 这正是「加减必须泰勒」的原因。',
      },
    ],
    practice: [
      {
        id: `${LSN_TAYLOR}-p1`,
        ...q(LSN_TAYLOR, 1),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{x-\\sin x}{x^3}=$（　）',
        options: { A: '$\\dfrac{1}{6}$', B: '$\\dfrac{1}{3}$', C: '$\\dfrac{1}{2}$', D: '$0$' },
        answer: 'A',
        explanation:
          '$\\sin x=x-\\dfrac{x^3}{6}+o(x^3)$，故 $x-\\sin x=\\dfrac{x^3}{6}+o(x^3)$，极限为 $\\dfrac{1}{6}$。这个极限值值得当结论记住。',
        score: 5,
      },
      {
        id: `${LSN_TAYLOR}-p2`,
        ...q(LSN_TAYLOR, 2),
        paper: '数学一',
        subject: '高等数学',
        type: 'blank',
        stem: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{1-\\cos x}{x^2}=\\underline{\\quad}$',
        blanks: [{ answer: '$\\dfrac{1}{2}$', accept: ['1/2', '0.5'] }],
        explanation:
          '$1-\\cos x=\\dfrac{x^2}{2}+o(x^2)$，极限为 $\\dfrac{1}{2}$。本题是乘除场合，用等价无穷小 $1-\\cos x\\sim\\dfrac{x^2}{2}$ 一步到位也算对。',
        score: 5,
      },
      {
        id: `${LSN_TAYLOR}-p3`,
        ...q(LSN_TAYLOR, 3),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{e^{x}+e^{-x}-2}{x^2}=$（　）',
        options: { A: '$0$', B: '$1$', C: '$2$', D: '$+\\infty$' },
        answer: 'B',
        explanation:
          '$e^x=1+x+\\dfrac{x^2}{2}+o(x^2)$，$e^{-x}=1-x+\\dfrac{x^2}{2}+o(x^2)$，相加得 $e^x+e^{-x}-2=x^2+o(x^2)$，极限为 $1$。',
        score: 5,
      },
      {
        id: `${LSN_TAYLOR}-p4`,
        ...q(LSN_TAYLOR, 4),
        paper: '数学一',
        subject: '高等数学',
        type: 'blank',
        stem: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{\\ln(1+x)-x+\\frac{x^2}{2}}{x^3}=\\underline{\\quad}$',
        blanks: [{ answer: '$\\dfrac{1}{3}$', accept: ['1/3'] }],
        explanation:
          '$\\ln(1+x)=x-\\dfrac{x^2}{2}+\\dfrac{x^3}{3}+o(x^3)$，故分子 $=\\dfrac{x^3}{3}+o(x^3)$，极限为 $\\dfrac{1}{3}$。',
        score: 5,
      },
      {
        id: `${LSN_TAYLOR}-p5`,
        ...q(LSN_TAYLOR, 5),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{\\arcsin x-x}{x^3}=$（　）',
        options: { A: '$\\dfrac{1}{6}$', B: '$-\\dfrac{1}{6}$', C: '$\\dfrac{1}{3}$', D: '$-\\dfrac{1}{3}$' },
        answer: 'A',
        explanation:
          '$\\arcsin x=x+\\dfrac{x^3}{6}+o(x^4)$，故 $\\arcsin x-x=\\dfrac{x^3}{6}+o(x^3)$，极限为 $\\dfrac{1}{6}$。注意与 $\\arctan x$ 的符号区分：$\\arctan x-x\\sim-\\dfrac{x^3}{3}$。',
        score: 5,
      },
    ],
  },

  {
    id: LSN_MVT,
    title: '中值定理证明题',
    paper: '数学一',
    subject: '高等数学',
    level: '高频大题',
    goal: '看到结论能在 1 分钟内反推出辅助函数，三个定理条件写全不丢分',
    intro: [
      '证明题的标准三步：<b>看结论 → 反推辅助函数 → 验罗尔条件</b>。绝大多数题的结论都能改写成"某个 $F(x)$ 的导数在 $\\xi$ 处为零"，然后对 $F$ 用罗尔定理收尾。',
      '$$\\text{要证 }f\'(\\xi)+\\text{某式}=0\\ \\Longrightarrow\\ \\text{凑出 }F\'(x)=f\'(x)+\\text{某式}\\ \\Longrightarrow\\ F(a)=F(b)\\ \\Longrightarrow\\ F\'(\\xi)=0$$',
      '反推的技巧是把结论里的 $f\'(x)$ 当成"分子的导数"，其余部分当成"分母的导数"，凑成一个商的导数 $\\Big(\\dfrac{u}{v}\\Big)\'=\\dfrac{u\'v-uv\'}{v^2}$；或者两边乘一个积分因子变成乘积的导数。',
    ],
    formulaTable: [
      '<table>',
      '<tr><th>要证的结论</th><th>应取的辅助函数 $F(x)$</th></tr>',
      '<tr><td>$f\'(\\xi)=0$</td><td>$f(x)$（直接罗尔）</td></tr>',
      '<tr><td>$f\'(\\xi)+kf(\\xi)=0$</td><td>$f(x)e^{kx}$</td></tr>',
      '<tr><td>$\\xi f\'(\\xi)+kf(\\xi)=0$</td><td>$x^kf(x)$</td></tr>',
      '<tr><td>$f\'(\\xi)+g\'(\\xi)f(\\xi)=0$</td><td>$f(x)e^{g(x)}$</td></tr>',
      '<tr><td>$f\'(\\xi)=\\dfrac{f(b)-f(a)}{b-a}$</td><td>拉格朗日（$F=f$）</td></tr>',
      '<tr><td>$\\dfrac{f\'(\\xi)}{g\'(\\xi)}=\\dfrac{f(b)-f(a)}{g(b)-g(a)}$</td><td>柯西中值定理</td></tr>',
      '<tr><td>存在两个不同中值点</td><td>两次用定理（常用不同区间）</td></tr>',
      '</table>',
    ].join(''),
    pitfall:
      '<b>三个条件必须逐条写出来</b>：闭区间连续、开区间可导、$F(a)=F(b)$。最常见的失分是"端点值相等"这一条没验证 —— 尤其是需要自己造端点的题（如把区间取成 $[0,\\xi]$、$[\\xi,1]$）。另外 $\\xi$ 一定在<b>开区间</b>内，写成闭区间要扣分。',
    examples: [
      {
        title: '例 1（基础：结论里带具体函数）',
        stem: '设 $f(x)$ 在 $[0,1]$ 上连续，在 $(0,1)$ 内可导，且 $f(0)=0$，$f(1)=1$。证明：存在 $\\xi\\in(0,1)$，使 $f\'(\\xi)=2\\xi$。',
        steps: [
          '把结论整理成"某函数导数为 0"：$f\'(x)-2x=0$。凑原函数，$2x$ 是 $x^2$ 的导数，故取 $F(x)=f(x)-x^2$。',
          '验证端点：$F(0)=f(0)-0=0$，$F(1)=f(1)-1=1-1=0$，两端相等。',
          '$F$ 在 $[0,1]$ 连续、$(0,1)$ 可导，满足罗尔三条件，故存在 $\\xi\\in(0,1)$ 使 $F\'(\\xi)=0$。',
        ],
        result: '$F\'(\\xi)=f\'(\\xi)-2\\xi=0$，即 $f\'(\\xi)=2\\xi$。',
        note: '结论里出现"$f\'(x)$ 减去某个具体函数"，那个函数就是 $F$ 里要减掉的项。',
      },
      {
        title: '例 2（经典陷阱：结论里有 f 本身）',
        stem:
          '设 $f(x)$ 在 $[a,b]$ 上连续，在 $(a,b)$ 内可导，且 $f(a)=f(b)=0$。证明：存在 $\\xi\\in(a,b)$，使 $f\'(\\xi)+f(\\xi)=0$。',
        wrong:
          '直接对 $f$ 用罗尔定理，得 $f\'(\\xi)=0$，然后宣布证毕 —— 结论里的 $+f(\\xi)$ 被无视了。得 0 分。',
        steps: [
          '结论 $f\'+f=0$ 两边同乘 $e^x$：$e^xf\'(x)+e^xf(x)=0$，左边正是乘积 $(e^xf(x))\'$ 的展开。',
          '取 $F(x)=e^xf(x)$，则 $F(a)=e^af(a)=0$，$F(b)=e^bf(b)=0$，端点相等。',
          '对 $F$ 用罗尔定理：存在 $\\xi\\in(a,b)$ 使 $F\'(\\xi)=e^{\\xi}\\big[f\'(\\xi)+f(\\xi)\\big]=0$，而 $e^{\\xi}>0$。',
        ],
        result: '$f\'(\\xi)+f(\\xi)=0$。',
        note: '口诀：结论含"导数 + 常数 × 函数"→ 乘 $e^{kx}$；含"$x$ × 导数 + 常数 × 函数"→ 乘 $x^k$。',
      },
    ],
    practice: [
      {
        id: `${LSN_MVT}-p1`,
        ...q(LSN_MVT, 1),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem:
          '设 $f(x)$ 在 $[a,b]$ 上连续，在 $(a,b)$ 内可导，且 $f(a)=f(b)$，则至少存在一点 $\\xi\\in(a,b)$，使（　）',
        options: { A: "$f'(\\xi)=0$", B: '$f(\\xi)=0$', C: "$f''(\\xi)=0$", D: "$f'(\\xi)=f(\\xi)$" },
        answer: 'A',
        explanation: '这正是罗尔定理的结论，条件是闭区间连续、开区间可导、端点函数值相等。',
        score: 5,
      },
      {
        id: `${LSN_MVT}-p2`,
        ...q(LSN_MVT, 2),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem:
          '欲证明存在 $\\xi\\in(0,1)$ 使 $\\xi f\'(\\xi)+2f(\\xi)=0$，应构造的辅助函数是（　）',
        options: { A: '$F(x)=x^2f(x)$', B: '$F(x)=xf(x)$', C: '$F(x)=\\dfrac{f(x)}{x^2}$', D: '$F(x)=f(x)e^{2x}$' },
        answer: 'A',
        explanation:
          '$F(x)=x^2f(x)$ 时 $F\'(x)=2xf(x)+x^2f\'(x)=x\\big[2f(x)+xf\'(x)\\big]$，在 $x=\\xi\\neq0$ 处为零即得结论。规律：$\\xi f\'+kf$ 型乘 $x^k$。',
        score: 5,
      },
      {
        id: `${LSN_MVT}-p3`,
        ...q(LSN_MVT, 3),
        paper: '数学一',
        subject: '高等数学',
        type: 'blank',
        stem: '设 $f(x)=x(x-1)(x-2)$，则 $f\'(x)$ 在区间 $(0,2)$ 内的零点个数为 $\\underline{\\quad}$',
        blanks: [{ answer: '2', accept: ['二', '2个'] }],
        explanation:
          '$f(0)=f(1)=f(2)=0$。在 $[0,1]$ 与 $[1,2]$ 上分别用罗尔定理，各得一个零点，共 2 个；又 $f\'$ 是二次多项式，最多 2 个零点，故恰为 2 个。',
        score: 5,
      },
      {
        id: `${LSN_MVT}-p4`,
        ...q(LSN_MVT, 4),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem:
          '设 $f(x)$ 在 $[0,1]$ 上连续，在 $(0,1)$ 内可导，$f(0)=0$，$f(1)=1$，则下列结论必然成立的是（　）',
        options: {
          A: "存在 $\\xi\\in(0,1)$ 使 $f'(\\xi)=1$",
          B: "存在 $\\xi\\in(0,1)$ 使 $f'(\\xi)=0$",
          C: '$f(x)$ 在 $[0,1]$ 上单调递增',
          D: "存在 $\\xi\\in(0,1)$ 使 $f'(\\xi)=2$",
        },
        answer: 'A',
        explanation:
          '拉格朗日中值定理：$f(1)-f(0)=f\'(\\xi)(1-0)$，得 $f\'(\\xi)=1$。B 需要端点值相等才成立；C、D 都无法保证。',
        score: 5,
      },
      {
        id: `${LSN_MVT}-p5`,
        ...q(LSN_MVT, 5),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem:
          '设 $f(x)$ 在 $[a,b]$ 上连续，在 $(a,b)$ 内可导，$f(a)=f(b)=0$ 且 $f(x)$ 不恒为零，则方程 $f\'(x)+f(x)=0$ 在 $(a,b)$ 内（　）',
        options: { A: '至少有一个根', B: '至多有一个根', C: '恰有一个根', D: '没有根' },
        answer: 'A',
        explanation:
          '取 $F(x)=e^xf(x)$，$F(a)=F(b)=0$，由罗尔定理得 $F\'(\\xi)=e^{\\xi}[f\'(\\xi)+f(\\xi)]=0$，至少一根。根的个数无法进一步确定。',
        score: 5,
      },
    ],
  },

  {
    id: LSN_SERIES,
    title: '幂级数求和函数',
    paper: '数学一',
    subject: '高等数学',
    level: '高频大题',
    goal: '6 分钟内求出和函数并写对收敛域，端点不靠猜',
    intro: [
      '求和函数的本质是"把系数里的 $n$ 消掉"：系数带 $n$ 就<b>先积后导</b>（积分让 $nx^{n-1}$ 变成 $x^n$），分母带 $n$ 就<b>先导后积</b>（求导让 $\\dfrac{x^n}{n}$ 变成 $x^{n-1}$）。',
      '$$\\sum_{n=0}^{\\infty}x^n=\\frac{1}{1-x}\\ (|x|<1),\\qquad \\sum_{n=0}^{\\infty}\\frac{x^n}{n!}=e^x\\ (x\\in\\mathbb{R})$$',
      '顺序不能反：<b>先求收敛半径 → 求和函数 → 单独判端点 → 写收敛域</b>。端点收敛性只看原幂级数本身，不能拿和函数在端点的值代替判断。',
    ],
    formulaTable: [
      '<table>',
      '<tr><th>级数</th><th>和函数</th><th>收敛域</th></tr>',
      '<tr><td>$\\sum\\limits_{n=0}^{\\infty}x^n$</td><td>$\\dfrac{1}{1-x}$</td><td>$(-1,1)$</td></tr>',
      '<tr><td>$\\sum\\limits_{n=1}^{\\infty}nx^{n-1}$</td><td>$\\dfrac{1}{(1-x)^2}$</td><td>$(-1,1)$</td></tr>',
      '<tr><td>$\\sum\\limits_{n=1}^{\\infty}\\dfrac{x^n}{n}$</td><td>$-\\ln(1-x)$</td><td>$[-1,1)$</td></tr>',
      '<tr><td>$\\sum\\limits_{n=0}^{\\infty}\\dfrac{x^n}{n!}$</td><td>$e^x$</td><td>$(-\\infty,+\\infty)$</td></tr>',
      '<tr><td>$\\sum\\limits_{n=1}^{\\infty}\\dfrac{(-1)^{n-1}x^n}{n}$</td><td>$\\ln(1+x)$</td><td>$(-1,1]$</td></tr>',
      '<tr><td>$\\sum\\limits_{n=0}^{\\infty}\\dfrac{x^{2n+1}}{2n+1}$</td><td>$\\dfrac{1}{2}\\ln\\dfrac{1+x}{1-x}$</td><td>$(-1,1)$</td></tr>',
      '<tr><td>$\\sum\\limits_{n=0}^{\\infty}\\dfrac{(-1)^nx^{2n+1}}{2n+1}$</td><td>$\\arctan x$</td><td>$[-1,1]$</td></tr>',
      '</table>',
    ].join(''),
    pitfall:
      '<b>先导后积必须带 $S(0)$</b>：$S(x)=S(0)+\\int_0^xS\'(t)\\,\\mathrm{d}t$。漏掉常数项是最常见的错，在 $\\sum\\dfrac{x^n}{n}$ 这类题上刚好 $S(0)=0$ 掩盖了问题，换到 $\\sum\\dfrac{x^n}{n+1}$（$S(0)=1$）立刻错。另一个高频错误：求导后下标从 $n=1$ 开始，却仍写成 $\\sum x^{n}$ 的形式，导致和函数整体差一个 $x$。',
    examples: [
      {
        title: '例 1（基础：系数带 n，先积后导）',
        stem: '求 $\\displaystyle\\sum_{n=1}^{\\infty}nx^{n-1}$ 的和函数与收敛域。',
        steps: [
          '系数 $a_n=n$，$\\lim\\limits_{n\\to\\infty}\\left|\\dfrac{a_{n+1}}{a_n}\\right|=1$，故 $R=1$，收敛区间 $(-1,1)$。',
          '系数带 $n$，先积：令 $S(x)=\\sum\\limits_{n=1}^{\\infty}nx^{n-1}$，则 $\\displaystyle\\int_0^xS(t)\\,\\mathrm{d}t=\\sum_{n=1}^{\\infty}x^n=\\dfrac{x}{1-x}$。',
          '两边求导：$S(x)=\\left(\\dfrac{x}{1-x}\\right)\'=\\dfrac{1\\cdot(1-x)-x\\cdot(-1)}{(1-x)^2}=\\dfrac{1}{(1-x)^2}$。',
        ],
        result: '$\\sum\\limits_{n=1}^{\\infty}nx^{n-1}=\\dfrac{1}{(1-x)^2}$，收敛域 $(-1,1)$。',
        note: '求导升系数、积分降系数 —— 积分让 $nx^{n-1}$ 变成 $x^n$，$n$ 自动消失，这就是"先积后导"的用法。',
      },
      {
        title: '例 2（经典陷阱：分母带 n，端点要单独判）',
        stem: '求 $\\displaystyle\\sum_{n=1}^{\\infty}\\dfrac{x^n}{n}$ 的和函数与收敛域。',
        wrong:
          '求导得 $\\sum x^{n-1}=\\dfrac{1}{1-x}$，直接积分写成 $-\\ln(1-x)$ 就交卷。本题因 $S(0)=0$ 侥幸正确，但同款手法用在 $\\sum\\dfrac{x^n}{n+1}$ 上会漏掉常数项；同时收敛域写成 $(-1,1)$ 也丢分。',
        steps: [
          '$R=1$，收敛区间 $(-1,1)$。端点：$x=1$ 得调和级数 $\\sum\\dfrac{1}{n}$ 发散；$x=-1$ 得 $\\sum\\dfrac{(-1)^n}{n}$，由莱布尼茨判别法收敛。故收敛域为 $[-1,1)$。',
          '分母带 $n$，先导：$S(x)=\\sum\\limits_{n=1}^{\\infty}\\dfrac{x^n}{n}$，$S\'(x)=\\sum\\limits_{n=1}^{\\infty}x^{n-1}=\\dfrac{1}{1-x}$，$|x|<1$。',
          '积分并定常数：$S(x)=S(0)+\\int_0^x\\dfrac{\\mathrm{d}t}{1-t}=0-\\ln(1-x)$。',
        ],
        result: '$\\sum\\limits_{n=1}^{\\infty}\\dfrac{x^n}{n}=-\\ln(1-x)$，收敛域 $[-1,1)$。',
        note: '把 $x=-1$ 代进和函数得 $-\\ln2$，与级数在该点的收敛值一致 —— 端点能代就顺手验一遍答案。',
      },
    ],
    practice: [
      {
        id: `${LSN_SERIES}-p1`,
        ...q(LSN_SERIES, 1),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '幂级数 $\\displaystyle\\sum_{n=1}^{\\infty}nx^{n-1}$ 的收敛域是（　）',
        options: { A: '$[-1,1]$', B: '$(-1,1)$', C: '$(-1,1]$', D: '$[-1,1)$' },
        answer: 'B',
        explanation:
          '$R=1$。端点：$x=1$ 时通项 $n\\to\\infty$ 不趋于 0，发散；$x=-1$ 时通项 $n(-1)^{n-1}$ 也不趋于 0，发散。故收敛域为 $(-1,1)$。',
        score: 5,
      },
      {
        id: `${LSN_SERIES}-p2`,
        ...q(LSN_SERIES, 2),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '幂级数 $\\displaystyle\\sum_{n=1}^{\\infty}\\dfrac{x^n}{n}$ 的收敛域是（　）',
        options: { A: '$(-1,1)$', B: '$[-1,1]$', C: '$[-1,1)$', D: '$(-1,1]$' },
        answer: 'C',
        explanation:
          '$x=1$ 处为调和级数，发散；$x=-1$ 处为交错调和级数，收敛。故 $[-1,1)$。',
        score: 5,
      },
      {
        id: `${LSN_SERIES}-p3`,
        ...q(LSN_SERIES, 3),
        paper: '数学一',
        subject: '高等数学',
        type: 'blank',
        stem: '幂级数 $\\displaystyle\\sum_{n=1}^{\\infty}nx^{n-1}$ 的收敛半径 $R=\\underline{\\quad}$',
        blanks: [{ answer: '1', accept: ['1.0'] }],
        explanation:
          '系数 $a_n=n$，$\\lim\\limits_{n\\to\\infty}\\left|\\dfrac{a_{n+1}}{a_n}\\right|=1$，故 $R=1$。',
        score: 5,
      },
      {
        id: `${LSN_SERIES}-p4`,
        ...q(LSN_SERIES, 4),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '在 $|x|<1$ 内，$\\displaystyle\\sum_{n=1}^{\\infty}nx^{n}$ 的和函数为（　）',
        options: {
          A: '$\\dfrac{x}{(1-x)^2}$',
          B: '$\\dfrac{1}{(1-x)^2}$',
          C: '$\\dfrac{x}{1-x}$',
          D: '$\\dfrac{1}{1-x}$',
        },
        answer: 'A',
        explanation:
          '$\\sum nx^{n}=x\\sum nx^{n-1}=\\dfrac{x}{(1-x)^2}$。别漏乘最前面的 $x$ —— 这正是下标从 $n=1$ 起始时的常见疏漏。',
        score: 5,
      },
      {
        id: `${LSN_SERIES}-p5`,
        ...q(LSN_SERIES, 5),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '已知 $\\displaystyle\\sum_{n=1}^{\\infty}\\dfrac{(-1)^{n-1}x^n}{n}=\\ln(1+x)\\ (-1<x\\le1)$，则 $\\displaystyle\\sum_{n=1}^{\\infty}\\dfrac{(-1)^{n-1}}{n}=$（　）',
        options: { A: '$\\ln2$', B: '$\\dfrac{1}{2}$', C: '$-\\ln2$', D: '$1$' },
        answer: 'A',
        explanation: '令 $x=1$（在收敛域内），得 $\\ln(1+1)=\\ln2$。',
        score: 5,
      },
    ],
  },
]
