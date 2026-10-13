/**
 * 解析体检（explanation audit）
 * ============================================================
 * 判断一段 explanation 能否作为「锚定源」交给模型。
 *
 * 为什么需要体检（实测数据，数据结构 151 题中 40 题有解析）：
 *   - 6 题（15%）解析自称的答案与题库 `answer` 字段冲突；
 *     根因是 2023 那批解析整体错位（解析文本属于相邻题），
 *     例如 2023-11「快排枢轴」的解析讲的是「CPU 主频 1.5GHz 的执行时间」。
 *   - 3 题的解析/选项含 PDF 提取残留（C1 控制字符 + 孤立 Latin-1 高位字符）。
 *   - 1 题解析开头混入第三方水印。
 *
 * 如果不做体检直接把 explanation 当锚定源，这些污染会被模型「忠实地」
 * 继承、放大、并以结构化形式固化进产物 —— 比不生成更糟。
 * 所以：**体检不过的解析一律隔离，题走「无解析」降级路径（只给提问式引导，不给结论）。**
 *
 * 判据可靠性分级：
 *   A1 答案自述冲突   → 零假阳性，硬隔离
 *   A2 脏字符残留     → 高置信，硬隔离
 *   A3 水印           → 高置信，剥离后可用（只污染局部）
 *   A4 引用悬空图     → 中置信，标记 + 生成时禁引该句
 *   A5 术语重合低     → 弱置信，仅用于人工复核排序，不参与判定
 *   A6 内容不同源     → 中置信，硬隔离（见下方 contentOverlap 的阈值依据）
 *
 * A6 是补 A1 的漏。A1 只能抓「解析自己说了答案、且与 answer 不符」的错位；
 * 实测有两个错位解析能从 A1 眼皮底下走过：
 *   2023-03 —— 题问三元组表，解析讲哈夫曼编码加权平均长度（解析没写自述答案）
 *   2023-07 —— 题问非空 B 树性质，解析讲 600 元素折半查找比较次数，
 *              而它自述的答案 B 恰好与本题 answer 一致（连冲突都算不上）
 * 这种「文本属于别的题」的情况，光看答案字段永远抓不到，必须比**内容**。
 */

/** 低于此长度视为「无解析」 */
export const MIN_USABLE_LEN = 30

/** 中文教辅里会正常出现的 Latin-1 补集字符，不能判脏 */
const LEGAL_LATIN1 = new Set([
  0x00b0, // °
  0x00b1, // ±
  0x00b2, 0x00b3, 0x00b9, // ² ³ ¹
  0x00bc, 0x00bd, 0x00be, // ¼ ½ ¾
  0x00b5, // µ
  0x00b7, // ·
  0x00a7, // §
  0x00a9, 0x00ae, // © ®
  0x00d7, // ×
  0x00f7, // ÷
])

/** 判定为「脏」的字符：C1 控制字符，或非法的 Latin-1 高位字符 */
export function isDirtyChar(ch) {
  const c = ch.codePointAt(0)
  if (c >= 0x0080 && c <= 0x009f) return true // C1 控制字符：PDF 抽取错编码的典型残留
  if (c >= 0x00a0 && c <= 0x00ff) return !LEGAL_LATIN1.has(c)
  if (c === 0xfffd) return true // 替换字符
  return false
}

/**
 * 第三方水印 / 站点推广语。这些文字会被 PDF 抽取拼进解析，
 * 属于「合法字符但无意义内容」，锚定时必须剥掉——
 * 否则模型可能引用水印当证据。
 */
const WATERMARK_PATTERNS = [
  /全国各院校计算机[／/]软件专业考研真题[^。\n]{0,60}/g,
  /免费分享\s*https?:\/\/\S+/g,
  /获取\s*考研经验[／/]复试资料[／/]考研资讯/g,
  /关注微信公众号\s*\S+/g,
  /N诺考研/g,
  /扫码关注\S{0,12}/g,
]

