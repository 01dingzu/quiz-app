import type { Paper, Question, Subject } from '../types'

// ============================================================
// 考点卡片：公共类型与工具
//
// 内容全部用富文本格式（$公式$ / $$块级$$ / <table>），由 lib/tex.tsx
// 的同一条管线渲染，不引入新的渲染依赖。
// 练习题是普通 Question（single / blank），带 lesson 外键，会被 quizStore
// 并入 BANK，但排除在自由练习 / 模拟考试抽题池之外；作答记录照样进
// 错题本 / SRS / 统计。
// 练习题必须原创编写 —— 真题与机构题库有版权，只能写同类型的变式。
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

/**
 * 练习题公共字段：year 固定 2027（用于内部分组排序，非真题年份），
 * lesson 外键指向所属考点。
 */
export function q(lessonId: string, no: number) {
  return { year: 2027, no, lesson: lessonId }
}
