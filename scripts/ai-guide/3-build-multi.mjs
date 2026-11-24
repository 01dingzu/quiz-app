/**
 * 阶段 3 · 为 408 另外三科批量生成 AI 指引静态资源
 * ============================================================
 * 与阶段 1/2 的关系：
 *   · 阶段 1/2 是「数据结构」单科试点，输入/输出路径写死，且诊断依赖
 *     LLM provider 的逐字锚定产出。三科真题解析大多为空或带水印，
 *     无法凭空产出可逐字核对的诊断——所以本脚本**不编造诊断内容**。
 *   · 本脚本交付「前置知识 + 母题讲解」这两块主体：知识图谱(kg)、
 *     母题库(mothers)、标注表(tags)、解析体检警示(exp-warn)。
 *     诊断分片(diag)生成结构完整但 questions 为空的分片，如实标注
 *     「按科目分批生成中」，不伪造引用。
 *
 * 纯本地、零模型、可重复运行：所有输入是 data/defs-*.mjs 人工骨架与
 * src/data/questions.json，输出全部是 public/guide 下的静态 JSON。
 *
 * 用法：node scripts/ai-guide/3-build-multi.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tagBank } from './lib/tag.mjs'
import { auditExplanation } from './lib/explanation-audit.mjs'
import * as COA from './data/defs-coa.mjs'
import * as OS from './data/defs-os.mjs'
import * as NET from './data/defs-net.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const GUIDE = path.join(ROOT, 'public/guide')
const DIAG = path.join(GUIDE, 'diag')
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/questions.json'), 'utf8'))

const DEFS = [COA, OS, NET]
const ID_RE = /^(coa|os|net)-\d+\.\d+\.\d+$/

// ------------------------------------------------------------
// 校验
// ------------------------------------------------------------
function validateGraph(def) {
  const errors = []
  const warnings = []
  const nodes = def.NODES
  const seen = new Set()

  for (const n of nodes) {
    if (!n.id) { errors.push('存在缺少 id 的节点'); continue }
    if (seen.has(n.id)) errors.push(`id 重复：${n.id}`)
    seen.add(n.id)
    if (!ID_RE.test(n.id)) errors.push(`id 格式不合规：${n.id}`)
    if (!n.id.startsWith(def.PREFIX + '-')) errors.push(`${n.id} 前缀与科目 ${def.PREFIX} 不符`)
  }
  for (const n of nodes) {
    for (const p of n.prereq || []) {
      if (p === n.id) errors.push(`${n.id} 的前置指向自身`)
      else if (!seen.has(p)) errors.push(`${n.id} 的前置 ${p} 不存在`)
    }
    const len = (n.summary || '').length
    if (len < 40) errors.push(`${n.id} 的 summary 过短（${len} 字）`)
    if (len > 300) warnings.push(`${n.id} 的 summary 偏长（${len} 字）`)
    if (!Array.isArray(n.keywords) || !n.keywords.length) errors.push(`${n.id} 缺少 keywords`)
    if (!(n.weight >= 1 && n.weight <= 5)) errors.push(`${n.id} 的 weight 非法`)
    if (!n.chapter) errors.push(`${n.id} 缺少 chapter`)
    if (!n.name) errors.push(`${n.id} 缺少 name`)
  }
  // DAG：拓扑排序
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map(nodes.map((n) => [n.id, []]))
  for (const n of nodes) for (const p of n.prereq || []) if (adj.has(p)) { adj.get(p).push(n.id); indeg.set(n.id, indeg.get(n.id) + 1) }
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  let seenN = 0
  for (let i = 0; i < q.length; i++) { seenN++; for (const nx of adj.get(q[i])) { indeg.set(nx, indeg.get(nx) - 1); if (indeg.get(nx) === 0) q.push(nx) } }
  if (seenN !== nodes.length) errors.push(`图谱存在回路，无法拓扑排序`)

  const nodeIds = seen
  const motherIds = new Set(def.MOTHERS.map((m) => m.id))
  for (const m of def.MOTHERS) {
    if (!m.id || !m.name) errors.push(`母题缺 id/name`)
    if (!Array.isArray(m.skeleton) || m.skeleton.length < 3) errors.push(`${m.id} 解题骨架少于 3 步`)
    if (!m.traps || !Object.keys(m.traps).length) errors.push(`${m.id} 没有陷阱库`)
    for (const t of m.topics || []) if (!nodeIds.has(t)) errors.push(`${m.id} 引用了不存在的知识点 ${t}`)
  }
  for (const r of def.RULES) if (!motherIds.has(r.mt)) errors.push(`规则引用了不存在的母题 ${r.mt}`)
  for (const [qid, ov] of Object.entries(def.OVERRIDES)) {
    if (ov.mt && !motherIds.has(ov.mt)) errors.push(`overrides ${qid} 引用了不存在的母题 ${ov.mt}`)
    if (ov.topic && !nodeIds.has(ov.topic)) errors.push(`overrides ${qid} 引用了不存在的知识点 ${ov.topic}`)
  }
  return { errors, warnings, nodeCount: nodes.length, edgeCount: nodes.reduce((s, n) => s + (n.prereq || []).length, 0) }
}

// ------------------------------------------------------------
// 主流程
// ------------------------------------------------------------
const report = []
const say = (s) => { report.push(s); console.log(s) }

fs.mkdirSync(DIAG, { recursive: true })
say(`题库总数 ${BANK.length}，目标科目：${DEFS.map((d) => d.SUBJECT).join(' / ')}`)

let fatal = false
for (const def of DEFS) {
  say('')
  say(`=== ${def.SUBJECT}（${def.CODE}）===`)
  const v = validateGraph(def)
  say(`  图谱 ${v.nodeCount} 节点 / ${v.edgeCount} 条前置边，母题 ${def.MOTHERS.length} 个，规则 ${def.RULES.length} 条，人工订正 ${Object.keys(def.OVERRIDES).length} 条`)
  for (const w of v.warnings) say(`  ! ${w}`)
  if (v.errors.length) { for (const e of v.errors) say(`  ✗ ${e}`); fatal = true; continue }
  say('  ✓ 图谱/母题/规则/订正外键校验通过，DAG 无环')

  // --- 1. 知识图谱 ---
  const kg = {
    version: '1.0', paper: '408', subject: def.SUBJECT,
    generatedAt: new Date().toISOString().slice(0, 10),
    subjects: [def.SUBJECT], nodeCount: v.nodeCount, edgeCount: v.edgeCount,
    maxDepth: null, nodes: def.NODES,
  }
  fs.writeFileSync(path.join(GUIDE, `kg-408-${def.CODE}.json`), JSON.stringify(kg, null, 2), 'utf8')

  // --- 2. 母题库（前端渲染解题骨架 + 陷阱标签）---
  const mothersPath = path.join(GUIDE, `mothers-408-${def.CODE}.json`)
  fs.writeFileSync(mothersPath, JSON.stringify({ version: '1', paper: '408', subject: def.SUBJECT, mothers: def.MOTHERS }, null, 2), 'utf8')
  const motherById = new Map(def.MOTHERS.map((m) => [m.id, m]))

  // --- 3. 标注（规则 + 人工订正），并为每题补 topic ---
  const subjectQuestions = BANK.filter((q) => q.subject === def.SUBJECT)
  const validIds = new Set(subjectQuestions.map((q) => q.id))
  const droppedOverrides = Object.keys(def.OVERRIDES).filter((id) => !validIds.has(id))
  if (droppedOverrides.length) say(`  ! overrides 中 ${droppedOverrides.length} 个题号不在本科题库：${droppedOverrides.join(' ')}`)
  const tagging = tagBank(subjectQuestions, { rules: def.RULES, overrides: def.OVERRIDES })
  const tagsOut = {}
  for (const r of tagging.rows) {
    const mt = r.mt
    if (!mt) continue
    const mother = motherById.get(mt)
    // 人工订正里写了 topic 就用它，否则回落到母题的第一个知识点：
    // 保证「每题都能显示知识点 + 前置知识链」，这正是四科齐平的关键。
    const topic = r.topic || (mother?.topics || [])[0] || null
    tagsOut[r.id] = { topic, mt, by: r.by }
  }
  fs.writeFileSync(path.join(GUIDE, `tags-408-${def.CODE}.json`), JSON.stringify(tagsOut, null, 2), 'utf8')
  const coverage = subjectQuestions.length ? (Object.keys(tagsOut).length / subjectQuestions.length * 100).toFixed(1) : '0'
  say(`  标注 ${Object.keys(tagsOut).length}/${subjectQuestions.length}（${coverage}%），歧义拒绝 ${tagging.ambiguous.length} 题`)
  const untagged = subjectQuestions.filter((q) => !tagsOut[q.id]).map((q) => q.id)
  if (untagged.length) say(`  未标注：${untagged.join(' ')}`)

  // --- 4. 解析体检警示 ---
  const warnOut = {}
  for (const q of subjectQuestions) {
    const a = auditExplanation(q)
    if (a.status === 'empty' || a.usable) continue
    const st = ['answer-conflict', 'dirty', 'content-mismatch'].includes(a.status) ? a.status : 'dirty'
    warnOut[q.id] = { status: st, reason: a.reasons[0] || '' }
  }
  fs.writeFileSync(path.join(GUIDE, `exp-warn-408-${def.CODE}.json`), JSON.stringify(warnOut, null, 2), 'utf8')
  say(`  解析体检警示 ${Object.keys(warnOut).length} 条`)

  // --- 5. 诊断分片：结构完整、内容为空（不编造逐字引用）---
  const shard = {
    version: '1', paper: '408', subject: def.SUBJECT, generator: 'none',
    note: '本科目诊断按科目分批生成中；三科真题解析大量为空或带水印，暂无可逐字锚定的诊断条目。',
    stats: { questions: 0, items: 0, grounded: 0, probe: 0, conclusion: 0, criterion: 0, topics: 0, mothers: 0 },
    questions: {},
  }
  fs.writeFileSync(path.join(DIAG, `408-${def.CODE}.json`), JSON.stringify(shard, null, 2), 'utf8')
  say(`  → kg / mothers / tags / exp-warn / diag(空) 五份产物已写入 public/guide`)
}

// ------------------------------------------------------------
// 6. 把「数据结构」的标注表补齐 topic，让四科在前置知识链上齐平
//    数据结构的试点产物里 146 条只有 15 条带 topic，导致只有 39 题
//    能看到前置知识链。这里按母题 topics[0] 兜底补齐，不改动原题库、
//    不改动已上线的 30 题诊断分片。
// ------------------------------------------------------------
say('')
say('=== 数据结构（ds）标注表补齐 topic ===')
try {
  const dsTagsPath = path.join(GUIDE, 'tags-408-ds.json')
  const dsMothersPath = path.join(GUIDE, 'mothers-408-ds.json')
  const dsTags = JSON.parse(fs.readFileSync(dsTagsPath, 'utf8'))
  const dsMothers = JSON.parse(fs.readFileSync(dsMothersPath, 'utf8')).mothers || []
  const byId = new Map(dsMothers.map((m) => [m.id, m]))
  let filled = 0
  for (const [qid, row] of Object.entries(dsTags)) {
    if (row.topic) continue
    const t = (byId.get(row.mt)?.topics || [])[0]
    if (t) { dsTags[qid] = { ...row, topic: t }; filled++ }
  }
  fs.writeFileSync(dsTagsPath, JSON.stringify(dsTags, null, 2), 'utf8')
  say(`  补齐 ${filled} 条，标注表共 ${Object.keys(dsTags).length} 条，现带 topic 者 ${Object.values(dsTags).filter((r) => r.topic).length} 条`)
} catch (e) {
  say(`  ! 数据结构标注表补齐失败：${e.message}`)
  fatal = true
}

say('')
if (fatal) { say('✗ 存在致命校验错误，已中止（未提交任何不一致产物到前端）'); fs.writeFileSync(path.join(HERE, '.3-build-multi-report.txt'), report.join('\n'), 'utf8'); process.exit(1) }
say('✓ 三科资源全部生成完毕')
fs.writeFileSync(path.join(HERE, '.3-build-multi-report.txt'), report.join('\n'), 'utf8')
