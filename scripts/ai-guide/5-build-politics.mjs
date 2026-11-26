/**
 * 阶段 5 · 为考研政治生成 AI 指引静态资源
 * ============================================================
 * 与阶段 4（数学一）同构，三点差异：
 *
 *  · politics.json 的 subject 同样按题号段硬分（no11/12 的法律道德题被标成
 *    「史纲」，no26 的洋务运动被标成「毛中特」）。因此只产出**一份六科共享
 *    资源**，guide.ts 六行 RESOURCES 指向同一组文件，每题 topic/mt 按题干
 *    实际考点由 assignQuestion() 挂载，完全不读 q.subject。
 *
 *  · 589 题走「全局关键词打分 + 人工 override」：政治题干是纯中文、概念词明确，
 *    规则命中率远高于 LaTeX 题干的数学。脚本会打印每题归属、by 分布与低分清单，
 *    便于逐条复核；fallback 必须为 0 才会写入前端产物。
 *
 *  · 政治是背诵辨析型：母题骨架是「命题角度 → 定位原理 → 排除陷阱 → 回代材料」，
 *    traps 是绝对化表述 / 张冠李戴 / 时间错位。不生成按选项字母逐字锚定的
 *    干扰项诊断，也不做解析体检（解析是中文叙述，不存在 PDF 脏字符口径）。
 *
 * 纯本地、零模型、可重复运行。用法：node scripts/ai-guide/5-build-politics.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLITICS_DEFS, POLITICS_OVERRIDES, assignQuestion } from './data/defs-politics.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const GUIDE = path.join(ROOT, 'public/guide')
const DIAG = path.join(GUIDE, 'diag')
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/politics.json'), 'utf8'))
const BANK_IDS = new Set(BANK.map((q) => q.id))

const report = []
const say = (s) => { report.push(s); console.log(s) }
let fatal = false

fs.mkdirSync(DIAG, { recursive: true })
say(`政治题库 ${BANK.length} 题，目标科目：${POLITICS_DEFS.map((d) => d.SUBJECT).join(' / ')}`)

// ------------------------------------------------------------
// 1. 逐科校验定义资产
// ------------------------------------------------------------
const ALL_NODES = []
const ALL_MOTHERS = []
const ID_RE = /^(my|mz|xs|sg|sx|sz)-\d+\.\d+\.\d+$/

for (const def of POLITICS_DEFS) {
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
    const len = (n.summary || '').length
    if (len < 40) errors.push(`${n.id} 的 summary 过短（${len} 字）`)
    if (len > 300) warnings.push(`${n.id} 的 summary 偏长（${len} 字）`)
    if (!Array.isArray(n.keywords) || !n.keywords.length) errors.push(`${n.id} 缺少 keywords`)
    if (!(n.weight >= 1 && n.weight <= 5)) errors.push(`${n.id} 的 weight 非法`)
    if (!n.chapter) errors.push(`${n.id} 缺少 chapter`)
    if (!n.name) errors.push(`${n.id} 缺少 name`)
  }

  const motherIds = new Set(def.MOTHERS.map((m) => m.id))
  for (const m of def.MOTHERS) {
    if (!m.id || !m.name) errors.push('母题缺 id/name')
    if (!m.id.startsWith('mt-' + def.CODE + '-')) errors.push(`${m.id} 前缀与 mt-${def.CODE}- 不符`)
    if (!Array.isArray(m.skeleton) || m.skeleton.length < 3) errors.push(`${m.id} 判断骨架少于 3 步`)
    if (!m.traps || !Object.keys(m.traps).length) errors.push(`${m.id} 没有陷阱库`)
    for (const t of m.topics || []) if (!seen.has(t)) errors.push(`${m.id} 引用了不存在的知识点 ${t}`)
  }
  void motherIds

  say(`  图谱 ${def.NODES.length} 节点 / ${def.NODES.reduce((s, n) => s + (n.prereq || []).length, 0)} 条前置边，母题 ${def.MOTHERS.length} 个`)
  for (const w of warnings) say(`  ! ${w}`)
  if (errors.length) { for (const e of errors) say(`  ✗ ${e}`); fatal = true; continue }
  say('  ✓ 图谱 / 母题结构校验通过')

  ALL_NODES.push(...def.NODES)
  ALL_MOTHERS.push(...def.MOTHERS)
}

// ------------------------------------------------------------
// 2. 合并校验：全局 prereq 外键 + DAG 无环
// ------------------------------------------------------------
say('')
say('=== 合并校验 ===')
const allNodeIds = new Set(ALL_NODES.map((n) => n.id))
const allMotherIds = new Set(ALL_MOTHERS.map((m) => m.id))
if (allNodeIds.size !== ALL_NODES.length) { say('  ✗ 合并后节点 id 有重复'); fatal = true }
if (allMotherIds.size !== ALL_MOTHERS.length) { say('  ✗ 合并后母题 id 有重复'); fatal = true }
for (const n of ALL_NODES) {
  for (const p of n.prereq || []) {
    if (p === n.id) { say(`  ✗ ${n.id} 的前置指向自身`); fatal = true }
    else if (!allNodeIds.has(p)) { say(`  ✗ ${n.id} 的前置 ${p} 不存在`); fatal = true }
  }
}
const indeg = new Map(ALL_NODES.map((n) => [n.id, 0]))
const adj = new Map(ALL_NODES.map((n) => [n.id, []]))
for (const n of ALL_NODES) for (const p of n.prereq || []) if (adj.has(p)) { adj.get(p).push(n.id); indeg.set(n.id, indeg.get(n.id) + 1) }
const queue = ALL_NODES.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
let visited = 0
for (let i = 0; i < queue.length; i++) { visited++; for (const nx of adj.get(queue[i])) { indeg.set(nx, indeg.get(nx) - 1); if (indeg.get(nx) === 0) queue.push(nx) } }
if (visited !== ALL_NODES.length) { say('  ✗ 图谱存在回路，无法拓扑排序'); fatal = true }
say(`  合并图谱 ${ALL_NODES.length} 节点、母题 ${ALL_MOTHERS.length} 个、前置边 ${ALL_NODES.reduce((s, n) => s + (n.prereq || []).length, 0)} 条`)
if (!fatal) say('  ✓ 外键一致，DAG 无环')

// ------------------------------------------------------------
// 3. 逐题标注：全覆盖 + 外键 + by 分布 + 低分清单
// ------------------------------------------------------------
say('')
say('=== 逐题标注 ===')
const tagsOut = {}
const byCount = { rule: 0, override: 0, default: 0, fallback: 0 }
const lowScore = []
const defaultIds = []
const topicCount = {}
const mtCount = {}
let bad = 0

for (const q of BANK) {
  const a = assignQuestion(q)
  byCount[a.by] = (byCount[a.by] || 0) + 1
  if (a.by === 'default') defaultIds.push(`${q.id} → ${a.topic} | ${(q.stem || '').slice(0, 44)}`)
  if (!a.topic || !a.mt) {
    say(`  ✗ ${q.id} 未标注（by=${a.by}）stem: ${(q.stem || '').slice(0, 60)}`)
    bad++; continue
  }
  if (!allNodeIds.has(a.topic)) { say(`  ✗ ${q.id} 的 topic ${a.topic} 不存在`); bad++; continue }
  if (!allMotherIds.has(a.mt)) { say(`  ✗ ${q.id} 的 mt ${a.mt} 不存在`); bad++; continue }
  tagsOut[q.id] = { topic: a.topic, mt: a.mt, by: a.by }
  topicCount[a.topic] = (topicCount[a.topic] || 0) + 1
  mtCount[a.mt] = (mtCount[a.mt] || 0) + 1
  if (a.by === 'rule' && a.score < 20) lowScore.push(`${q.id}(${a.score}) ${a.topic} | ${(q.stem || '').slice(0, 46)}`)
}
const orphan = Object.keys(POLITICS_OVERRIDES).filter((id) => !BANK_IDS.has(id))
if (orphan.length) { say(`  ✗ override 了题库中不存在的题号：${orphan.join(' ')}`); fatal = true }
if (bad) { say(`  ✗ ${bad} 题标注无效`); fatal = true }
if (byCount.fallback) { say(`  ✗ ${byCount.fallback} 题规则未命中（fallback），需补 override`); fatal = true }

say(`  标注 ${Object.keys(tagsOut).length}/${BANK.length} 题，by 分布：rule ${byCount.rule || 0} / override ${byCount.override || 0} / default ${byCount.default || 0} / fallback ${byCount.fallback || 0}`)
say(`  知识点覆盖 ${Object.keys(topicCount).length}/${ALL_NODES.length} 个节点，母题覆盖 ${Object.keys(mtCount).length}/${ALL_MOTHERS.length} 个`)
if (defaultIds.length) {
  say(`  ! 落回本科兜底节点 ${defaultIds.length} 题（无特异词命中，按 subject 挂通用节点）：`)
  for (const x of defaultIds.slice(0, 30)) say(`     ${x}`)
}
if (lowScore.length) {
  say(`  ! 低分（score 小于 20）${lowScore.length} 题，前 40 条：`)
  for (const x of lowScore.slice(0, 40)) say(`     ${x}`)
}
if (!fatal) say('  ✓ 589/589 全覆盖、外键一致、零 fallback')

// ------------------------------------------------------------
// 4. 产出（一份六科共享资源）
// ------------------------------------------------------------
if (fatal) {
  say('')
  say('✗ 存在致命校验错误，已中止（未写入任何前端产物）')
  fs.writeFileSync(path.join(HERE, '.5-build-politics-report.txt'), report.join('\n'), 'utf8')
  process.exit(1)
}

say('')
say('=== 写入 public/guide ===')

const kg = {
  version: '1.0', paper: '政治', subject: '政治（六科共享）',
  generatedAt: new Date().toISOString().slice(0, 10),
  subjects: POLITICS_DEFS.map((d) => d.SUBJECT),
  nodeCount: ALL_NODES.length,
  edgeCount: ALL_NODES.reduce((s, n) => s + (n.prereq || []).length, 0),
  maxDepth: null,
  note: '政治六科共享图谱：politics.json 的 subject 按题号段硬分，部分题的学科标签与实际考点不符，故不按 subject 分科，按题干实际考点挂载 topic。母题骨架为命题角度与辨析流程，不是计算型解题步骤。',
  nodes: ALL_NODES,
}
fs.writeFileSync(path.join(GUIDE, 'kg-politics.json'), JSON.stringify(kg, null, 2), 'utf8')
say('  ✓ kg-politics.json')

fs.writeFileSync(path.join(GUIDE, 'mothers-politics.json'), JSON.stringify({
  version: '1', paper: '政治', subject: '政治（六科共享）', mothers: ALL_MOTHERS,
}, null, 2), 'utf8')
say('  ✓ mothers-politics.json')

fs.writeFileSync(path.join(GUIDE, 'tags-politics.json'), JSON.stringify(tagsOut, null, 2), 'utf8')
say(`  ✓ tags-politics.json（${Object.keys(tagsOut).length} 题）`)

// 政治解析是中文叙述，不做解析体检；与数学口径一致留空
fs.writeFileSync(path.join(GUIDE, 'exp-warn-politics.json'), JSON.stringify({}, null, 2), 'utf8')
say('  ✓ exp-warn-politics.json（空，按设计不生成）')

fs.writeFileSync(path.join(DIAG, 'politics.json'), JSON.stringify({
  version: '1', paper: '政治', subject: '政治（六科共享）', generator: 'none',
  note: '政治是背诵辨析型，选项多为并列条款与固定表述，不做按选项字母逐字锚定的干扰项诊断；不编造引用。母题骨架与陷阱库承担辨析引导。',
  stats: { questions: 0, items: 0, grounded: 0, probe: 0, conclusion: 0, criterion: 0, topics: 0, mothers: 0 },
  questions: {},
}, null, 2), 'utf8')
say('  ✓ diag/politics.json（空，按设计不生成）')

say('')
say('✓ 政治六科共享资源生成完毕')
fs.writeFileSync(path.join(HERE, '.5-build-politics-report.txt'), report.join('\n'), 'utf8')