/**
 * 解析中「自述答案」的强模式。
 *
 * 只用强模式（带「故/本题/正确」等上下文），不用裸「选 X」——
 * 裸模式会把「选项 A 的表述」这类正常叙述误判为答案声明。
 * 实测：强模式在数据结构题库上命中 6 题真冲突、0 假阳性。
 *
 * 已知限制：仅覆盖单选（提取单个 A–D）。多选题解析里「选 ABD」这类
 * 组合形态不在本期范围（本期只做单选题）。
 */
const SELF_ANSWER_PATTERNS = [
  /故\s*选\s*([A-D])(?![A-Za-z])/g,
  /故\s*正确答案\s*(?:是|为)?\s*([A-D])(?![A-Za-z])/g,
  /本题答案\s*选\s*([A-D])(?![A-Za-z])/g,
  /本题的正确选项\s*(?:是|为)\s*([A-D])(?![A-Za-z])/g,
  /本题的正确答案\s*(?:是|为)\s*([A-D])(?![A-Za-z])/g,
  /正确答案\s*(?:是|为)\s*([A-D])(?![A-Za-z])/g,
  /答案\s*[:：]\s*([A-D])(?![A-Za-z])/g,
]

/** 抽取解析里所有「自述答案」 */
export function extractSelfAnswers(text) {
  const found = []
  for (const re of SELF_ANSWER_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) found.push({ key: m[1], at: m.index, phrase: m[0].trim() })
  }
  return found.sort((a, b) => a.at - b.at)
}

/** 剥离水印，返回干净文本与被剥掉的片段 */
export function stripWatermarks(text) {
  let clean = text
  const removed = []
  for (const re of WATERMARK_PATTERNS) {
    re.lastIndex = 0
    clean = clean.replace(re, (m) => {
      removed.push(m.trim())
      return ''
    })
  }
  return { clean: clean.replace(/\s{2,}/g, ' ').trim(), removed }
}

/** 图注引用：解析里说「如图所示」，但题目本身没有配图 → 该句不可引用 */
const FIGURE_CITES = ['如图所示', '如下图所示', '如下图', '如右图', '右图所示', '如下表所示', '下表所示', '图中']

/**
 * 错位嫌疑（弱信号，**不作为判定依据**，只用于人工复核排序）
 *
 * 检测不到的盲区：2023-03 与 2023-07 的解析同样与题干错位，
 * 但一个没写自述答案、一个的自述答案恰好与 answer 一致，因此逃过 A1。
 * 内容错位本质上是语义问题，机械手段无法可靠判定。
 *
 * 可用的近似信号：**解析里的特征数字是否出现在题干/选项中**。
 * 错位解析讲的是另一道题，会带来一组完全不同的数值。
 *   2023-11（快排枢轴）的解析含 1.2 / 1.5 / 105 / 0.4ms（CPU 执行时间）
 *   → 与题干 68,11,70,23,80,77,48,81,93,88 零重合 → 高风险
 * 而正确解析的特征数字通常会与题干/选项有重合。
 * 实测噪声可接受：只统计 2 位以上的数字，且要求至少 2 个互不相同、全部不重合。
 */
export function misplacementRisk(q, cleanText) {
  const numsIn = (s) => {
    const set = new Set()
    for (const m of s.match(/\d+(?:\.\d+)?/g) || []) {
      const t = m.replace('.', '')
      if (t.length >= 2) set.add(t)
    }
    return set
  }
  const expNums = numsIn(cleanText)
  if (expNums.size === 0) return { level: 'low', orphanNumbers: [] }
  const body = (q.stem || '') + ' ' + Object.values(q.options || {}).join(' ')
  const bodyNums = numsIn(body)
  const orphan = [...expNums].filter((n) => !bodyNums.has(n))
  const hasLong = orphan.some((n) => n.length >= 3)
  if (orphan.length >= 2 && orphan.length === expNums.size) {
    return { level: hasLong ? 'high' : 'medium', orphanNumbers: orphan }
  }
  return { level: 'low', orphanNumbers: orphan }
}

