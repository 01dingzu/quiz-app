import type {
  Answer,
  AnswerKey,
  AppliedPart,
  AppliedQ,
  BlankQ,
  BlankSpec,
  MultiChoiceQ,
  Paper,
  Question,
  SingleChoiceQ,
  Subject,
} from '../types'
import { KEYS, paperOfSubject } from '../types'

// ============================================================
// 存量题库归一化
//
// 目标：让「没有 type 字段的 2009–2024 单选真题」零迁移成本地进入
// 新的判别联合模型。JSON 保持原样不动，归一化只发生在读入时。
// ============================================================

type Raw = Record<string, unknown>

function str(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  return String(v)
}

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : dflt
}

/** 把任意形态的作答值归一为判别联合（兼容持久化中旧的裸 'A' 字符串） */
export function normalizeAnswer(raw: unknown): Answer | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { t: 'single', k: raw as AnswerKey }
  if (typeof raw !== 'object') return null
  const o = raw as Raw
  switch (o.t) {
    case 'single':
      return typeof o.k === 'string' ? { t: 'single', k: o.k as AnswerKey } : null
    case 'multi':
      return { t: 'multi', ks: Array.isArray(o.ks) ? (o.ks as AnswerKey[]) : [] }
    case 'blank':
      return { t: 'blank', vs: Array.isArray(o.vs) ? (o.vs as string[]) : [] }
    case 'applied':
      return { t: 'applied', scores: Array.isArray(o.scores) ? (o.scores as number[]) : [] }
    default:
      // 无 t 标记但形如 { k: 'A' } 的，尽量救回来
      if (typeof o.k === 'string') return { t: 'single', k: o.k as AnswerKey }
      return null
  }
}

/**
 * 校验选项对象是否为完整的 A–D 四键，且四项都非空。
 *
 * 空选项必须判为不可用：一道缺了选项的选择题在界面上无从作答，
 * 留着只会让用户以为自己看漏了。已知被此规则剔除的题：
 * `math-2023-06`（源解析里 A–D 全为空，2023 解析文本该题选项不可恢复）。
 */
function readOptions(raw: unknown): Record<AnswerKey, string> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Raw
  const out = {} as Record<AnswerKey, string>
  for (const k of KEYS) {
    const v = o[k]
    if (typeof v !== 'string' || !v.trim()) return null
    out[k] = v
  }
  return out
}

function readBlanks(raw: unknown): BlankSpec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: BlankSpec[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') return null
    const o = b as Raw
    const answer = str(o.answer)
    if (!answer) return null
    out.push({
      answer,
      accept: Array.isArray(o.accept) ? (o.accept as unknown[]).map(str) : undefined,
      unit: o.unit ? str(o.unit) : undefined,
    })
  }
  return out
}

function readParts(raw: unknown): AppliedPart[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: AppliedPart[] = []
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]
    if (!p || typeof p !== 'object') return null
    const o = p as Raw
    const stem = str(o.stem)
    const answer = str(o.answer)
    if (!stem && !answer) return null
    out.push({
      no: num(o.no, i + 1),
      stem,
      answer,
      points: Array.isArray(o.points) ? (o.points as unknown[]).map(str) : undefined,
      score: typeof o.score === 'number' ? o.score : undefined,
    })
  }
  return out
}

/**
 * 单题归一化。返回 null 表示该题数据不可用（缺 id/stem/答案等），应被剔除。
 *
 * 判别顺序：显式 type 优先；否则有 options → single；有 blanks → blank；有 parts → applied。
 */
export function normalizeQuestion(raw: Raw): Question | null {
  const id = str(raw.id)
  const stem = str(raw.stem)
  if (!id || !stem) return null

  const subject = (str(raw.subject) || '数据结构') as Subject
  const paper = (str(raw.paper) || paperOfSubject(subject)) as Paper

  const base = {
    id,
    year: num(raw.year),
    no: num(raw.no),
    subject,
    stem,
    explanation: str(raw.explanation),
    paper,
    topic: raw.topic ? str(raw.topic) : undefined,
    images: Array.isArray(raw.images) ? (raw.images as unknown[]).map(str) : undefined,
    score: typeof raw.score === 'number' ? raw.score : undefined,
    // 英语一的共享长文引用（其余试卷为 undefined）
    materialId: raw.materialId ? str(raw.materialId) : undefined,
  }

  const declared = str(raw.type)
  const type =
    declared ||
    (raw.options ? 'single' : raw.blanks ? 'blank' : raw.parts ? 'applied' : 'single')

  if (type === 'single') {
    const options = readOptions(raw.options)
    const answer = str(raw.answer)
    if (!options || !KEYS.includes(answer as AnswerKey)) return null
    const q: SingleChoiceQ = { ...base, type: 'single', options, answer: answer as AnswerKey }
    return q
  }

  if (type === 'multi') {
    const options = readOptions(raw.options)
    const arr = Array.isArray(raw.answer) ? (raw.answer as unknown[]).map(str) : []
    const answer = arr.filter((k): k is AnswerKey => KEYS.includes(k as AnswerKey))
    if (!options || answer.length === 0) return null
    const q: MultiChoiceQ = { ...base, type: 'multi', options, answer }
    return q
  }

  if (type === 'blank') {
    const blanks = readBlanks(raw.blanks)
    if (!blanks) return null
    const q: BlankQ = { ...base, type: 'blank', blanks }
    return q
  }

  if (type === 'applied') {
    const parts = readParts(raw.parts)
    if (!parts) return null
    const totalScore =
      typeof raw.totalScore === 'number'
        ? raw.totalScore
        : parts.reduce((s, p) => s + (p.score ?? 0), 0)
    const q: AppliedQ = { ...base, type: 'applied', totalScore, parts }
    return q
  }

  return null
}

/** 题库归一化：丢弃不可用题，保证返回的每一题都满足判别联合约束 */
export function normalizeBank(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return []
  const out: Question[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const q = normalizeQuestion(r as Raw)
    if (!q) continue
    if (seen.has(q.id)) continue // 去重：同 id 只保留第一份
    seen.add(q.id)
    out.push(q)
  }
  return out
}
