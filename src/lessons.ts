import type { Paper, Question, Subject } from './types'

// ============================================================
// 考点卡片（讲解 + 例题精讲 + 练习题）
//
// 设计约定：
//  - 内容全部用富文本格式（$公式$ / $$块级$$ / <table>），由 tex.tsx 的
//    同一条管线渲染，不引入新的渲染依赖。
//  - `practice` 里的题目是普通 Question（single / blank），带 lesson 外键，
//    会被 quizStore 并入 BANK，但排除在自由练习 / 模拟考试抽题池之外；
//    作答记录照样进错题本 / SRS / 统计。
//  - 例题精讲（examples）是纯讲解内容，不判分、不进题库。
//  - 练习题必须原创编写。真题 / 机构题库有版权，只能改写题型不抄原题。
// ============================================================

/** 一道例题精讲（不判分，纯展示） */
export interface LessonExample {
  /** 标题，如「例 1（基础）」 */
  title: string
  /** 题干（富文本） */
  stem: string
  /** 经典错误做法（富文本，可选 —— 陷阱题才写） */
  wrong?: string
  /** 正确解法的步骤（富文本，逐条展示） */
  steps: string[]
  /** 最终结论（富文本） */
  result: string
  /** 要点 / 记忆点（纯文本，可选） */
  note?: string
}

/** 一个考点卡片 */
export interface Lesson {
  /** 唯一 id（练习题的 lesson 字段指向这里） */
  id: string
  title: string
  paper: Paper
  subject: Subject
  /** 重要度标签：高频大题 / 高频选择填空 / 低频了解 */
  level: '高频大题' | '高频选择填空' | '低频了解'
  /** 掌握标准（展示在卡片头部） */
  goal: string
  /** 讲解段落（富文本，逐段） */
  intro: string[]
  /** 必背公式表（<table> 富文本，整段） */
  formulaTable?: string
  /** 易错红线（富文本，高亮展示） */
  pitfall?: string
  /** 例题精讲 */
  examples: LessonExample[]
  /** 配套练习题（single / blank，会并入题库但不进真题抽题池） */
  practice: Question[]
}

const LSN_TAYLOR = 'lsn-taylor'

/** 练习题题号辅助：保证 id 唯一且可读 */
let pno = 0
const p = (id: string, no: number) => ({ year: 2027, no, lesson: id })

export const LESSONS: Lesson[] = [
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
          '把 $\tan x\\sim x$、$\\sin x\\sim x$ 代入加减式，得 $\\dfrac{x-x}{x^3}=0$。加减中替换等价无穷小，把三阶主部全丢了 —— 这是每年都有人写出来的错误。',
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
        ...p(LSN_TAYLOR, 1),
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
        ...p(LSN_TAYLOR, 2),
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
        ...p(LSN_TAYLOR, 3),
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
        ...p(LSN_TAYLOR, 4),
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
        ...p(LSN_TAYLOR, 5),
        paper: '数学一',
        subject: '高等数学',
        type: 'single',
        stem: '$\\displaystyle\\lim_{x\\to 0}\\dfrac{\\arcsin x-x}{x^3}=$（　）',
        options: { A: '$\\dfrac{1}{6}$', B: '$-\\dfrac{1}{6}$', C: '$\\dfrac{1}{3}$', D: '$-\\dfrac{1}{3}$' },
        answer: 'A',
        explanation:
          '$\\arcsin x=x+\\dfrac{x^3}{6}+o(x^4)$，故 $\\arcsin x-x=\\dfrac{x^3}{6}+o(x^3)$，极限为 $\\dfrac{1}{6}$。注意与 $\\arctan x$ 的符号区分：$\\arctan x-x$ 是负的 $\\dfrac{1}{3}$。',
        score: 5,
      },
    ],
  },
]

/** 全部考点练习题（quizStore 读入 BANK 时用） */
export const LESSON_QUESTIONS: Question[] = LESSONS.flatMap((l) => l.practice)

/** 按考点取练习题 id 列表 */
export function lessonPracticeIds(lessonId: string): string[] {
  return LESSONS.find((l) => l.id === lessonId)?.practice.map((q) => q.id) ?? []
}
