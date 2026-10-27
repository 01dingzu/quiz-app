import type { Question } from './types'
import type { Lesson } from './lessons/shared'
import { CALCULUS1_LESSONS } from './lessons/calculus1'
import { CALCULUS2_LESSONS } from './lessons/calculus2'
import { CALCULUS3_LESSONS } from './lessons/calculus3'
import { CALCULUS4_LESSONS } from './lessons/calculus4'
import { LINEAR_LESSONS } from './lessons/linear'
import { LINEAR2_LESSONS } from './lessons/linear2'
import { PROB_LESSONS } from './lessons/prob'
import { PROB2_LESSONS } from './lessons/prob2'
import { PROB3_LESSONS } from './lessons/prob3'
import { DS_LESSONS } from './lessons/cs-ds'
import { DS2_LESSONS } from './lessons/cs-ds2'
import { OS_LESSONS } from './lessons/cs-os'
import { COA_LESSONS } from './lessons/cs-coa'
import { NET_LESSONS } from './lessons/cs-net'
import { POLITICS_LESSONS } from './lessons/politics'

// ============================================================
// 考点卡片总入口
//
// 内容按学科拆到 lessons/ 目录，这里只做汇总、排序与对外 API：
//   lessons/shared.ts    类型定义 + 练习题公共字段辅助
//   lessons/calculus1.ts 高数：极限 / 中值定理 / 幂级数
//   lessons/calculus2.ts 高数：重积分 / 微分方程
//   lessons/calculus3.ts 高数：数列极限 / 性态 / 积分计算 / 积分应用
//   lessons/calculus4.ts 高数：多元微分 / 多重积分 / 级数判别 / 一阶方程 / 傅里叶
//   lessons/linear.ts    线代：特征值与相似对角化
//   lessons/linear2.ts   线代：矩阵 / 向量组 / 方程组 / 二次型
//   lessons/prob.ts      概率：贝叶斯 / 矩估计与最大似然
//   lessons/prob2.ts     概率：一维分布 / 二维分布 / 数字特征
//   lessons/prob3.ts     概率：大数定律 / 抽样分布 / 估计与检验
//   lessons/cs-ds.ts     408 数据结构：总纲（存/找/排）/ 线性表栈队列 / 树 / 图 / 查找 / 排序
//   lessons/cs-ds2.ts    408 数据结构深水区：线索/存储/森林转换 · 遍历/拓扑/关键路径
//   lessons/cs-os.ts     408 操作系统：总纲（三个幻觉）/ 进程 / 调度 / PV / 死锁 / 内存 / 文件 / I/O
//   lessons/cs-coa.ts    408 组成原理：总纲（指令的一生）/ 数据运算 / Cache / 寻址 / 流水线 / 总线
//   lessons/cs-net.ts    408 网络：总纲（数据包旅程）/ 规模主线 / 链路层 / IP 子网 / 路由 / TCP / 应用层
//   lessons/politics.ts  政治六科：背诵条款（自动生成，见 scripts/gen-politics-2027.mjs）
//
// 新增考点：在对应学科文件里 push 一个 Lesson 对象，并在 ORDER 里登记
// id 即可（未登记的会排在末尾），页面与题库联动全自动。
// ============================================================

export type { Lesson, LessonExample } from './lessons/shared'

const ALL_LESSONS: Lesson[] = [
  ...CALCULUS1_LESSONS,
  ...CALCULUS2_LESSONS,
  ...CALCULUS3_LESSONS,
  ...CALCULUS4_LESSONS,
  ...LINEAR_LESSONS,
  ...LINEAR2_LESSONS,
  ...PROB_LESSONS,
  ...PROB2_LESSONS,
  ...PROB3_LESSONS,
  ...DS_LESSONS,
  ...DS2_LESSONS,
  ...OS_LESSONS,
  ...COA_LESSONS,
  ...NET_LESSONS,
  // 政治（2027 大纲六科）：背诵条款卡片，配套练习来自 politics.json 的 2027 模拟题
  ...POLITICS_LESSONS,
]

/**
 * 展示顺序：按大纲章节走，让学习路径连续
 * （高数：极限 → 微分 → 积分 → 多元 → 级数 → 方程；线代；概率）
 */
const ORDER: string[] = [
  // 高等数学
  'lsn-seq',
  'lsn-taylor',
  'lsn-shape',
  'lsn-mvt',
  'lsn-int',
  'lsn-intapp',
  'lsn-mdiff',
  'lsn-double',
  'lsn-mint',
  'lsn-stest',
  'lsn-series',
  'lsn-ode1',
  'lsn-ode2',
  'lsn-fourier',
  // 线性代数
  'lsn-matrix',
  'lsn-vector',
  'lsn-linsys',
  'lsn-eigen',
  'lsn-quad',
  // 概率统计
  'lsn-bayes',
  'lsn-rv1',
  'lsn-rv2',
  'lsn-numfeat',
  'lsn-mle',
  'lsn-lln',
  'lsn-sample',
  'lsn-esttest',
  // 408 · 数据结构（第一张是总纲：存得下、找得到、排得快）
  'lsn-ds-overview',
  'lsn-ds-list',
  'lsn-ds-tree',
  'lsn-ds-tree2',
  'lsn-ds-graph',
  'lsn-ds-graph2',
  'lsn-ds-search',
  'lsn-ds-sort',
  // 408 · 操作系统（第一张是总纲：三个幻觉与一个协调问题）
  'lsn-os-overview',
  'lsn-os-proc',
  'lsn-os-sched',
  'lsn-os-pv',
  'lsn-os-prodcons',
  'lsn-os-rw',
  'lsn-os-phil',
  'lsn-os-banker',
  'lsn-os-mem',
  'lsn-os-file',
  'lsn-os-io',
  // 408 · 计算机组成原理（第一张是总纲：一条指令的一生）
  'lsn-coa-overview',
  'lsn-coa-arch',
  'lsn-coa-num',
  'lsn-coa-cache',
  'lsn-coa-addr',
  'lsn-coa-pipe',
  'lsn-coa-bus',
  // 408 · 计算机网络（第一张是总纲：一个数据包的完整旅程）
  'lsn-net-overview',
  'lsn-net-scale',
  'lsn-net-link',
  'lsn-net-ip',
  'lsn-net-route',
  'lsn-net-tcp',
  'lsn-net-app',
  // 政治 · 背诵条款（2027 大纲六科）
  'lsn-zz-my-1',
  'lsn-zz-my-2',
  'lsn-zz-my-3',
  'lsn-zz-mz-1',
  'lsn-zz-mz-2',
  'lsn-zz-xs-1',
  'lsn-zz-xs-2',
  'lsn-zz-xs-3',
  'lsn-zz-sg-1',
  'lsn-zz-sg-2',
  'lsn-zz-sx-1',
  'lsn-zz-sx-2',
  'lsn-zz-sz-1',
]

/** 全部考点（按 ORDER 排序，未登记的排最后） */
export const LESSONS: Lesson[] = [...ALL_LESSONS].sort((a, b) => {
  const ia = ORDER.indexOf(a.id)
  const ib = ORDER.indexOf(b.id)
  return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib)
})

/** 全部考点练习题（quizStore 读入 BANK 时用） */
export const LESSON_QUESTIONS: Question[] = LESSONS.flatMap((l) => l.practice)

/** 按考点取练习题 id 列表 */
export function lessonPracticeIds(lessonId: string): string[] {
  return LESSONS.find((l) => l.id === lessonId)?.practice.map((q) => q.id) ?? []
}
