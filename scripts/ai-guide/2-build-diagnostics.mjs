/**
 * 2 · 生成干扰项诊断
 * ============================================================
 * 管线：题库 → 体检 → 标注 → 分流（G/P）→ 调用模型 → 锚定校验 → 分片产物
 *
 * 三个刻意的设计决定：
 *
 * ① **分流由体检结果决定，不由调用方决定。**
 *    见 lib/prompt.mjs 的 buildDiagnosticPrompt。调用方不允许自己判断该走哪条路径，
 *    否则「解析不可信就只提问」这条规则迟早会被绕过。
 *
 * ② **校验在写入之前，且失败即丢弃。**
 *    模型产出先过 validateShard，不合格的条目直接不进产物，并在报告里留档。
 *    绝不「先写进去再人工清理」—— 产物是静态文件，一旦上线就是学生看到的东西。
 *
 * ③ **增量靠哈希，不靠时间戳。**
 *    每道题的输入指纹 = 题干 + 选项 + 解析 + 提示词版本 + 母题。
 *    任一变化都会重跑该题；题库改了但题没变就不会白花一次调用。
 *
 * 用法：
 *   node scripts/ai-guide/2-build-diagnostics.mjs                       # 用 file provider + 预置响应
 *   LLM_API_KEY=... node scripts/ai-guide/2-build-diagnostics.mjs --provider http
 *   node scripts/ai-guide/2-build-diagnostics.mjs --limit 30            # 只跑前 30 题（打样）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditExplanation } from './lib/explanation-audit.mjs'
import { validateShard } from './lib/grounding.mjs'
import { tagBank } from './lib/tag.mjs'
import { createProvider, pool, parseJsonLoose, usageReport } from './lib/llm.mjs'
import { buildDiagnosticPrompt } from './lib/prompt.mjs'
import { hashInput, State } from './lib/state.mjs'

const ROOT = new URL('../../', import.meta.url)
const HERE = new URL('./', import.meta.url)
const PROMPT_VERSION = 'p1'          // 提示词改动时递增，强制全量重跑
const SHARD_VERSION = '1'

const readJson = (u) => JSON.parse(fs.readFileSync(u, 'utf8'))

// ============================================================
// 参数
// ============================================================
function parseArgs(argv) {
  const o = { provider: process.env.LLM_PROVIDER || 'file', subject: '数据结构', limit: 0, out: null, dryRun: false, ids: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--provider') o.provider = argv[++i]
    else if (a === '--subject') o.subject = argv[++i]
    else if (a === '--limit') o.limit = Number(argv[++i])
    else if (a === '--out') o.out = argv[++i]
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--ids-file') o.idsFile = argv[++i]
    else if (a === '--responses') o.responsesFile = argv[++i]
  }
  return o
}

// ============================================================
// 预检：母题/规则引用的知识点必须在知识图谱里真实存在
// ============================================================
function preflight(kg, mothers, rules, bankIds) {
  const errors = []
  const warnings = []
  const kgIds = new Set((kg.nodes || []).map((n) => n.id))
  const mtIds = new Set(mothers.map((m) => m.id))

  for (const m of mothers) {
    if (!m.id || !m.name) errors.push(`母题缺 id/name：${JSON.stringify(m.id)}`)
    if (!Array.isArray(m.skeleton) || m.skeleton.length < 3) warnings.push(`${m.id} 解题骨架少于 3 步`)
    if (!m.traps || !Object.keys(m.traps).length) warnings.push(`${m.id} 没有陷阱库`)
    for (const t of m.topics || []) {
      if (!kgIds.has(t)) errors.push(`${m.id} 引用了不存在的知识点 ${t}`)
    }
  }
  for (const r of rules.rules || []) {
    if (!mtIds.has(r.mt)) errors.push(`规则引用了不存在的母题 ${r.mt}`)
  }
  for (const [qid, ov] of Object.entries(rules.overrides || {})) {
    if (qid.startsWith('_')) continue
    if (!bankIds.has(qid)) errors.push(`人工纠错表引用了不存在的题目 ${qid}`)
    if (ov.mt && !mtIds.has(ov.mt)) errors.push(`人工纠错表 ${qid} 引用了不存在的母题 ${ov.mt}`)
    if (ov.topic && !kgIds.has(ov.topic)) errors.push(`人工纠错表 ${qid} 引用了不存在的知识点 ${ov.topic}`)
  }
  return { errors, warnings }
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const log = []
  const say = (s) => { log.push(s) }

  const allQuestions = readJson(new URL('src/data/questions.json', ROOT))
  const kg = readJson(new URL('public/guide/kg-408.json', ROOT))
  const motherFile = readJson(new URL('data/mothers-ds.json', HERE))
  const ruleFile = readJson(new URL('data/mother-rules-ds.json', HERE))
  const mothers = motherFile.mothers || motherFile
  const motherById = new Map(mothers.map((m) => [m.id, m]))

  const subjectQuestions = allQuestions.filter((q) => q.subject === opts.subject)
  const bank = new Map(subjectQuestions.map((q) => [q.id, q]))

  say(`题库：${allQuestions.length} 题，本科目（${opts.subject}）${subjectQuestions.length} 题`)

  // --- 预检：外键完整性 ---
  const pf = preflight(kg, mothers, ruleFile, new Set(allQuestions.map((q) => q.id)))
  if (pf.errors.length) {
    say('')
    say('!! 预检失败（外键悬空会直接产出错误内容，已中止）：')
    for (const e of pf.errors) say(`   - ${e}`)
    writeReport(log)
    process.exit(1)
  }
  for (const w of pf.warnings) say(`   · 预检提示：${w}`)
  say(`预检通过：${mothers.length} 个母题、${(ruleFile.rules || []).length} 条规则、外键全部有效`)

  // --- 标注 ---
  const tagging = tagBank(subjectQuestions, { rules: ruleFile.rules, overrides: ruleFile.overrides })
  say(`母题标注：已标 ${tagging.tagged}/${subjectQuestions.length}（${(tagging.coverage * 100).toFixed(1)}%）`)
  if (tagging.ambiguous.length) {
    say(`   拒绝标注（规则歧义，转人工）：${tagging.ambiguous.map((r) => r.id).join(' ')}`)
  }
  const tagById = new Map(tagging.rows.map((r) => [r.id, r]))

  // --- 体检 ---
  const auditById = new Map()
  for (const q of subjectQuestions) auditById.set(q.id, auditExplanation(q))
  const usableCount = [...auditById.values()].filter((a) => a.usable).length
  say(`解析体检：可锚定 ${usableCount} 题，其余走提问式引导`)

  // --- 选样 ---
  let work = subjectQuestions
  if (opts.idsFile) {
    const ids = readJson(new URL(opts.idsFile, ROOT)).ids || []
    const want = new Set(ids)
    work = subjectQuestions.filter((q) => want.has(q.id))
    const found = new Set(work.map((q) => q.id))
    const lost = ids.filter((id) => !found.has(id))
    say(`按清单处理：${work.length} 题${lost.length ? `（清单中 ${lost.length} 题不在题库：${lost.join(' ')}）` : ''}`)
  } else if (opts.limit > 0) {
    work = subjectQuestions.slice(0, opts.limit)
  }
  say(`本次处理 ${work.length} 题`)

  // --- 组装任务（含增量判断）---
  const state = new State(fileURLToPath(new URL('.ai-guide-state.json', HERE)))
  const tasks = []
  let skipped = 0
  for (const q of work) {
    const tag = tagById.get(q.id)
    const audit = auditById.get(q.id)
    const mother = tag?.mt ? motherById.get(tag.mt) : null
    const answerKeys = Array.isArray(q.answer) ? q.answer : [q.answer]
    const { path: p, messages } = buildDiagnosticPrompt({ question: q, answerKeys, audit, mother })
    const h = hashInput(PROMPT_VERSION, p, q.stem, JSON.stringify(q.options), audit.cleanText, tag?.mt || '-')
    if (state.isFresh('diag', q.id, h, SHARD_VERSION)) { skipped++; continue }
    tasks.push({ q, tag, audit, mother, answerKeys, path: p, messages, hash: h })
  }
  say(skipped ? `增量：跳过未变更 ${skipped} 题，本次需生成 ${tasks.length} 题` : `增量：全部需生成（${tasks.length} 题）`)

  // --- 调用模型 ---
  const provider = opts.dryRun ? null : createProvider({
    provider: opts.provider,
    responsesFile: opts.responsesFile || fileURLToPath(new URL('data/sample-diag-ds.json', HERE)),
  })
  say(`provider：${provider ? provider.name : 'dry-run'}`)

  const rawShard = { items: {} }
  const missing = []
  if (provider) {
    await pool(tasks, async (t) => {
      const text = await provider.ask(t.messages, { requestKey: t.q.id })
      if (text == null) { missing.push(t.q.id); return }
      const j = parseJsonLoose(text)
      if (!j || !j.items) { missing.push(t.q.id + '（返回无法解析为 JSON）'); return }
      // 只接受错误选项的诊断；正确项与不存在的 key 一律不进
      const filtered = {}
      for (const [k, item] of Object.entries(j.items)) {
        if (!item) continue
        if (t.answerKeys.includes(k)) continue
        filtered[k] = item
      }
      if (Object.keys(filtered).length) rawShard.items[t.q.id] = filtered
    }, 2)
  }

  // --- 锚定校验（写盘前）---
  const bankObj = Object.fromEntries(bank)
  const trapLibraryAll = {}
  for (const m of mothers) for (const [tid, t] of Object.entries(m.traps || {})) trapLibraryAll[tid] = t
  const vs = validateShard(rawShard, bankObj, { trapLibrary: trapLibraryAll })

  // --- 落盘 ---
  const diagPath = opts.out || fileURLToPath(new URL('public/guide/diag/408-ds.json', ROOT))
  const existing = fs.existsSync(diagPath) ? readJson(diagPath) : { questions: {} }
  const questionsOut = { ...(existing.questions || {}) }

  for (const [qid, byKey] of Object.entries(vs.items)) {
    const tag = tagById.get(qid)
    const audit = auditById.get(qid)
    questionsOut[qid] = {
      topic: tag?.topic || (tag?.mt ? (motherById.get(tag.mt)?.topics || [])[0] : null) || null,
      mt: tag?.mt || null,
      grounded: Object.values(byKey).some((d) => d.grounded),
      src: audit?.usable ? 'explanation' : 'probe',
      d: byKey,
    }
    state.mark('diag', qid, tasks.find((t) => t.q.id === qid)?.hash || '', SHARD_VERSION)
  }
  // 本次跑过、但校验后一条都没通过的题：清掉旧产物，避免旧数据掩盖新回归
  let purged = 0
  for (const t of tasks) {
    if (!vs.items[t.q.id] && questionsOut[t.q.id]) { delete questionsOut[t.q.id]; purged++ }
  }
  if (purged) say(`清理：${purged} 题本次全部判废，已从产物中移除`)
  state.prune('diag', Object.keys(questionsOut))
  state.save()

  // 统计口径必须从**合并后的产物**算，而不是本次运行。
  // 踩过的坑：增量跑第二遍时本次 vs.stats 全为 0，直接把产物里的 stats 覆盖成 0，
  // 前端据此显示「0 条诊断」。产物统计与本次运行统计是两件事，分开记。
  const agg = { questions: Object.keys(questionsOut).length, items: 0, grounded: 0, probe: 0, conclusion: 0, criterion: 0, topics: 0, mothers: 0 }
  const topicSet = new Set()
  const mtSet = new Set()
  for (const v of Object.values(questionsOut)) {
    if (v.topic) topicSet.add(v.topic)
    if (v.mt) mtSet.add(v.mt)
    for (const d of Object.values(v.d || {})) {
      agg.items++
      if (d.grounded) {
        agg.grounded++
        if (d.evidence?.kind === 'criterion') agg.criterion++
        else agg.conclusion++
      } else agg.probe++
    }
  }
  agg.topics = topicSet.size
  agg.mothers = mtSet.size

  const shard = {
    version: SHARD_VERSION,
    paper: '408',
    subject: opts.subject,
    generator: provider ? provider.name : 'dry-run',
    promptVersion: PROMPT_VERSION,
    stats: agg,
    lastRun: { ...vs.stats, at: new Date().toISOString().slice(0, 10) },
    questions: questionsOut,
  }
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(diagPath), { recursive: true })
    fs.writeFileSync(diagPath, JSON.stringify(shard), 'utf8')
  }

  // --- 附带产物 ①：母题库（前端渲染解题骨架与陷阱标签需要）---
  const motherOutPath = fileURLToPath(new URL('public/guide/mothers-408-ds.json', ROOT))
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(motherOutPath), { recursive: true })
    fs.writeFileSync(motherOutPath, JSON.stringify({
      version: '1',
      paper: '408',
      subject: opts.subject,
      mothers,
    }), 'utf8')
  }

  // --- 附带产物 ②：解析体检警示 ---
  // 这是本管线最容易被忽略、但对学生最直接的一个产物：
  // 题库里存在「解析自称的答案与标注答案冲突」「解析整段属于另一道题」的条目
  // （实测数据结构 151 题里有 11 题）。这些解析在界面上仍然会展示，
  // 如果不加提示，学生读到的是被污染的、甚至明确错误的内容。
  // 这里把它们连同原因一起产出，前端在解析旁给出警示。
  const warnOut = {}
  for (const [qid, a] of auditById) {
    if (a.status === 'empty') continue      // 没有解析 ≠ 解析有问题
    if (a.usable) continue
    warnOut[qid] = { status: a.status, reason: a.reasons[0] || '' }
  }
  const warnPath = fileURLToPath(new URL('public/guide/exp-warn-408-ds.json', ROOT))
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(warnPath), { recursive: true })
    fs.writeFileSync(warnPath, JSON.stringify(warnOut), 'utf8')
  }

  // --- 附带产物 ③：标注表（题号 → 知识点 / 母题）---
  // 刻意**不回写题库 JSON**：题库是数据源，指引管线是派生物，
  // 派生物污染源文件会让「重跑就能复原」这件事失效。
  // 标注结果单独出一份小文件，前端查表即可；将来标注规则改进只需重跑本脚本。
  const tagsOut = {}
  for (const r of tagging.rows) {
    if (!r.mt && !r.topic) continue
    tagsOut[r.id] = { topic: r.topic || null, mt: r.mt || null, by: r.by }
  }
  const tagsPath = fileURLToPath(new URL('public/guide/tags-408-ds.json', ROOT))
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(tagsPath), { recursive: true })
    fs.writeFileSync(tagsPath, JSON.stringify(tagsOut), 'utf8')
  }

  // --- 报告 ---
  const sizeKb = opts.dryRun ? 0 : +(fs.statSync(diagPath).size / 1024).toFixed(1)
  say('')
  say(`=== 本次运行的锚定校验 ===`)
  say(`条目 ${vs.stats.total}：通过 ${vs.stats.pass}，判废 ${vs.stats.failed}（通过率 ${(vs.stats.passRate * 100).toFixed(1)}%）`)
  say(`  已锚定 ${vs.stats.grounded}（结论型 ${vs.stats.conclusion} / 判据型 ${vs.stats.criterion}）｜ 提问式 ${vs.stats.probe}`)
  say('')
  say(`=== 产物累计（${path.relative(fileURLToPath(ROOT), diagPath)}，${sizeKb} KB）===`)
  say(`  覆盖 ${agg.questions} 题 / ${agg.items} 条诊断`)
  say(`  已锚定 ${agg.grounded}（结论型 ${agg.conclusion} / 判据型 ${agg.criterion}）｜ 提问式 ${agg.probe}`)
  say(`  涉及 ${agg.topics} 个知识点、${agg.mothers} 个母题`)
  say(`  附带产物：母题库 ${mothers.length} 条 · 标注表 ${Object.keys(tagsOut).length} 条 · 解析警示 ${Object.keys(warnOut).length} 条`)

  if (vs.failures.length) {
    say('')
    say(`=== 判废明细（前 40 条）===`)
    for (const f of vs.failures.slice(0, 40)) {
      say(`  ${f.qid}/${f.key}  ${f.errors.join('；')}`)
    }
  }
  if (vs.needsReview.length) {
    say('')
    say(`=== 需人工优先抽检（${vs.needsReview.length} 条，判据型 + 提问式全部在内）===`)
    for (const r of vs.needsReview.slice(0, 40)) {
      say(`  [${r.kind}] ${r.qid}/${r.key}  ${r.why}`)
    }
  }
  if (missing.length) {
    say('')
    say(`=== 未获得响应（${missing.length}）===  题库无对应预置响应，或模型返回不可解析`)
    say('  ' + missing.join(' '))
  }
  if (provider) {
    say('')
    say('=== 用量 ===')
    say('  ' + JSON.stringify(usageReport(provider)))
  }

  writeReport(log)
  console.log(log.join('\n'))
}

function writeReport(lines) {
  // 只写 UTF-8 一个文件。之前踩过的坑：PowerShell 重定向默认 UTF-16，
  // 用 `>` 抓输出会得到「二进制文件」，所以报告一律由脚本自己落盘、再用读取工具看。
  fs.writeFileSync(new URL('.ai-guide-build-report.txt', HERE), lines.join('\n'), 'utf8')
}

main().catch((e) => {
  fs.writeFileSync(new URL('.ai-guide-build-report.txt', HERE), String(e && e.stack || e), 'utf8')
  console.error(e)
  process.exit(1)
})
