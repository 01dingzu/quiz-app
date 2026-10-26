import type { Lesson } from './shared'
import { q } from './shared'

// ============================================================
// 线性代数
// ============================================================

const LSN_EIGEN = 'lsn-eigen'

export const LINEAR_LESSONS: Lesson[] = [
  {
    id: LSN_EIGEN,
    title: '特征值与相似对角化',
    paper: '数学一',
    subject: '线性代数',
    level: '高频大题',
    goal: '会判定能否对角化、能把实对称矩阵正交对角化写成完整三步',
    intro: [
      '求特征值两条路：<b>解 $|\\lambda E-A|=0$</b>（通用），或<b>用 $\\sum\\lambda_i=\\operatorname{tr}A$、$\\prod\\lambda_i=|A|$ 反推</b>（三阶矩阵已给出一根时用，能省一大截计算）。',
      '$A$ 可对角化 $\\iff A$ 有 $n$ 个线性无关的特征向量 $\\iff$ 每个特征值的<b>几何重数等于代数重数</b>，其中几何重数 $=n-r(\\lambda_iE-A)$。',
      '实对称矩阵必可正交对角化，标准三步：求特征值 → 求特征向量（重根要施密特正交化）→ 单位化拼成 $Q$，得 $Q^{T}AQ=Q^{-1}AQ=\\Lambda$。',
    ],
    formulaTable: [
      '<table>',
      '<tr><th>结论</th><th>内容</th></tr>',
      '<tr><td>特征值性质</td><td>$\\sum\\lambda_i=\\operatorname{tr}A$，$\\prod\\lambda_i=|A|$</td></tr>',
      '<tr><td>$f(A)$ 的特征值</td><td>$f(\\lambda_i)$</td></tr>',
      '<tr><td>$A$ 可逆时 $A^{-1}$</td><td>特征值 $\\dfrac{1}{\\lambda_i}$</td></tr>',
      '<tr><td>伴随矩阵 $A^*$</td><td>特征值 $\\dfrac{|A|}{\\lambda_i}$</td></tr>',
      '<tr><td>可对角化充要条件</td><td>几何重数 = 代数重数（对每个特征值）</td></tr>',
      '<tr><td>实对称矩阵</td><td>必可正交对角化；不同特征值的特征向量自动正交</td></tr>',
      '<tr><td>相似不变量</td><td>特征值、迹、行列式、秩、特征多项式</td></tr>',
      '</table>',
    ].join(''),
    pitfall:
      '两个高频误判：①"有 $n$ 个不同特征值"是可对角化的<b>充分不必要条件</b>，有重根也可能对角化，别一见重根就判死刑；②$A$ 与 $A^{T}$ 的特征值相同，但特征向量一般不同 —— 把 $A^{T}$ 的特征向量当成 $A$ 的，会整题错。另外写 $Q$ 时，<b>对角阵的特征值顺序必须与 $Q$ 的列顺序一一对应</b>。',
    examples: [
      {
        title: '例 1（基础：实对称矩阵正交对角化）',
        stem: '设 $A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}$，求 $A$ 的特征值，并求正交矩阵 $Q$ 使 $Q^{T}AQ$ 为对角阵。',
        steps: [
          '$|\\lambda E-A|=\\begin{vmatrix}\\lambda-2&-1\\\\-1&\\lambda-2\\end{vmatrix}=(\\lambda-2)^2-1=0$，得 $\\lambda_1=3$，$\\lambda_2=1$（用 $\\sum\\lambda=4=\\operatorname{tr}A$、$\\prod\\lambda=3=|A|$ 可验算）。',
          '$\\lambda_1=3$：解 $(3E-A)x=0$，即 $x_1-x_2=0$，取 $\\xi_1=(1,1)^{T}$。',
          '$\\lambda_2=1$：解 $(E-A)x=0$，即 $x_1+x_2=0$，取 $\\xi_2=(1,-1)^{T}$。',
          '实对称且特征值互异，$\\xi_1\\perp\\xi_2$ 已自动正交，只需单位化：$Q=\\dfrac{1}{\\sqrt2}\\begin{pmatrix}1&1\\\\1&-1\\end{pmatrix}$。',
        ],
        result: '$Q^{T}AQ=\\begin{pmatrix}3&0\\\\0&1\\end{pmatrix}$',
        note: '对角元顺序（3 在前、1 在后）对应 $Q$ 的第一列、第二列。写反了也是错的。',
      },
      {
        title: '例 2（陷阱：重根能否对角化）',
        stem: '设三阶矩阵 $A$ 的特征值为 $1,1,2$，讨论 $A$ 能否相似对角化。',
        wrong:
          '看到"有两个特征值相同"就直接答"不能对角化" —— 把充分条件当必要条件用反了。重根恰恰是对角化判定里唯一需要检查秩的情形，不能跳过。',
        steps: [
          '重根是 $\\lambda=1$，代数重数为 2。能否对角化取决于它的几何重数 $n-r(E-A)=3-r(E-A)$ 是否等于 2。',
          '情形一：$r(E-A)=1$，则几何重数为 2，等于代数重数；$\\lambda=2$ 是单根必贡献 1 个线性无关特征向量，共 3 个 $\\Rightarrow$ 可对角化。',
          '情形二：$r(E-A)=2$，则几何重数为 1，小于代数重数 2 $\\Rightarrow$ 不可对角化。',
        ],
        result: '结论取决于 $r(E-A)$：等于 1 可对角化，等于 2 不可对角化，题目只给特征值时不能一概而论。',
        note: '单根永远够用（至少 1 个），所以只需检查重根 —— 考场上先算 $r(\\lambda E-A)$ 再下结论。',
      },
    ],
    practice: [
      {
        id: `${LSN_EIGEN}-p1`,
        ...q(LSN_EIGEN, 1),
        paper: '数学一',
        subject: '线性代数',
        type: 'single',
        stem: '矩阵 $A=\\begin{pmatrix}1&2\\\\0&3\\end{pmatrix}$ 的特征值为（　）',
        options: { A: '$1,\\ 3$', B: '$1,\\ 1$', C: '$2,\\ 3$', D: '$-1,\\ 3$' },
        answer: 'A',
        explanation: '三角矩阵的特征值即主对角线元素：$1$ 与 $3$。（也可由 $|\\lambda E-A|=(\\lambda-1)(\\lambda-3)=0$ 得到。）',
        score: 5,
      },
      {
        id: `${LSN_EIGEN}-p2`,
        ...q(LSN_EIGEN, 2),
        paper: '数学一',
        subject: '线性代数',
        type: 'single',
        stem: '下列条件中，能保证 $n$ 阶矩阵 $A$ 可对角化的是（　）',
        options: {
          A: '$A$ 有 $n$ 个互不相同的特征值',
          B: '$|A|\\ne0$',
          C: '$A$ 的元素全为实数',
          D: '$r(A)=n$',
        },
        answer: 'A',
        explanation:
          '特征值互异 $\\Rightarrow$ 特征向量线性无关 $\\Rightarrow$ 可对角化（充分条件）。B、D 只说明 $A$ 可逆，与可对角化无关；C 更无关。',
        score: 5,
      },
      {
        id: `${LSN_EIGEN}-p3`,
        ...q(LSN_EIGEN, 3),
        paper: '数学一',
        subject: '线性代数',
        type: 'blank',
        stem: '三阶矩阵 $A$ 的特征值为 $1,2,3$，则 $|A|=\\underline{\\quad}$',
        blanks: [{ answer: '6', accept: ['6.0'] }],
        explanation: '行列式等于全部特征值之积：$1\\times2\\times3=6$。',
        score: 5,
      },
      {
        id: `${LSN_EIGEN}-p4`,
        ...q(LSN_EIGEN, 4),
        paper: '数学一',
        subject: '线性代数',
        type: 'single',
        stem: '实对称矩阵 $A$ 的属于不同特征值的特征向量（　）',
        options: { A: '必正交', B: '必线性相关', C: '一定不正交', D: '无法确定是否正交' },
        answer: 'A',
        explanation: '实对称矩阵属于不同特征值的特征向量必正交，这正是能用正交矩阵对角化的基础。',
        score: 5,
      },
      {
        id: `${LSN_EIGEN}-p5`,
        ...q(LSN_EIGEN, 5),
        paper: '数学一',
        subject: '线性代数',
        type: 'single',
        stem: '三阶矩阵 $A$ 的特征值为 $1,1,2$，且 $r(E-A)=2$，则（　）',
        options: {
          A: '$A$ 不可对角化',
          B: '$A$ 可对角化',
          C: '$A$ 是实对称矩阵',
          D: '$A$ 有 $3$ 个线性无关的特征向量',
        },
        answer: 'A',
        explanation:
          '$\\lambda=1$ 的代数重数为 2，几何重数 $=3-r(E-A)=3-2=1<2$，不满足"几何重数等于代数重数"，故不可对角化。D 恰是可对角化的等价说法，也错；C 无任何依据（特征值重现不代表对称）。',
        score: 5,
      },
    ],
  },
]
