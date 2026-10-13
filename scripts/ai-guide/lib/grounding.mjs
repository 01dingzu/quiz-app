/**
 * 锚定校验器（grounding）
 * ============================================================
 * 解决的问题：模型生成解题指引时「自由发挥」→ 编造与题库解析不一致的结论。
 *
 * 核心机制 —— **两条互斥路径**：
 *
 *   路径 G（有干净解析可用，grounded = true）
 *     模型必须为每条断言给出「逐字证据」evidence.quote，
 *     该 quote 必须能在原始解析文本中精确匹配（归一化后 substring）。
 *     匹配不上 → 该条判废（宁缺勿错），回落到母题级内容。
 *     证据强度再分两级（见下方 evidence.kind）：
 *       conclusion —— 解析直接论证了该错误路径
 *       criterion  —— 解析只给了判定标准，诊断由模型据此推导
 *     两级都必须逐字命中原文，但 criterion 的推理是模型做的，
 *     所以它必须进 needsReview 人工优先抽检名单，不能混进「已锚定」的功劳簿。
 *
 *   路径 P（无可信解析，grounded = false）
 *     只允许输出「提问式引导」probe，禁止任何结论性断言。
 *     题库存量解析里已经存在 15% 的答案错位（实测），
 *     在这种题上给结论 = 把已有的错误再固化一遍。
 *
 * 为什么用「逐字引用」而不是「让模型说它参考了解析」：
 *   自述式的「我参考了原文」无法机械验证。而逐字引用可以——
 *   一个字符串包含判断，零成本、零假阳性、可离线回归。
 *   这是把「不许胡说」从软约束变成硬闸门的唯一实用手段。
 */

import { auditExplanation } from './explanation-audit.mjs'

/** 诊断文本长度上限（字）—— 长诊断学生不看，也更容易夹带私货 */
export const MAX_DIAG_LEN = 80

/** 引用片段长度下限，过短的引用没有约束力 */
const MIN_QUOTE_LEN = 6

/** 复述答案的黑名单：诊断的职责是「讲错在哪」，不是「公布答案」 */
const ANSWER_RESTATE_PATTERNS = [
  /正确答案\s*(?:是|为)/,
  /故选\s*[A-D]/,
  /所以\s*选\s*[A-D]/,
  /答案\s*(?:是|为|选|[:：])\s*[A-D]/,
  /本题答案/,
]

/** 空话黑名单：这类反馈对学生零价值 */
export const EMPTY_TALK_WORDS = [
  '不仔细', '不认真', '不够仔细', '粗心', '概念不清', '概念模糊',
  '基础不牢', '基础薄弱', '理解不透', '理解不深', '审题不清', '没有掌握',
  '掌握不牢', '不太熟悉', '知识点不熟悉', '需要加强', '多加练习',
]

/** 结论性断言词 —— 路径 P（无解析）下出现即判废 */
const ASSERTION_MARKERS = [
  '错在', '错的原因', '原因在于', '因为', '所以', '因此', '说明',
  '意味着', '应该是', '正确的是', '正确选项', '错误在于', '根源',
]

/** 提问式引导的合格特征 */
const QUESTION_MARKERS = ['？', '?', '是否', '为什么', '为何', '如何', '怎样', '怎么', '哪一', '首先', '先', '试着', '请', '注意']

// ============================================================
// 文本归一化（用于逐字引用匹配）
// ============================================================

/**
 * LaTeX 噪声处理。
 *
 * 注意：必须把命令**替换成语义等价文本**，不能直接删除。
 * 早先直接删 `\log`，导致 `O(n\log_2 n)` 归一化成 `o(n2n)`，
 * 与引用里的 `o(nlog2n)` 失配 —— 正确引用被误判为不存在（漏判比误判更危险）。
 */
const LATEX_NOISE = [
  [/\\mathrm/g, ''], [/\\text/g, ''], [/\\mathbf/g, ''], [/\\mathit/g, ''], [/\\mathsf/g, ''],
  [/\\left/g, ''], [/\\right/g, ''],
  [/\\lceil/g, '\u2308'], [/\\rceil/g, '\u2309'], [/\\lfloor/g, '\u230a'], [/\\rfloor/g, '\u230b'],
  [/\\log/g, 'log'], [/\\ln/g, 'ln'], [/\\exp/g, 'exp'], [/\\max/g, 'max'], [/\\min/g, 'min'],
  [/\\cdot/g, '.'], [/\\times/g, '\u00d7'], [/\\div/g, '/'], [/\\pm/g, '\u00b1'], [/\\ast/g, '*'],
  [/\\leqslant/g, '\u2264'], [/\\geqslant/g, '\u2265'], [/\\leq/g, '\u2264'], [/\\geq/g, '\u2265'],
  [/\\neq/g, '\u2260'], [/\\approx/g, '\u2248'], [/\\sim/g, '~'], [/\\circ/g, '\u00b0'],
  [/\\bmod/g, 'mod'], [/\\pmod/g, 'mod'], [/\\sum/g, 'sum'], [/\\infty/g, 'inf'],
]

