import type { Paper } from '../types'

// ============================================================
// 试卷的展示元数据（配色 / 标签 / 图标 / 副标题）
//
// 考点列表、考点详情共用一份，避免两处各写一套导致配色不一致。
// 配色变量 .paper-math / .paper-cs / .paper-pol / .paper-eng 定义在
// index.css，键名与这里保持一致。
// ============================================================

/** 试卷排列顺序 */
export const PAPER_ORDER: Paper[] = ['数学一', '408', '政治', '英语一']

/** 试卷 → CSS 类名后缀 */
export const PAPER_KEY: Record<Paper, string> = {
  数学一: 'math',
  '408': 'cs',
  政治: 'pol',
  英语一: 'eng',
}

export const PAPER_LABEL: Record<Paper, string> = {
  数学一: '数学一',
  '408': '408 计算机',
  政治: '政治',
  英语一: '英语一',
}

/** 用字形当图标，不用 emoji（跨平台渲染不稳） */
export const PAPER_GLYPH: Record<Paper, string> = {
  数学一: '∑',
  '408': '</>',
  政治: '§',
  英语一: 'Aa',
}

/** 试卷一句话说明（列大纲里的学科） */
export const PAPER_HINT: Record<Paper, string> = {
  数学一: '高等数学 · 线性代数 · 概率统计',
  '408': '数据结构 · 计算机组成原理 · 操作系统 · 计算机网络',
  政治: '马原 · 毛中特 · 习思想 · 史纲 · 思修法纪 · 时政',
  英语一: '完形填空 · 阅读理解 · 新题型',
}

/** 试卷对应的 CSS 类名，如 paper-cs */
export function paperClass(p: Paper): string {
  return 'paper-' + PAPER_KEY[p]
}
