/**
 * 阶段 1 · 建知识点图谱
 * ============================================================
 * 输入：scripts/ai-guide/data/kg-ds-skeleton.json（人工整理的骨架）
 * 输出：public/guide/kg-408.json（运行时按需 fetch 的图谱）
 *
 * 这一步**不调用模型**。骨架的准确性来自考纲与教材目录，模型抽边只是补充，
 * 而方案书 §4.3 明确要求「边全部人工过」——把人写的骨架直接做硬校验比让模型再抽一遍更可靠。
 * 模型的用武之地在阶段 2/3/4（标注、聚类、诊断）。
 *
 * 校验（任一不过则非零退出）：
 *   - id 唯一且符合 ds-章.节.序号 格式
 *   - prereq 引用的节点必须存在
 *   - 无自环、无环（拓扑排序必须成功）—— 方案书 §3.3 的硬约束
 *   - summary 长度在合理区间、keywords 非空、weight ∈ [1,5]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

export const SRC_FILE = path.join(HERE, 'data/kg-ds-skeleton.json')
export const OUT_FILE = path.join(ROOT, 'public/guide/kg-408.json')

/** 拓扑排序 + 层级计算。有环时返回失败与环上节点。 */
export function topoLevels(nodes) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map(nodes.map((n) => [n.id, []]))
  for (const n of nodes) {
    for (const p of n.prereq || []) {
      if (!adj.has(p)) continue
      adj.get(p).push(n.id)
      indeg.set(n.id, indeg.get(n.id) + 1)
    }
  }
  const level = new Map()
  const queue = []
  for (const n of nodes) if (indeg.get(n.id) === 0) { queue.push(n.id); level.set(n.id, 0) }
  let head = 0
  let seen = 0
  while (head < queue.length) {
    const id = queue[head++]
    seen++
    for (const nxt of adj.get(id)) {
      level.set(nxt, Math.max(level.get(nxt) ?? 0, level.get(id) + 1))
      indeg.set(nxt, indeg.get(nxt) - 1)
      if (indeg.get(nxt) === 0) queue.push(nxt)
    }
  }
  if (seen !== nodes.length) {
    return { ok: false, cycle: nodes.filter((n) => indeg.get(n.id) > 0).map((n) => n.id) }
  }
  const depths = [...level.values()]
  return { ok: true, maxDepth: depths.length ? Math.max(...depths) + 1 : 0, levels: level }
}

const ID_RE = /^ds-\d+\.\d+\.\d+$/

export function validateGraph(g) {
  const errors = []
  const warnings = []
  const nodes = g.nodes || []

  if (!nodes.length) errors.push('图谱没有任何节点')

  // id 唯一与格式
  const seen = new Set()
  for (const n of nodes) {
    if (!n.id) { errors.push('存在缺少 id 的节点'); continue }
    if (seen.has(n.id)) errors.push(`id 重复：${n.id}`)
    seen.add(n.id)
    if (!ID_RE.test(n.id)) errors.push(`id 格式不合规（应为 ds-章.节.序号）：${n.id}`)
  }

  // 引用完整性 + 内容质量
  for (const n of nodes) {
    for (const p of n.prereq || []) {
      if (p === n.id) errors.push(`${n.id} 的前置指向自身`)
      else if (!seen.has(p)) errors.push(`${n.id} 的前置 ${p} 不存在`)
    }
    const len = (n.summary || '').length
    if (len < 40) errors.push(`${n.id} 的 summary 过短（${len} 字，要求 ≥ 40）`)
    if (len > 300) warnings.push(`${n.id} 的 summary 偏长（${len} 字）`)
    if (!Array.isArray(n.keywords) || !n.keywords.length) errors.push(`${n.id} 缺少 keywords`)
    if (!(n.weight >= 1 && n.weight <= 5)) errors.push(`${n.id} 的 weight 非法：${n.weight}`)
    if (!n.chapter) errors.push(`${n.id} 缺少 chapter`)
    if (!n.name) errors.push(`${n.id} 缺少 name`)
  }

  // DAG
  const topo = topoLevels(nodes)
  if (!topo.ok) errors.push(`存在回路，无法拓扑排序：${topo.cycle.join(' → ')}`)

  // 连通性提示：真正的问题是「既没有前置、也没有任何节点以它为前置」的游离节点
  // （它会同时失去归因上溯与下游推荐两条路径）。叶子终点节点不算问题。
  const usedAsPrereq = new Set(nodes.flatMap((n) => n.prereq || []))
  const hasOwnPrereq = new Set(nodes.filter((n) => (n.prereq || []).length).map((n) => n.id))
  const orphans = [...seen].filter((id) => !hasOwnPrereq.has(id) && !usedAsPrereq.has(id))
  if (orphans.length) warnings.push(`${orphans.length} 个游离节点（无前置也无人引用）：${orphans.join(', ')}`)

  // 长 summary 提示：打样阶段可接受（内容密度换长度），上线前建议拆分
  const longOnes = nodes.filter((n) => (n.summary || '').length > 300)
  if (longOnes.length) {
    warnings.push(`${longOnes.length} 个 summary 超过 300 字，建议后续拆分为「概念」+「易错判据」两个节点`)
  }

  return { errors, warnings, topo, nodeCount: nodes.length, edgeCount: nodes.reduce((s, n) => s + (n.prereq || []).length, 0) }
}

export function buildGraph() {
  const skeleton = JSON.parse(fs.readFileSync(SRC_FILE, 'utf8'))
  const v = validateGraph(skeleton)
  const graph = {
    version: skeleton.version || '1.0',
    paper: skeleton.paper || '408',
    subject: skeleton.subject || '数据结构',
    generatedAt: new Date().toISOString().slice(0, 10),
    subjects: [...new Set(skeleton.nodes.map((n) => n.subject || skeleton.subject))],
    nodeCount: v.nodeCount,
    edgeCount: v.edgeCount,
    maxDepth: v.topo.ok ? v.topo.maxDepth : null,
    nodes: skeleton.nodes,
  }
  return { graph, validation: v }
}

function main() {
  const { graph, validation } = buildGraph()
  console.log(`[1/5] 建知识点图谱 —— ${graph.subject}（${graph.paper}）`)
  console.log(`  节点 ${validation.nodeCount} 个，前置边 ${validation.edgeCount} 条，最大层级 ${graph.maxDepth}`)
  console.log(`  章节分布：`)
  const byChapter = new Map()
  for (const n of graph.nodes) byChapter.set(n.chapter, (byChapter.get(n.chapter) || 0) + 1)
  for (const [c, k] of byChapter) console.log(`    ${c}: ${k}`)
  for (const w of validation.warnings) console.log(`  ! ${w}`)
  if (validation.errors.length) {
    console.log(`\n  ✗ 校验失败 ${validation.errors.length} 项：`)
    for (const e of validation.errors) console.log(`    - ${e}`)
    process.exit(1)
  }
  console.log('  ✓ DAG 校验通过，引用完整，内容字段齐全')
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2), 'utf8')
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1)
  console.log(`  → ${path.relative(ROOT, OUT_FILE)}  (${kb}KB)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