const PUNCT_MAP = {
  '，': ',', '。': '.', '、': ',', '；': ';', '：': ':', '！': '!', '？': '?',
  '（': '(', '）': ')', '【': '[', '】': ']', '「': '"', '」': '"', '『': '"', '』': '"',
  '《': '<', '》': '>', '—': '-', '－': '-', '～': '~', '·': '.',
  '　': '', '\u00a0': '',
}

/**
 * 归一化文本用于匹配。
 *
 * 目标：让「原文」与「模型引用」之间只可能因**实质内容不同**而失配，
 * 不因空格、换行、全角半角、LaTeX 包裹、下标写法这些噪声失配。
 * PDF 抽取的解析里满是「本 题」「front初始应该为n-1,front为0」这类断词，
 * 不去空白会把正确引用误判为不存在。
 */
export function normalizeForMatch(s) {
  if (typeof s !== 'string') return ''
  let t = s
  for (const [re, rep] of LATEX_NOISE) t = t.replace(re, rep)
  t = t.replace(/[$]/g, '')
  t = t.replace(/[\u005c]/g, '')        // 反斜杠
  t = t.replace(/[{}^_]/g, '')          // LaTeX 分组与上下标标记
  let out = ''
  for (const ch of t) out += PUNCT_MAP[ch] !== undefined ? PUNCT_MAP[ch] : ch
  return out.replace(/\s+/g, '').toLowerCase()
}

/**
 * 逐字引用校验 —— 本模块的核心。
 *
 * @returns {{ ok: boolean, reason: string }}
 */
export function verifyQuote(quote, source, { minLen = MIN_QUOTE_LEN, maxRatio = 0.9 } = {}) {
  const q = normalizeForMatch(quote)
  const s = normalizeForMatch(source)
  if (!q) return { ok: false, reason: '引用为空' }
  if (q.length < minLen) return { ok: false, reason: `引用过短（${q.length} < ${minLen} 字），无约束力` }
  if (!s) return { ok: false, reason: '锚定源为空' }
  if (q.length > s.length * maxRatio) return { ok: false, reason: `引用占原文 ${(q.length / s.length * 100).toFixed(0)}%，等同于整段复制，无校验意义` }
  if (!s.includes(q)) return { ok: false, reason: `引用未能在解析原文中逐字匹配：「${quote.slice(0, 30)}${quote.length > 30 ? '…' : ''}」` }
  return { ok: true, reason: '' }
}

// ============================================================
// 单条诊断校验
// ============================================================

function charCount(s) {
  return typeof s === 'string' ? s.replace(/\s/g, '').length : 0
}

/**
 * 校验一条干扰项诊断。
 *
 * @param {object} item  模型产出：{ key, trap?, why?, probe?, evidence?: { quote } }
 * @param {object} ctx
 *   @param {string}   ctx.qid
 *   @param {string[]} ctx.answerKeys      正确项（诊断只针对非正确项）
 *   @param {string}   ctx.explanationText 原始解析（锚定源）
 *   @param {boolean}  ctx.explanationUsable 解析体检是否通过
 *   @param {object}   ctx.trapLibrary     { trapId: { label, why } }
 *   @param {number}   [ctx.maxLen]
 *
 * @returns {{ ok, errors: string[], warnings: string[], grounded: boolean, cleaned: object|null }}
 */
