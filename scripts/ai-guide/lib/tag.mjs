/**
 * 母题标注（tagging）
 * ============================================================
 * 把每道题挂到（知识点 topic，母题 mt）两个外键上。
 *
 * 这里的立场与体检器一致：**宁可漏标，不可错标。**
 *   漏标 → 该题没有母题级内容，只走「解析锚定诊断」或「提问式引导」，学生少看一层，
 *          但看到的东西仍然是对的；
 *   错标 → 把另一类题的陷阱库喂给模型，模型用「正确的知识」讲「错误的题」，
 *          产出看起来专业、实际误导，而且**机械校验查不出来**（引用可能仍然命中）。
 * 所以低于置信门槛时一律返回 null，不做「最接近的那个」这种妥协。
 */

/** 把题干与选项拼成待匹配文本（选项也要看：有些题的关键词只出现在选项里） */
function matchText(q) {
  return [q.stem || '', ...Object.values(q.options || {})].join(' \n ')
}

/**
 * 用一条规则给题目打分。
 * @returns {number} 0 表示不匹配
 */
function scoreRule(rule, text) {
  const test = (p) => new RegExp(p).test(text)
  if (rule.none && rule.none.some(test)) return 0
  if (rule.all && !rule.all.every(test)) return 0
  if (!rule.any) return rule.all ? (rule.weight || 1) : 0
  const hits = rule.any.filter(test).length
  if (hits === 0) return 0
  return hits * (rule.weight || 1)
}

/**
 * 给单道题标注。
 *
 * @param {object} q
 * @param {Array}  rules
 * @param {object} [opts]
 *   @param {number} [opts.minScore=3]        低于此分不标（置信门槛）
 *   @param {number} [opts.margin=2]          最高分必须比次高分多出这么多，否则视为歧义 → 不标
 * @returns {{ mt: string|null, topic: string|null, score: number, runnerUp: number, ambiguous: boolean, hits: string[] }}
 */
export function tagQuestion(q, rules, opts = {}) {
  const minScore = opts.minScore ?? 3
  const margin = opts.margin ?? 2
  const text = matchText(q)

  const scored = []
  const hits = []
  for (const rule of rules) {
    const s = scoreRule(rule, text)
    if (s > 0) { scored.push({ mt: rule.mt, s }); hits.push(`${rule.mt}:${s}`) }
  }
  // 同一母题可能有多条规则命中，取该母题的最高分
  const byMt = new Map()
  for (const { mt, s } of scored) byMt.set(mt, Math.max(byMt.get(mt) || 0, s))
  const ranked = [...byMt.entries()].sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  const second = ranked[1]

  if (!best || best[1] < minScore) {
    return { mt: null, topic: null, score: best ? best[1] : 0, runnerUp: second ? second[1] : 0, ambiguous: false, hits }
  }
  // 两个母题咬得很紧时，多半是题目同时在考两件事 —— 交给人工，不猜
  if (second && best[1] - second[1] < margin) {
    return { mt: null, topic: null, score: best[1], runnerUp: second[1], ambiguous: true, hits }
  }
  return { mt: best[0], topic: null, score: best[1], runnerUp: second ? second[1] : 0, ambiguous: false, hits }
}

/**
 * 批量标注 + 应用人工纠错表。
 *
 * 人工 overrides 的优先级最高，且**不参与打分**：它只覆盖结果，
 * 并在报告里标注 `by: 'override'`，这样自动规则将来改好了也不会悄悄盖掉人工结论。
 */
export function tagBank(questions, { rules, overrides = {} }) {
  const rows = []
  for (const q of questions) {
    const auto = tagQuestion(q, rules)
    const ov = overrides[q.id]
    if (ov) {
      rows.push({ id: q.id, mt: ov.mt ?? null, topic: ov.topic ?? null, by: 'override', score: auto.score, ambiguous: false, hits: auto.hits, note: ov.note })
    } else {
      rows.push({ id: q.id, mt: auto.mt, topic: auto.topic, by: auto.mt ? 'rule' : 'none', score: auto.score, ambiguous: auto.ambiguous, hits: auto.hits })
    }
  }
  const tagged = rows.filter((r) => r.mt)
  const ambiguous = rows.filter((r) => r.ambiguous)
  return {
    rows,
    tagged: tagged.length,
    untagged: rows.length - tagged.length,
    ambiguous,
    coverage: rows.length ? +(tagged.length / rows.length).toFixed(3) : 0,
    byMother: tagged.reduce((m, r) => { m[r.mt] = (m[r.mt] || 0) + 1; return m }, {}),
  }
}