// ============================================================
// A6 内容同源检测
// ============================================================

/** 中文停用字：这些字几乎出现在任何句子里，不携带内容信息，含它们的 bigram 直接丢弃 */
const STOP_CHARS = new Set([...'的了是在和与或及对为以于从到把被这那其此则该等都也就还只很可会能要不没有一二三四五六七八九十'])

/** 题干包含的 bigram 少于这个数时，重合度没有统计意义（典型：题干几乎全是数字） */
export const MIN_STEM_GRAMS = 12
/** 解析与题干重合的 bigram 数上限 */
export const MAX_SHARED_GRAMS = 3
/** 重合 bigram 占解析 bigram 总数的比例上限 */
export const MAX_SHARED_RATIO = 0.10

/**
 * 抽取用于比较的 bigram 集合。
 * 中文切成 2 字滑窗（丢掉含停用字的），拉丁串整词保留（长度 >= 3）。
 */
function contentGrams(s) {
  const set = new Set()
  const t = String(s || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, ' ')
  for (const tok of t.split(/\s+/).filter(Boolean)) {
    if (/^[\u4e00-\u9fff]+$/.test(tok)) {
      for (let i = 0; i + 2 <= tok.length; i++) {
        const g = tok.slice(i, i + 2)
        if (![...g].some((c) => STOP_CHARS.has(c))) set.add(g)
      }
    } else if (tok.length >= 3) {
      set.add(tok.toLowerCase())
    }
  }
  return set
}

/**
 * 内容同源检测：解析里说的东西，和这道题说的是不是同一件事？
 *
 * 阈值怎么定的（在数据结构 32 道可锚定题上实测，不是拍脑袋）：
 *   命中的 3 题：
 *     2023-03  shared=0  qSize=25  ratio=0.000  ← 真错位
 *     2023-07  shared=3  qSize=31  ratio=0.048  ← 真错位
 *     2020-10  shared=0  qSize=14  ratio=0.000  ← 解析只写了 B 树的定义就断了，
 *                                                没回答题目，同样不该作为结论来源
 *   未命中且确实同源的最低样本：
 *     2014-02  shared=13 qSize=24  ratio=0.092  ← 解析很长（141 gram），措辞与题干不同
 *   → 取 shared<=3 且 ratio<0.10，与 2014-02 之间留有余量。
 *
 * 误伤代价 vs 漏判代价是不对称的：
 *   误伤 = 这道题降级成「只给提问式引导」，学生少看到一句解释；
 *   漏判 = 把另一道题的解析逐字引用成这道题的权威结论，学生被明确误导。
 * 所以阈值宁可偏严。已知会误伤的形态：解析通篇用代词指代（「该算法」「此结构」）
 * 而不复述题干术语 —— 这种解析本来也不适合当锚定源，降级不算亏。
 */
export function contentOverlap(q, cleanText) {
  const qG = contentGrams((q.stem || '') + ' ' + Object.values(q.options || {}).join(' '))
  const eG = contentGrams(cleanText)
  const shared = [...eG].filter((g) => qG.has(g))
  const ratio = eG.size ? shared.length / eG.size : 1
  const reliable = qG.size >= MIN_STEM_GRAMS && eG.size > 0
  const suspect = reliable && shared.length <= MAX_SHARED_GRAMS && ratio < MAX_SHARED_RATIO
  return {
    verdict: suspect ? 'different-source' : reliable ? 'same-source' : 'undecidable',
    reliable,
    shared: shared.length,
    stemGrams: qG.size,
    expGrams: eG.size,
    /* eslint-disable-next-line no-mixed-operators */
    ratio: +ratio.toFixed(4),
    sharedSample: shared.slice(0, 8),
  }
}