export function validateDiagnostic(item, ctx) {
  const errors = []
  const warnings = []
  const maxLen = ctx.maxLen ?? MAX_DIAG_LEN
  const answerKeys = ctx.answerKeys || []
  const trapLibrary = ctx.trapLibrary || {}

  if (!item || typeof item !== 'object') {
    return { ok: false, errors: ['条目不是对象'], warnings, grounded: false, cleaned: null }
  }

  // --- 1. 只能诊断非正确项 ---
  if (!['A', 'B', 'C', 'D'].includes(item.key)) {
    errors.push(`key 非法：${JSON.stringify(item.key)}`)
  } else if (answerKeys.includes(item.key)) {
    errors.push(`key=${item.key} 是正确项，不应出现诊断（正确项由解析/母题骨架承担）`)
  }

  const text = item.why ?? item.probe ?? ''
  const len = charCount(text)
  if (!text.trim()) errors.push('诊断内容为空')
  if (len > maxLen) errors.push(`长度 ${len} 字，超过上限 ${maxLen} 字`)

  // --- 2. 通用黑名单 ---
  for (const re of ANSWER_RESTATE_PATTERNS) {
    if (re.test(text)) errors.push(`复述答案（命中 ${re}）—— 诊断只讲错误路径，不公布答案`)
  }
  for (const w of EMPTY_TALK_WORDS) {
    if (text.includes(w)) errors.push(`空话黑名单命中「${w}」`)
  }

  // --- 3. 路径分叉 ---
  let grounded = false
  if (ctx.explanationUsable) {
    // 路径 G：必须有可验证的逐字证据
    grounded = true
    const quote = item.evidence && item.evidence.quote
    // 引用强度分两级（这一点很重要，否则「已锚定」会给人虚假的安全感）：
    //   conclusion —— 解析里直接说明了该错误路径（引用即可，模型几乎不参与推理）
    //   criterion  —— 解析只给了定义/判定标准，诊断是模型据此推导的（引用真实，但推理由模型完成）
    // 实测：多数解析只论证了正确答案，对三个干扰项并无直接说明，
    // 因此 criterion 类占比会很高。这类条目在人工抽检时必须优先看。
    const kind = (item.evidence && item.evidence.kind) || 'conclusion'
    if (!['conclusion', 'criterion'].includes(kind)) {
      errors.push(`evidence.kind 非法：${JSON.stringify(kind)}（可选 conclusion | criterion）`)
    }
    if (!quote) {
      errors.push('有可信解析但未提供 evidence.quote —— 锚定模式下每条诊断必须有逐字证据')
    } else {
      const v = verifyQuote(quote, ctx.explanationText)
      if (!v.ok) errors.push(v.reason)
    }
    if (!item.why) errors.push('锚定模式要求 why 字段')
    if (item.probe !== undefined) warnings.push('锚定模式下 probe 字段被忽略')
  } else {
    // 路径 P：只能提问，不能下结论
    grounded = false
    if (!item.probe) {
      errors.push('无可信解析时必须输出 probe（提问式引导），不得输出 why 结论')
    }
    if (item.evidence) warnings.push('无可信解析时 evidence 被忽略')
    for (const m of ASSERTION_MARKERS) {
      if (text.includes(m)) {
        errors.push(`解析不可信却出现结论性表述「${m}」—— 这种情况只允许提问，不允许给结论`)
      }
    }
    if (text && !QUESTION_MARKERS.some((m) => text.includes(m))) {
      errors.push('probe 未表现为提问式引导（缺疑问词或引导词）')
    }
  }

  // --- 4. trap 引用必须存在于母题陷阱库；不存在则降级（剥掉 trap，保留正文）---
  let trap = item.trap
  if (trap && !trapLibrary[trap]) {
    warnings.push(`trap=${trap} 不在母题陷阱库中，已剥除该引用（保留正文）`)
    trap = undefined
  }

  const cleaned = errors.length
    ? null
    : grounded
      ? {
          key: item.key,
          trap,
          why: text.trim(),
          evidence: { quote: item.evidence.quote.trim(), kind: item.evidence.kind || 'conclusion' },
          grounded: true,
        }
      : { key: item.key, trap, probe: text.trim(), grounded: false }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    grounded,
    evidenceKind: grounded ? (item.evidence?.kind || 'conclusion') : null,
    cleaned,
  }
}

// ============================================================
// 批量校验
// ============================================================

/**
 * 校验整份诊断分片。
 *
 * @param {object} shard   { items: { qid: { A?: item, B?: item, ... } } }
 * @param {object} bank    题目索引 { qid: Question }
 * @param {object} opts    { trapLibrary, maxLen }
 * @returns 统计 + 净化后的分片 + 失败明细
 */
export function validateShard(shard, bank, opts = {}) {
  const items = {}
  const failures = []
  const auditCache = new Map()
  let total = 0
  let pass = 0
  let groundedCount = 0
  let probeCount = 0
  let conclusionCount = 0
  let criterionCount = 0
  // criterion 类必须人工优先抽检：引用是真的，但从引用到诊断的那一步推理是模型做的
  const needsReview = []

  for (const [qid, byKey] of Object.entries(shard.items || {})) {
    const q = bank[qid]
    if (!q) {
      failures.push({ qid, key: '-', errors: ['题目不存在于题库（孤儿诊断）'] })
      continue
    }
    if (!auditCache.has(qid)) auditCache.set(qid, auditExplanation(q))
    const audit = auditCache.get(qid)
    const answerKeys = Array.isArray(q.answer) ? q.answer : [q.answer]

    const kept = {}
    for (const [key, item] of Object.entries(byKey)) {
      total++
      const r = validateDiagnostic({ ...item, key }, {
        qid,
        answerKeys,
        explanationText: audit.cleanText,
        explanationUsable: audit.usable,
        trapLibrary: opts.trapLibrary || {},
        maxLen: opts.maxLen,
      })
      if (r.ok) {
        pass++
        kept[key] = r.cleaned
        if (r.grounded) {
          groundedCount++
          if (r.evidenceKind === 'criterion') {
            criterionCount++
            needsReview.push({ qid, key, kind: 'criterion', why: r.cleaned.why })
          } else {
            conclusionCount++
          }
        } else {
          probeCount++
          needsReview.push({ qid, key, kind: 'probe', why: r.cleaned.probe })
        }
      } else {
        failures.push({ qid, key, errors: r.errors, warnings: r.warnings })
      }
    }
    if (Object.keys(kept).length) items[qid] = kept
  }

  return {
    stats: {
      total, pass, failed: total - pass,
      passRate: total ? +(pass / total).toFixed(4) : 0,
      grounded: groundedCount, probe: probeCount,
      conclusion: conclusionCount, criterion: criterionCount,
      questionsCovered: Object.keys(items).length,
    },
    items,
    failures,
    needsReview,
  }
}
