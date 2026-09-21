import type { Answer, AnswerKey, BlankSpec, Question } from '../types'
import { mathEqual } from './equiv'

// ============================================================
// 判分引擎
//
// 四类题型的判分规则：
//  - single  标量相等
//  - multi   集合全等（考研规则：少选/错选/多选均不得分，不给部分分）
//  - blank   逐空判定；答案等价性靠「规范化 + accept 白名单 + 纯数值等价」
//  - applied 自评得分率（0 / 0.5 / 1），≥0.6 视为掌握
// ============================================================

export interface GradeResult {
  /** 是否构成有效作答（空作答不算） */
  answered: boolean
  /** 是否掌握（用于错题本 / 归档判定） */
  correct: boolean
  /** 得分比例 0–1（仅 applied / blank 会出现中间值） */
  ratio: number
  /** 面向用户的判定文案 */
  label: string
}

/** 综合应用题「视为已掌握」的得分率阈值 */
export const APPLIED_PASS_RATIO = 0.6

const UNANSWERED: GradeResult = { answered: false, correct: false, ratio: 0, label: '未作答' }

// ---------- 文本规范化 ----------

/**
 * 填空题答案规范化：消除书写差异，保留语义差异。
 * 处理：空白、全角标点、大小写、末尾句号。
 * 注意：不做「x=1 → 1」这类语义剥离 —— 那属于 accept 白名单的职责。
 */
export function canonText(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '') // \s 已覆盖全角空格 U+3000
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/＝/g, '=')
    .replace(/／/g, '/')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/＊/g, '*')
    .replace(/＞/g, '>')
    .replace(/＜/g, '<')
    .replace(/％/g, '%')
    .replace(/[.。．｡]+$/, '') // ASCII 句点 / 中文句号 / 全角句点 / 半角句号
    .toLowerCase()
}

/** 把 `a/b` 形式求值；非分数形式返回 Number 结果或 null */
function numericValue(s: string): number | null {
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s)
  if (frac) {
    const d = Number(frac[2])
    if (d === 0) return null
    return Number(frac[1]) / d
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * 单空判定。两层：
 *  1. mathEqual —— LaTeX 归一 + accept 白名单 + 多解无序配对 + 受限求值器的数值等价
 *     （π/4 与 pi/4、2/3 与 0.6666666667 都能对上）
 *  2. 兜底 —— 原先的纯文本规范化 + 简单分数求值，保证存量题库行为不回归
 */
export function blankCorrect(spec: BlankSpec, input: string): boolean {
  if (mathEqual(spec, input)) return true

  const c = canonText(input)
  if (!c) return false
  const cands = [spec.answer, ...(spec.accept ?? [])].map(canonText)
  if (cands.includes(c)) return true

  const n = numericValue(c)
  if (n === null) return false
  for (const cd of cands) {
    const m = numericValue(cd)
    if (m !== null && Math.abs(m - n) <= 1e-9 * Math.max(1, Math.abs(m))) return true
  }
  return false
}

// ---------- 集合比较 ----------

export function sameKeySet(a: readonly AnswerKey[], b: readonly AnswerKey[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

// ---------- 主判分 ----------

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

export function gradeAnswer(q: Question, a: Answer | null | undefined): GradeResult {
  if (!a) return UNANSWERED

  switch (q.type) {
    case 'single': {
      if (a.t !== 'single') return UNANSWERED
      const ok = a.k === q.answer
      return {
        answered: true,
        correct: ok,
        ratio: ok ? 1 : 0,
        label: ok ? '回答正确' : `回答错误（正确答案 ${q.answer}）`,
      }
    }

    case 'multi': {
      if (a.t !== 'multi') return UNANSWERED
      if (a.ks.length === 0) return UNANSWERED
      const ok = sameKeySet(a.ks, q.answer)
      const right = [...q.answer].sort().join('')
      return {
        answered: true,
        correct: ok,
        ratio: ok ? 1 : 0,
        label: ok
          ? '回答正确'
          : `回答错误（正确答案 ${right}${a.ks.length < q.answer.length ? ' · 少选不得分' : ''}）`,
      }
    }

    case 'blank': {
      if (a.t !== 'blank') return UNANSWERED
      const vals = a.vs.map((v) => (v ?? '').trim())
      if (vals.every((v) => !v)) return UNANSWERED
      const hits = q.blanks.map((b, i) => blankCorrect(b, vals[i] ?? ''))
      const got = hits.filter(Boolean).length
      const ok = got === q.blanks.length
      return {
        answered: true,
        correct: ok,
        ratio: q.blanks.length ? got / q.blanks.length : 0,
        label: ok
          ? '回答正确'
          : `回答错误（答对 ${got}/${q.blanks.length} 空）`,
      }
    }

    case 'applied': {
      if (a.t !== 'applied') return UNANSWERED
      const n = q.parts.length
      if (n === 0 || a.scores.length === 0) return UNANSWERED
      const raw = Array.from({ length: n }, (_, i) => clamp01(a.scores[i] ?? 0))
      const ratio = raw.reduce((x, y) => x + y, 0) / n
      const ok = ratio >= APPLIED_PASS_RATIO
      const fullMarks = raw.filter((x) => x >= 1).length
      const half = raw.filter((x) => x > 0 && x < 1).length
      return {
        answered: true,
        correct: ok,
        ratio,
        label: ok
          ? `自评 ${Math.round(ratio * 100)}% · 已掌握`
          : `自评 ${Math.round(ratio * 100)}% · 未掌握（全对 ${fullMarks} 问、部分 ${half} 问 / 共 ${n} 问）`,
      }
    }
  }
}

/** 便捷：是否掌握 */
export function isCorrect(q: Question, a: Answer | null | undefined): boolean {
  return gradeAnswer(q, a).correct
}

/** 便捷：是否构成有效作答 */
export function isAnswered(a: Answer | null | undefined): boolean {
  if (!a) return false
  switch (a.t) {
    case 'single': return !!a.k
    case 'multi': return a.ks.length > 0
    case 'blank': return a.vs.some((v) => !!v?.trim())
    case 'applied': return a.scores.length > 0
  }
}

/** 作答值的可读文案（错题本 / 统计页展示用） */
export function formatAnswer(a: Answer | null | undefined): string {
  if (!a) return '—'
  switch (a.t) {
    case 'single':
      return a.k || '—'
    case 'multi':
      return a.ks.length ? [...a.ks].sort().join('') : '—'
    case 'blank':
      return a.vs.map((v) => (v?.trim() ? v.trim() : '—')).join(' | ')
    case 'applied': {
      const n = a.scores.length
      if (!n) return '—'
      const got = a.scores.reduce((x, y) => x + clamp01(y), 0)
      return `自评 ${Math.round((got / n) * 100)}%`
    }
  }
}

/** 标准答案的可读文案（判定区展示用） */
export function formatCorrectAnswer(q: Question): string {
  switch (q.type) {
    case 'single':
      return q.answer
    case 'multi':
      return [...q.answer].sort().join('')
    case 'blank':
      return q.blanks
        .map((b, i) => `${i + 1}. ${b.answer}${b.unit ? ' ' + b.unit : ''}`)
        .join('；')
    case 'applied':
      return `${q.parts.length} 问 · 满分 ${q.totalScore} 分`
  }
}

/** 题型的中文名 */
export function typeLabel(q: Question): string {
  switch (q.type) {
    case 'single': return '单选'
    case 'multi': return '多选'
    case 'blank': return '填空'
    case 'applied': return '综合应用'
  }
}