/**
 * 体检主入口。
 *
 * @param {object} q           归一化后的题目（需要 id / stem / answer / explanation / options / images）
 * @returns {{
 *   status: 'ok'|'watermark'|'answer-conflict'|'dirty'|'empty',
 *   usable: boolean,        // 能否作为锚定源
 *   cleanText: string,      // 剥离水印后的文本（usable 判 false 时仍返回，供人工查看）
 *   reasons: string[],      // 人读的判定理由
 *   selfAnswers: string[],  // 解析自述的答案字母
 *   dirtyChars: object[],   // 脏字符明细
 *   watermarks: string[],   // 被剥掉的水印
 *   hasDanglingFigure: boolean,
 * }}
 */
export function auditExplanation(q) {
  const raw = typeof q.explanation === 'string' ? q.explanation : ''
  const reasons = []

  if (raw.trim().length < MIN_USABLE_LEN) {
    const opt = {}
    for (const [k, v] of Object.entries(q.options || {})) opt[k] = typeof v === 'string' ? stripWatermarks(v).clean : ''
    return {
      status: 'empty', usable: false,
      cleanText: raw.trim(), cleanOptions: opt,
      cleanStem: stripWatermarks(typeof q.stem === 'string' ? q.stem : '').clean,
      reasons: [`解析为空或过短（< ${MIN_USABLE_LEN} 字）—— 只能走提问式引导，不得给结论`],
      selfAnswers: [], dirtyChars: [], watermarks: [], hasDanglingFigure: false,
      optionIssues: [], misplacement: { level: 'low', orphanNumbers: [] },
      content: { verdict: 'undecidable', reliable: false, shared: 0, stemGrams: 0, expGrams: 0, ratio: 0, sharedSample: [] },
    }
  }

  // ---- A3 水印：剥掉后继续检查 ----
  const { clean, removed } = stripWatermarks(raw)
  if (removed.length) reasons.push(`剥离水印 ${removed.length} 处：${removed.join(' / ').slice(0, 60)}`)
  const { clean: cleanStem, removed: stemWm } = stripWatermarks(typeof q.stem === 'string' ? q.stem : '')
  const watermarkInStem = stemWm.length > 0

  // ---- A2 脏字符 ----
  const dirtyChars = []
  for (const ch of clean) {
    if (isDirtyChar(ch)) {
      const cp = ch.codePointAt(0)
      dirtyChars.push({ ch, cp: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0') })
    }
  }
  const dirtySet = [...new Set(dirtyChars.map((d) => d.cp + ' ' + d.ch))]

  // ---- A1 答案自述一致性（硬信号）----
  const selfs = extractSelfAnswers(clean)
  const selfKeys = [...new Set(selfs.map((s) => s.key))]
  const answerKeys = Array.isArray(q.answer) ? q.answer : [q.answer]
  const conflict = selfKeys.length > 0 && !selfKeys.some((k) => answerKeys.includes(k))

  // ---- A4 悬空图注 ----
  const hasImages = Array.isArray(q.images) && q.images.length > 0
  const hasDanglingFigure = !hasImages && FIGURE_CITES.some((c) => clean.includes(c))

  // ---- A5 选项净化 ----
  // 选项同样是喂给模型的输入。实测 2011-07 的 D 选项末尾混入了
  // 「全国各院校…N诺考研」的推广语，2023-05 的 B 选项含乱码。
  // 这些会被模型当作题目的一部分理解，必须先净化。
  const cleanOptions = {}
  const optionIssues = []
  for (const [k, v] of Object.entries(q.options || {})) {
    if (typeof v !== 'string') { cleanOptions[k] = ''; continue }
    const { clean: cOpt, removed: optWm } = stripWatermarks(v)
    const bad = [...cOpt].filter(isDirtyChar)
    cleanOptions[k] = cOpt
    if (bad.length) {
      optionIssues.push({ key: k, kind: 'dirty', chars: [...new Set(bad.map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')))] })
    }
    if (optWm.length) optionIssues.push({ key: k, kind: 'watermark', removed: optWm })
  }
  const optDirty = optionIssues.some((o) => o.kind === 'dirty')
  if (optDirty) reasons.push(`选项含非法字符，输入不可靠：${optionIssues.filter((o) => o.kind === 'dirty').map((o) => o.key).join('/')}`)
  else if (optionIssues.length) reasons.push(`选项已剥离水印 ${optionIssues.length} 处`)
  if (watermarkInStem) reasons.push('题干含水印，已剥离')

  // ---- 判定（硬信号优先）----
  let status = 'ok'
  if (conflict) {
    status = 'answer-conflict'
    reasons.push(
      `解析自称答案 ${selfKeys.join('/')}，与题库 answer=${answerKeys.join('')} 冲突` +
      `（「${selfs[0].phrase}」，位置 ${selfs[0].at}）`
    )
  } else if (dirtyChars.length) {
    status = 'dirty'
    reasons.push(`含 ${dirtyChars.length} 个非法字符（PDF 提取残留）：${dirtySet.slice(0, 8).join('  ')}`)
  } else if (removed.length) {
    status = 'watermark'
  }

  if (hasDanglingFigure) reasons.push('解析引用了不存在的配图（题目无 images）')

  const mis = misplacementRisk(q, clean)
  if (mis.level !== 'low') {
    reasons.push(`错位嫌疑（${mis.level}）：解析中的特征数字 ${mis.orphanNumbers.slice(0, 6).join('/')} 均未出现在题干或选项中`)
  }

  // ---- A6 内容同源（补 A1 的漏：文本属于别的题，但答案字段看不出来）----
  // 只在前面的硬信号都没报警时才升级 status —— 判定理由要保留置信度最高的那一条。
  // 2023-11 同时满足 A1（自述答案 C ≠ answer D）与 A6（内容错位），
  // 报 answer-conflict 信息量更大：它是零假阳性的硬证据。
  const overlap = contentOverlap(q, clean)
  if (overlap.verdict === 'different-source') {
    if (status === 'ok' || status === 'watermark') status = 'content-mismatch'
    reasons.push(
      `解析与题干内容不同源：解析 ${overlap.expGrams} 个特征词中仅 ${overlap.shared} 个与题干/选项重合` +
      `（占比 ${(overlap.ratio * 100).toFixed(1)}%），判为错位解析，不得作为锚定源`
    )
  }

  // usable = 解析干净 且 与题干同源 且 选项可用（选项脏则输入不可靠，宁可走提问式）
  const usable = (status === 'ok' || status === 'watermark') && !optDirty

  return {
    status,
    usable,
    cleanText: clean,
    cleanOptions,
    cleanStem,
    reasons,
    selfAnswers: selfKeys,
    dirtyChars: dirtySet,
    watermarks: removed,
    hasDanglingFigure,
    optionIssues,
    /**
     * 错位嫌疑等级。**弱信号，不得作为自动判定依据** ——
     * 只用于把人工复核对准最可疑的条目（high 先审）。
     * 真正做判定的是 contentOverlap（A6）。
     */
    misplacement: mis,
    /** A6 内容同源检测明细（判断依据见 contentOverlap 的注释） */
    content: overlap,
  }
}

/**
 * 批量体检 → 汇总报告。用于打样前的数据基线，也用于 CI 回归。
 */
export function auditBank(questions) {
  const rows = []
  for (const q of questions) rows.push({ id: q.id, ...auditExplanation(q) })
  const byStatus = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1
  const withText = rows.filter((r) => r.status !== 'empty')
  return {
    total: rows.length,
    withExplanation: withText.length,
    usable: rows.filter((r) => r.usable).length,
    byStatus,
    blocked: rows.filter((r) => r.status !== 'empty' && !r.usable),
    rows,
  }
}
