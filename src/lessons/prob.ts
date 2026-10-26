import type { Lesson } from './shared'
import { q } from './shared'

// ============================================================
// 概率论与数理统计
// ============================================================

const LSN_BAYES = 'lsn-bayes'
const LSN_MLE = 'lsn-mle'

export const PROB_LESSONS: Lesson[] = [
  {
    id: LSN_BAYES,
    title: '全概率公式与贝叶斯公式',
    paper: '数学一',
    subject: '概率统计',
    level: '高频大题',
    goal: '能正确划分完备事件组，分清"由因求果"与"由果推因"',
    intro: [
      '全概率是<b>由因求果</b>：已知各原因发生的概率与各原因下结果的条件概率，求结果的概率。贝叶斯是<b>由果推因</b>：结果已经发生，反推它由哪个原因造成。',
      '$$P(B)=\\sum_{i=1}^{n}P(A_i)P(B\\mid A_i)\\qquad P(A_k\\mid B)=\\frac{P(A_k)P(B\\mid A_k)}{\\sum\\limits_{i=1}^{n}P(A_i)P(B\\mid A_i)}$$',
      '做题固定顺序：<b>写出完备事件组（互斥 + 并为全集）→ 算各 $P(B\\mid A_i)$ → 套全概率 → 需要时再套贝叶斯</b>。贝叶斯的分母就是全概率，所以先把全概率算出来永远不亏。',
    ],
    formulaTable: [
      '<table>',
      '<tr><th>公式</th><th>表达式</th><th>用途</th></tr>',
      '<tr><td>条件概率</td><td>$P(B\\mid A)=\\dfrac{P(AB)}{P(A)}$</td><td>定义式</td></tr>',
      '<tr><td>乘法公式</td><td>$P(AB)=P(A)P(B\\mid A)$</td><td>串联事件</td></tr>',
      '<tr><td>全概率公式</td><td>$P(B)=\\sum P(A_i)P(B\\mid A_i)$</td><td>由因求果</td></tr>',
      '<tr><td>贝叶斯公式</td><td>$P(A_k\\mid B)=\\dfrac{P(A_k)P(B\\mid A_k)}{P(B)}$</td><td>由果推因</td></tr>',
      '<tr><td>独立性</td><td>$P(AB)=P(A)P(B)$</td><td>判断独立</td></tr>',
      '<tr><td>假阳性率</td><td>$P(+\\mid D^c)=1-$特异度</td><td>医学检测类题</td></tr>',
      '</table>',
    ].join(''),
    pitfall:
      '<b>贝叶斯分子只保留含 $B$ 的那一项</b>：$P(A_k)P(B\\mid A_k)$，别把分母 $P(B)$ 或别的 $i$ 抄进分子。另一个比算错更常见的错是<b>条件方向搞反</b>：题目问"检测阳性的人真患病概率"，那是 $P(\\text{病}\\mid\\text{阳})$，不是 $P(\\text{阳}\\mid\\text{病})$。凡是"已知结果、问原因"，一律贝叶斯。',
    examples: [
      {
        title: '例 1（基础：三箱抽球）',
        stem:
          '甲、乙、丙三箱分别装 2 红 3 白、3 红 2 白、1 红 4 白。随机取一箱，再从该箱随机取一球。求取到红球的概率；若取到红球，求它来自甲箱的概率。',
        steps: [
          '设 $A_1,A_2,A_3$ 表示取到甲、乙、丙箱，$P(A_i)=\\dfrac13$；设 $B$ 表示取到红球。',
          '$P(B\\mid A_1)=\\dfrac25$，$P(B\\mid A_2)=\\dfrac35$，$P(B\\mid A_3)=\\dfrac15$。',
          '全概率：$P(B)=\\dfrac13\\left(\\dfrac25+\\dfrac35+\\dfrac15\\right)=\\dfrac13\\cdot\\dfrac65=\\dfrac25$。',
          '贝叶斯：$P(A_1\\mid B)=\\dfrac{\\frac13\\cdot\\frac25}{\\frac25}=\\dfrac13$。',
        ],
        result: '取到红球的概率为 $\\dfrac25$；红球来自甲箱的概率为 $\\dfrac13$。',
        note: '本题三箱结构对称、先验都是 $\\frac13$，所以后验等于先验 —— 算完发现不相等，先怀疑自己算错。',
      },
      {
        title: '例 2（陷阱：假阳性淹没真阳性）',
        stem:
          '某病在人群中的患病率为 $0.5\\%$。检测的灵敏度为 $95\\%$（患病者呈阳性），特异度为 $90\\%$（未患病者呈阴性）。某人检测结果为阳性，求他真正患病的概率。',
        wrong:
          '直接回答 $95\\%$ —— 把"患病者阳性率"当成了"阳性者患病率"。两者之间差着一个先验概率（$0.5\\%$），正是贝叶斯公式在修正的东西。',
        steps: [
          '设 $D$ 为患病、$+$ 为阳性。$P(D)=0.005$，$P(D^{c})=0.995$；$P(+\\mid D)=0.95$，假阳性率 $P(+\\mid D^{c})=1-0.9=0.1$。',
          '全概率：$P(+)=0.005\\times0.95+0.995\\times0.1=0.00475+0.0995=0.10425$。',
          '贝叶斯：$P(D\\mid +)=\\dfrac{0.00475}{0.10425}\\approx0.0456$。',
        ],
        result: '$P(D\\mid +)\\approx4.6\\%$ —— 阳性者里真患病的不到 5%。',
        note: '患病率低 + 特异度不够高 → 假阳性数量压过真阳性。这是贝叶斯最反直觉、也最爱出成陷阱题的地方。',
      },
    ],
    practice: [
      {
        id: `${LSN_BAYES}-p1`,
        ...q(LSN_BAYES, 1),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem:
          '设 $A,B$ 为随机事件，$P(A)=0.5$，$P(B\\mid A)=0.4$，$P(B\\mid A^{c})=0.2$，则 $P(B)=$（　）',
        options: { A: '$0.3$', B: '$0.4$', C: '$0.5$', D: '$0.6$' },
        answer: 'A',
        explanation:
          '全概率公式：$P(B)=P(A)P(B\\mid A)+P(A^{c})P(B\\mid A^{c})=0.5\\times0.4+0.5\\times0.2=0.3$。',
        score: 5,
      },
      {
        id: `${LSN_BAYES}-p2`,
        ...q(LSN_BAYES, 2),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem: '设 $P(A)>0,P(B)>0$，且 $A$ 与 $B$ 相互独立，则下列必然成立的是（　）',
        options: {
          A: '$P(A\\mid B)=P(A)$',
          B: '$P(A\\mid B)=0$',
          C: '$A$ 与 $B$ 互斥',
          D: '$P(A\\cup B)=1$',
        },
        answer: 'A',
        explanation:
          '独立即 $P(AB)=P(A)P(B)$，代入条件概率定义得 $P(A\\mid B)=P(A)$。互斥与独立在 $P(A),P(B)>0$ 时不可能同时成立。',
        score: 5,
      },
      {
        id: `${LSN_BAYES}-p3`,
        ...q(LSN_BAYES, 3),
        paper: '数学一',
        subject: '概率统计',
        type: 'blank',
        stem: '设 $P(A)=0.6$，$P(B\\mid A)=0.5$，则 $P(AB)=\\underline{\\quad}$',
        blanks: [{ answer: '0.3', accept: ['0.30', '3/10'] }],
        explanation: '乘法公式：$P(AB)=P(A)P(B\\mid A)=0.6\\times0.5=0.3$。',
        score: 5,
      },
      {
        id: `${LSN_BAYES}-p4`,
        ...q(LSN_BAYES, 4),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem:
          '甲、乙两台机器生产同一种零件，产量占比分别为 $60\\%$ 和 $40\\%$，次品率分别为 $1\\%$ 和 $2\\%$。任取一件发现是次品，则它由乙机器生产的概率约为（　）',
        options: { A: '$0.571$', B: '$0.429$', C: '$0.400$', D: '$0.020$' },
        answer: 'A',
        explanation:
          '$P(\\text{次})=0.6\\times0.01+0.4\\times0.02=0.014$；$P(\\text{乙}\\mid\\text{次})=\\dfrac{0.008}{0.014}\\approx0.571$。乙的次品率是甲的 2 倍，产量虽少但后验反而更大。',
        score: 5,
      },
      {
        id: `${LSN_BAYES}-p5`,
        ...q(LSN_BAYES, 5),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem:
          '甲、乙两台机器生产同一种零件，产量占比分别为 $60\\%$ 和 $40\\%$，次品率分别为 $1\\%$ 和 $2\\%$。任取一件零件为次品的概率是（　）',
        options: { A: '$0.014$', B: '$0.020$', C: '$0.030$', D: '$0.015$' },
        answer: 'A',
        explanation: '全概率公式：$0.6\\times0.01+0.4\\times0.02=0.006+0.008=0.014$。',
        score: 5,
      },
    ],
  },

  {
    id: LSN_MLE,
    title: '矩估计与最大似然估计',
    paper: '数学一',
    subject: '概率统计',
    level: '高频大题',
    goal: '矩估计与 MLE 各写一遍不卡壳，知道 MLE 什么时候不能求导',
    intro: [
      '矩估计：<b>用样本矩替换总体矩</b>。有几个未知参数就列几个方程，一般从一阶矩 $E(X)=\\bar x$ 开始。',
      '最大似然：<b>写似然 → 取对数 → 求导置零</b>。$$L(\\theta)=\\prod_{i=1}^{n}f(x_i;\\theta),\\qquad \\frac{\\mathrm{d}\\ln L}{\\mathrm{d}\\theta}=0$$',
      '例外必须记：当<b>支撑集（取值范围）依赖参数</b>时（如 $U(0,\\theta)$、$f(x)=\\theta x^{-\\theta-1}\\,(x\\ge1)$），$\\ln L$ 对参数单调，"求导置零"无解，要改用单调性在边界取最大值 —— 这是 MLE 最爱考的点。',
    ],
    formulaTable: [
      '<table>',
      '<tr><th>步骤</th><th>矩估计</th><th>最大似然估计</th></tr>',
      '<tr><td>1</td><td>求总体矩 $E(X)$</td><td>写联合密度乘积 $L(\\theta)$</td></tr>',
      '<tr><td>2</td><td>令 $E(X)=\\bar x$</td><td>取对数 $\\ln L$</td></tr>',
      '<tr><td>3</td><td>解出参数</td><td>解 $\\dfrac{\\mathrm{d}\\ln L}{\\mathrm{d}\\theta}=0$</td></tr>',
      '<tr><td>支撑集含参数</td><td>可用（矩估计不受影响）</td><td>改用单调性，取边界值</td></tr>',
      '<tr><td>常见结论</td><td>$E(\\lambda)$ 型：$\\hat\\lambda=\\dfrac{1}{\\bar x}$</td><td>$U(0,\\theta)$：$\\hat\\theta=\\max\\{x_i\\}$</td></tr>',
      '</table>',
    ].join(''),
    pitfall:
      '三个坑：①似然函数是<b>联合密度</b>的乘积，写成单个 $f(x_i)$ 就全错；②取对数后求导时忘记 $\\dfrac{\\mathrm{d}}{\\mathrm{d}\\theta}\\ln\\lambda^n=\\dfrac{n}{\\lambda}$，导致系数错；③<b>样本值必须落在支撑集内</b>，这一步不写（如 $\\theta>\\max x_i$）会扣过程分，而且它正是判断"能不能求导"的依据。',
    examples: [
      {
        title: '例 1（基础：指数分布的 MLE）',
        stem: '设总体 $X$ 服从参数为 $\\lambda$ 的指数分布，密度 $f(x)=\\lambda e^{-\\lambda x}\\ (x>0)$，$x_1,\\dots,x_n$ 为样本值，求 $\\lambda$ 的最大似然估计。',
        steps: [
          '$L(\\lambda)=\\prod\\limits_{i=1}^{n}\\lambda e^{-\\lambda x_i}=\\lambda^{n}e^{-\\lambda\\sum x_i}$（因 $x_i>0$，支撑集不含 $\\lambda$，可直接求导）。',
          '$\\ln L=n\\ln\\lambda-\\lambda\\sum\\limits_{i=1}^{n}x_i$。',
          '$\\dfrac{\\mathrm{d}\\ln L}{\\mathrm{d}\\lambda}=\\dfrac{n}{\\lambda}-\\sum x_i=0$，得 $\\hat\\lambda=\\dfrac{n}{\\sum x_i}=\\dfrac{1}{\\bar x}$。',
        ],
        result: '$\\hat\\lambda_{\\text{MLE}}=\\dfrac{1}{\\bar x}$',
        note: '本题 MLE 与矩估计结果相同（都由 $E(X)=\\frac1\\lambda=\\bar x$ 得），但推导路径不同，答题要按题目要求的方法写过程。',
      },
      {
        title: '例 2（经典陷阱：均匀分布，不能求导）',
        stem: '设总体 $X\\sim U(0,\\theta)$，$x_1,\\dots,x_n$ 为样本值，求 $\\theta$ 的最大似然估计。',
        wrong:
          '写 $L(\\theta)=\\prod\\dfrac1\\theta=\\theta^{-n}$，求导得 $-n\\theta^{-n-1}=0$ 无解，然后停在"无解"或强行凑一个答案。',
        steps: [
          '$L(\\theta)=\\prod\\limits_{i=1}^{n}\\dfrac1\\theta=\\theta^{-n}$，但这个式子<b>只在所有 $0<x_i<\\theta$ 时成立</b>，即要求 $\\theta>x_{(n)}=\\max\\{x_1,\\dots,x_n\\}$；否则 $L=0$。',
          '$\\theta^{-n}$ 在 $\\theta\\in(x_{(n)},+\\infty)$ 上关于 $\\theta$ 单调递减，要让 $L$ 最大，$\\theta$ 必须尽可能小。',
          '故取下界：$\\hat\\theta=x_{(n)}=\\max\\{x_1,\\dots,x_n\\}$。',
        ],
        result: '$\\hat\\theta_{\\text{MLE}}=\\max\\{x_i\\}$',
        note: '本题矩估计是 $2\\bar x$，MLE 是最大次序统计量 —— 两者不等，说明 MLE 不能一律靠求导。',
      },
    ],
    practice: [
      {
        id: `${LSN_MLE}-p1`,
        ...q(LSN_MLE, 1),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem: '设总体 $X\\sim B(1,p)$，$x_1,\\dots,x_n$ 为样本值，则 $p$ 的矩估计为（　）',
        options: { A: '样本均值 $\\bar x$', B: '样本方差 $S^2$', C: '$\\dfrac{1}{\\bar x}$', D: '$\\max\\{x_i\\}$' },
        answer: 'A',
        explanation: '$E(X)=p$，令 $p=\\bar x$，故矩估计为样本均值。本题 MLE 也是 $\\bar x$。',
        score: 5,
      },
      {
        id: `${LSN_MLE}-p2`,
        ...q(LSN_MLE, 2),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem: '设总体 $X\\sim U(0,\\theta)$，$x_1,\\dots,x_n$ 为样本值，则 $\\theta$ 的最大似然估计为（　）',
        options: {
          A: '$\\max\\{x_1,\\dots,x_n\\}$',
          B: '$2\\bar x$',
          C: '$\\bar x$',
          D: '$\\min\\{x_1,\\dots,x_n\\}$',
        },
        answer: 'A',
        explanation:
          '似然函数在 $\\theta>\\max x_i$ 上单调递减，最大值在下界取到，故 $\\hat\\theta=\\max\\{x_i\\}$。B 是矩估计，不是 MLE。',
        score: 5,
      },
      {
        id: `${LSN_MLE}-p3`,
        ...q(LSN_MLE, 3),
        paper: '数学一',
        subject: '概率统计',
        type: 'blank',
        stem:
          '设总体 $X$ 服从参数为 $\\lambda$ 的指数分布（密度 $\\lambda e^{-\\lambda x}$），样本均值 $\\bar x=2$，则 $\\lambda$ 的最大似然估计值为 $\\underline{\\quad}$',
        blanks: [{ answer: '0.5', accept: ['1/2', '0.50'] }],
        explanation: '$\\hat\\lambda=\\dfrac{1}{\\bar x}=\\dfrac12=0.5$。',
        score: 5,
      },
      {
        id: `${LSN_MLE}-p4`,
        ...q(LSN_MLE, 4),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem:
          '设总体 $X$ 的密度为 $f(x)=\\theta x^{\\theta-1}\\ (0<x<1,\\ \\theta>0)$，$\\bar x$ 为样本均值，则 $\\theta$ 的矩估计为（　）',
        options: {
          A: '$\\dfrac{\\bar x}{1-\\bar x}$',
          B: '$\\dfrac{1-\\bar x}{\\bar x}$',
          C: '$\\dfrac{1}{\\bar x}$',
          D: '$\\bar x$',
        },
        answer: 'A',
        explanation:
          '$E(X)=\\displaystyle\\int_0^1x\\theta x^{\\theta-1}\\mathrm{d}x=\\dfrac{\\theta}{\\theta+1}$，令其等于 $\\bar x$，解得 $\\theta=\\dfrac{\\bar x}{1-\\bar x}$。',
        score: 5,
      },
      {
        id: `${LSN_MLE}-p5`,
        ...q(LSN_MLE, 5),
        paper: '数学一',
        subject: '概率统计',
        type: 'single',
        stem:
          '设总体 $X$ 的密度为 $f(x)=\\theta x^{\\theta-1}\\ (0<x<1,\\ \\theta>0)$，$x_1,\\dots,x_n$ 为样本值，则 $\\theta$ 的最大似然估计为（　）',
        options: {
          A: '$-\\dfrac{n}{\\sum\\limits_{i=1}^{n}\\ln x_i}$',
          B: '$\\dfrac{n}{\\sum\\limits_{i=1}^{n}\\ln x_i}$',
          C: '$\\dfrac{1}{n}\\sum\\limits_{i=1}^{n}\\ln x_i$',
          D: '$-\\sum\\limits_{i=1}^{n}\\ln x_i$',
        },
        answer: 'A',
        explanation:
          '$\\ln L=n\\ln\\theta+(\\theta-1)\\sum\\ln x_i$，求导得 $\\dfrac{n}{\\theta}+\\sum\\ln x_i=0$，故 $\\hat\\theta=-\\dfrac{n}{\\sum\\ln x_i}$。因 $0<x_i<1$ 使 $\\ln x_i<0$，结果为正，符合 $\\theta>0$。',
        score: 5,
      },
    ],
  },
]
