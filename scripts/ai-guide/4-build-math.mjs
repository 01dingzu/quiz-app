/**
 * 阶段 4 · 为考研数学一生成 AI 指引静态资源
 * ============================================================
 * 与阶段 3（408 三科）的关键差异：
 *
 *  · math.json 的 subject 按题号段硬分，约 30 道线代/概率题被标成「高等数学」。
 *    若按 subject 分科建资源，前端按 q.subject 取图谱时这些题会拿到错误学科
 *    的知识点。因此**只产出一份三科共享资源**，guide.ts 里三行 RESOURCES
 *    全部指向同一组文件；每题的 topic / mt 按题干实际考点人工指定。
 *
 *  · 219 题全部走人工 override，不跑关键词打分（LaTeX 题干会把中文词切碎，
 *    tag.mjs 的 minScore / margin 门槛会造成大量漏标与歧义）。
 *
 *  · 不生成干扰项诊断与解析体检警示：数学选项是公式、解析是 LaTeX，
 *    408 那套按选项字母逐字锚定的机制不适用，绝不编造引用。
 *
 * 纯本地、零模型、可重复运行。用法：node scripts/ai-guide/4-build-math.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MATH_DEFS } from './data/defs-math.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const GUIDE = path.join(ROOT, 'public/guide')
const DIAG = path.join(GUIDE, 'diag')
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/math.json'), 'utf8'))
const BANK_IDS = new Set(BANK.map((q) => q.id))

const report = []
const say = (s) => { report.push(s); console.log(s) }
let fatal = false

fs.mkdirSync(DIAG, { recursive: true })
say(`数学题库 ${BANK.length} 题，目标科目：${MATH_DEFS.map((d) => d.SUBJECT).join(' / ')}`)

// ------------------------------------------------------------
// 1. 逐科校验定义资产
// ------------------------------------------------------------
const ALL_NODES = []
const ALL_MOTHERS = []
const ALL_OVERRIDES = {}
const ID_RE = /^(hm|la|pb)-\d+\.\d+\.\d+$/

for (const def of MATH_DEFS) {
  say('')
  say(`=== ${def.SUBJECT}（${def.CODE}）===`)
  const errors = []
  const warnings = []
  const seen = new Set()

  for (const n of def.NODES) {
    if (!n.id) { errors.push('存在缺少 id 的节点'); continue }
    if (seen.has(n.id)) errors.push(`id 重复：${n.id}`)
    seen.add(n.id)
    if (!ID_RE.test(n.id)) errors.push(`id 格式不合规：${n.id}`)
    if (!n.id.startsWith(def.PREFIX + '-')) errors.push(`${n.id} 前缀与 ${def.PREFIX} 不符`)
  }
  for (const n of def.NODES) {
    for (const p of n.prereq || []) {
      if (p === n.id) errors.push(`${n.id} 的前置指向自身`)
      else if (!seen.has(p)) errors.push(`${n.id} 的前置 ${p} 不在本科目内`)
    }
    const len = (n.summary || '').length
    if (len < 40) errors.push(`${n.id} 的 summary 过短（${len} 字）`)
    if (len > 300) warnings.push(`${n.id} 的 summary 偏长（${len} 字）`)
    if (!Array.isArray(n.keywords) || !n.keywords.length) errors.push(`${n.id} 缺少 keywords`)
    if (!(n.weight >= 1 && n.weight <= 5)) errors.push(`${n.id} 的 weight 非法`)
    if (!n.chapter) errors.push(`${n.id} 缺少 chapter`)
    if (!n.name) errors.push(`${n.id} 缺少 name`)
  }
  // DAG 拓扑排序（本科目内）
  const indeg = new Map(def.NODES.map((n) => [n.id, 0]))
  const adj = new Map(def.NODES.map((n) => [n.id, []]))
  for (const n of def.NODES) for (const p of n.prereq || []) if (adj.has(p)) { adj.get(p).push(n.id); indeg.set(n.id, indeg.get(n.id) + 1) }
  const queue = def.NODES.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  let visited = 0
  for (let i = 0; i < queue.length; i++) { visited++; for (const nx of adj.get(queue[i])) { indeg.set(nx, indeg.get(nx) - 1); if (indeg.get(nx) === 0) queue.push(nx) } }
  if (visited !== def.NODES.length) errors.push('图谱存在回路，无法拓扑排序')

  const motherIds = new Set(def.MOTHERS.map((m) => m.id))
  for (const m of def.MOTHERS) {
    if (!m.id || !m.name) errors.push('母题缺 id/name')
    if (!Array.isArray(m.skeleton) || m.skeleton.length < 3) errors.push(`${m.id} 解题骨架少于 3 步`)
    if (!m.traps || !Object.keys(m.traps).length) errors.push(`${m.id} 没有陷阱库`)
    for (const t of m.topics || []) if (!seen.has(t)) errors.push(`${m.id} 引用了不存在的知识点 ${t}`)
  }
  for (const [qid, ov] of Object.entries(def.OVERRIDES)) {
    if (!BANK_IDS.has(qid)) errors.push(`overrides 题号不在数学题库：${qid}`)
    if (ov.mt && !motherIds.has(ov.mt)) errors.push(`overrides ${qid} 引用了不存在的母题 ${ov.mt}`)
    if (ov.topic && !seen.has(ov.topic)) errors.push(`overrides ${qid} 引用了不存在的知识点 ${ov.topic}`)
  }

  say(`  图谱 ${def.NODES.length} 节点 / ${def.NODES.reduce((s, n) => s + (n.prereq || []).length, 0)} 条前置边，母题 ${def.MOTHERS.length} 个，人工标注 ${Object.keys(def.OVERRIDES).length} 题`)
  for (const w of warnings) say(`  ! ${w}`)
  if (errors.length) { for (const e of errors) say(`  ✗ ${e}`); fatal = true; continue }
  say('  ✓ 图谱/母题/标注外键校验通过，DAG 无环')

  ALL_NODES.push(...def.NODES)
  ALL_MOTHERS.push(...def.MOTHERS)
  for (const [qid, ov] of Object.entries(def.OVERRIDES)) {
    if (ALL_OVERRIDES[qid]) { say(`  ✗ 跨科重复标注：${qid}`); fatal = true }
    ALL_OVERRIDES[qid] = ov
  }
}

// ------------------------------------------------------------
// 2. 全量覆盖校验：219 题一题不漏
// ------------------------------------------------------------
say('')
say('=== 合并校验 ===')
const uncovered = BANK.filter((q) => !ALL_OVERRIDES[q.id]).map((q) => q.id)
const orphan = Object.keys(ALL_OVERRIDES).filter((id) => !BANK_IDS.has(id))
if (uncovered.length) { say(`  ✗ 未标注 ${uncovered.length} 题：${uncovered.join(' ')}`); fatal = true }
if (orphan.length) { say(`  ✗ 标注了题库中不存在的题号 ${orphan.length} 个：${orphan.join(' ')}`); fatal = true }
const allNodeIds = new Set(ALL_NODES.map((n) => n.id))
const allMotherIds = new Set(ALL_MOTHERS.map((m) => m.id))
for (const [qid, ov] of Object.entries(ALL_OVERRIDES)) {
  if (!allNodeIds.has(ov.topic)) { say(`  ✗ ${qid} 的 topic ${ov.topic} 不在合并图谱`); fatal = true }
  if (!allMotherIds.has(ov.mt)) { say(`  ✗ ${qid} 的 mt ${ov.mt} 不在合并母题库`); fatal = true }
}
say(`  合并图谱 ${ALL_NODES.length} 节点、母题 ${ALL_MOTHERS.length} 个、标注 ${Object.keys(ALL_OVERRIDES).length}/${BANK.length} 题`)
if (!fatal) say('  ✓ 全量覆盖、外键一致、零重复')

// ------------------------------------------------------------
// 3. 产出（一份三科共享资源）
// ------------------------------------------------------------
if (fatal) {
  say('')
  say('✗ 存在致命校验错误，已中止（未写入任何前端产物）')
  fs.writeFileSync(path.join(HERE, '.4-build-math-report.txt'), report.join('\n'), 'utf8')
  process.exit(1)
}

say('')
say('=== 写入 public/guide ===')

const kg = {
  version: '1.0', paper: '数学一', subject: '数学一（三科共享）',
  generatedAt: new Date().toISOString().slice(0, 10),
  subjects: MATH_DEFS.map((d) => d.SUBJECT),
  nodeCount: ALL_NODES.length,
  edgeCount: ALL_NODES.reduce((s, n) => s + (n.prereq || []).length, 0),
  maxDepth: null,
  note: '数学一三科共享图谱：math.json 的 subject 按题号段硬分，部分题的学科标签与实际考点不符，故不按 subject 分科，按题干实际考点挂载 topic。',
  nodes: ALL_NODES,
}
fs.writeFileSync(path.join(GUIDE, 'kg-math.json'), JSON.stringify(kg, null, 2), 'utf8')
say('  ✓ kg-math.json')

fs.writeFileSync(path.join(GUIDE, 'mothers-math.json'), JSON.stringify({
  version: '1', paper: '数学一', subject: '数学一（三科共享）', mothers: ALL_MOTHERS,
}, null, 2), 'utf8')
say('  ✓ mothers-math.json')

const tagsOut = {}
for (const [qid, ov] of Object.entries(ALL_OVERRIDES)) {
  tagsOut[qid] = { topic: ov.topic, mt: ov.mt, by: 'override' }
}
fs.writeFileSync(path.join(GUIDE, 'tags-math.json'), JSON.stringify(tagsOut, null, 2), 'utf8')
say(`  ✓ tags-math.json（${Object.keys(tagsOut).length} 题，全部人工标注）`)

// 不做解析体检：数学解析是 LaTeX，408 的 PDF 脏字符口径不适用
fs.writeFileSync(path.join(GUIDE, 'exp-warn-math.json'), JSON.stringify({}, null, 2), 'utf8')
say('  ✓ exp-warn-math.json（空，按设计不生成）')

fs.writeFileSync(path.join(DIAG, 'math.json'), JSON.stringify({
  version: '1', paper: '数学一', subject: '数学一（三科共享）', generator: 'none',
  note: '数学选项为公式、解析为 LaTeX，无法按选项字母逐字锚定；不编造干扰项诊断。',
  stats: { questions: 0, items: 0, grounded: 0, probe: 0, conclusion: 0, criterion: 0, topics: 0, mothers: 0 },
  questions: {},
}, null, 2), 'utf8')
say('  ✓ diag/math.json（空，按设计不生成）')

say('')
say('✓ 数学三科共享资源生成完毕')
fs.writeFileSync(path.join(HERE, '.4-build-math-report.txt'), report.join('\n'), 'utf8')
