import type { Question } from './types'
import type { Lesson } from './lessons/shared'
import { CALCULUS1_LESSONS } from './lessons/calculus1'
import { CALCULUS2_LESSONS } from './lessons/calculus2'
import { LINEAR_LESSONS } from './lessons/linear'
import { PROB_LESSONS } from './lessons/prob'

// ============================================================
// 考点卡片总入口
//
// 内容按学科拆到 lessons/ 目录，这里只做汇总与对外 API：
//   lessons/shared.ts    类型定义 + 练习题公共字段辅助
//   lessons/calculus1.ts 高数：极限 / 中值定理 / 幂级数
//   lessons/calculus2.ts 高数：重积分 / 微分方程
//   lessons/linear.ts    线代：特征值与相似对角化
//   lessons/prob.ts      概率：全概率与贝叶斯 / 矩估计与最大似然
//
// 新增考点：在对应学科文件里 push 一个 Lesson 对象即可，页面与题库
// 联动全自动（列表、详情、练习题并入 BANK、进度统计）。
// ============================================================

export type { Lesson, LessonExample } from './lessons/shared'

/** 全部考点（列表顺序 = 页面展示顺序：高数 → 线代 → 概率） */
export const LESSONS: Lesson[] = [
  ...CALCULUS1_LESSONS,
  ...CALCULUS2_LESSONS,
  ...LINEAR_LESSONS,
  ...PROB_LESSONS,
]

/** 全部考点练习题（quizStore 读入 BANK 时用） */
export const LESSON_QUESTIONS: Question[] = LESSONS.flatMap((l) => l.practice)

/** 按考点取练习题 id 列表 */
export function lessonPracticeIds(lessonId: string): string[] {
  return LESSONS.find((l) => l.id === lessonId)?.practice.map((q) => q.id) ?? []
}
