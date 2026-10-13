/**
 * AI 指引产物验证（离线，不启动浏览器）
 * ============================================================
 * 这个脚本的核心不是「检查文件格式」，而是**对已上线的产物重跑一遍锚定校验**：
 *
 *   把 408-ds.json 里每条诊断的 evidence.quote 重新拿去和题库原文逐字匹配。
 *   引用是「逐字」的，所以这件事可以完全离线、零成本、无歧义地做。
 *
 * 为什么这一步不可省：产物是静态文件，一旦上线就是学生看到的内容。
 * 题库将来被修订（历史上已改过多轮）、或产物被手工编辑过，
 * 都会让原本合法的引用悄悄失效 —— 只有回归测试能发现。
 *
 * 运行：node --experimental-strip-types scripts/verify-guide.mts
 * 报告：scripts/.verify-guide-report.txt
 */

import fs from 'node:fs'
import { auditExplanation } from './ai-guide/lib/explanation-audit.mjs'
import { verifyQuote } from './ai-guide/lib/grounding.mjs'

const ROOT = new URL('../', import.meta.url)
const REPORT = new URL('./.verify-guide-report.txt', import.meta.url)

const read = (rel: string) => JSON.parse(fs.readFileSync(new URL(rel, ROOT), 'utf8'))

const lines: string[] = []
let pass = 0
let fail = 0
function t(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; lines.push(`  OK   ${name}`) }
  else { fail++; lines.push(`  FAIL ${name}${detail ? `   -> ${detail}` : ''}`) }
}
function group(title: string) { lines.push(''); lines.push(`### ${title}`) }

// ============================================================
// 载入
// ============================================================
const kg = read('public/guide/kg-408.json')
const shard = read('public/guide/diag/408-ds.json')
const motherFile = read('public/guide/mothers-408-ds.json')
const tags = read('public/guide/tags-408-ds.json')
const warn = read('public/guide/exp-warn-408-ds.json')
const bankRaw = read('src/data/questions.json')

/** 题库索引：与运行时的 normalizeQuestion 口径保持一致的最低要求（id/subject/answer/options/stem/explanation） */
const bank = new Map<string, any>()
for (const q of bankRaw) bank.set(q.id, q)

const mothers: any[] = motherFile.mothers || []
const motherById = new Map<string, any>(mothers.map((m: any) => [m.id, m]))
const kgIds = new Set<string>((kg.nodes || []).map((n: any) => n.id))

// 全局陷阱库（校验 trap 外键要用全集，因为 trap id 在母题间是唯一的）
const trapPool = new Map<string, string>()
for (const m of mothers) for (const [tid, tr] of Object.entries(m.traps || {})) trapPool.set(tid, m.id)

// ============================================================
// G1 · 文件与 schema
// ============================================================
group('G1 · 产物文件与 schema')
t('知识图谱节点数 70', (kg.nodes || []).length === 70, `实际 ${(kg.nodes || []).length}`)
t('知识图谱 maxDepth = 8', kg.maxDepth === 8, `实际 ${kg.maxDepth}`)
t('母题库 38 条', mothers.length === 38, `实际 ${mothers.length}`)
t('诊断分片有 questions 字段', !!shard.questions && typeof shard.questions === 'object')
t('分片 stats 与 lastRun 分开记录（增量复跑不污染累计口径）', !!shard.stats && !!shard.lastRun)
t('标注表非空', Object.keys(tags).length > 0, `${Object.keys(tags).length} 条`)
t('解析警示非空', Object.keys(warn).length > 0, `${Object.keys(warn).length} 条`)

// ============================================================
// G2 · 【核心】对已上线产物重跑锚定校验
// ============================================================
group('G2 · 逐字引用重校验（对产物本身，而非对构建期中间态）')

let quoteTotal = 0
let quoteBad = 0
const quoteBadDetail: string[] = []
let keyTotal = 0
let keyOnAnswer = 0
let probeTotal = 0
let probeWithAssertion = 0
const probeBadDetail: string[] = []
let lenOver = 0
let emptyText = 0
let trapGhost = 0
const trapGhostDetail: string[] = []
const seenTrapIds: string[] = []

for (const [qid, entry] of Object.entries<any>(shard.questions || {})) {
  const q = bank.get(qid)
  if (!q) continue
  const answerKeys = Array.isArray(q.answer) ? q.answer : [q.answer]
  const audit = auditExplanation(q)

  for (const [key, d] of Object.entries<any>(entry.d || {})) {
    keyTotal++
    if (answerKeys.includes(key)) keyOnAnswer++

    const text = d.grounded ? d.why : d.probe
    const len = typeof text === 'string' ? text.replace(/\s/g, '').length : 0
    if (!len) emptyText++
    if (len > 80) lenOver++

    if (d.grounded) {
      quoteTotal++
      const quote = d.evidence?.quote
      // 注意：锚定源必须用**体检后净化过的文本**，与构建期完全一致
      const r = verifyQuote(quote || '', audit.cleanText)
      if (!r.ok) {
        quoteBad++
        quoteBadDetail.push(`${qid}/${key}  ${r.reason}`)
      }
      if (!['conclusion', 'criterion'].includes(d.evidence?.kind)) {
        quoteBad++
        quoteBadDetail.push(`${qid}/${key}  evidence.kind 非法：${JSON.stringify(d.evidence?.kind)}`)
      }
      if (d.evidence?.kind === 'criterion') seenTrapIds.push(`${qid}/${key} criterion`)
    } else {
      probeTotal++
      // 路径 P：结论词禁令
      const ASSERTION = ['错在', '错的原因', '原因在于', '因为', '所以', '因此', '说明', '意味着', '应该是', '正确的是', '正确选项', '错误在于', '根源']
      const hit = ASSERTION.filter((w) => typeof text === 'string' && text.includes(w))
      if (hit.length) {
        probeWithAssertion++
        probeBadDetail.push(`${qid}/${key}  含结论词 ${hit.join('/')}`)
      }
      if (d.evidence) quoteBadDetail.push(`${qid}/${key}  路径 P 不应带 evidence`)
    }

    if (d.trap && !trapPool.has(d.trap)) {
      trapGhost++
      trapGhostDetail.push(`${qid}/${key}  trap=${d.trap} 不在全局陷阱库`)
    }
  }
}

t(`共 ${quoteTotal} 条已锚定诊断，引用全部仍能逐字命中原文`, quoteBad === 0, quoteBadDetail.slice(0, 6).join(' | '))
t('已锚定诊断的 evidence.kind 全部合法', !quoteBadDetail.some((s) => s.includes('kind')))
t(`共 ${keyTotal} 条诊断，没有一条落在正确选项上`, keyOnAnswer === 0, `命中 ${keyOnAnswer}`)
t(`共 ${probeTotal} 条提问式引导，全部不含结论词`, probeWithAssertion === 0, probeBadDetail.slice(0, 6).join(' | '))
t('所有指引文本非空', emptyText === 0, `空 ${emptyText}`)
t('所有指引文本 ≤ 80 字', lenOver === 0, `超长 ${lenOver}`)
t('trap 外键全部存在于全局陷阱库', trapGhost === 0, trapGhostDetail.slice(0, 6).join(' | '))

// ============================================================
// G3 · 统计口径
// ============================================================
group('G3 · 统计口径自洽')
{
  let items = 0, grounded = 0, probe = 0, conclusion = 0, criterion = 0
  const topicSet = new Set<string>()
  const mtSet = new Set<string>()
  for (const entry of Object.values<any>(shard.questions || {})) {
    if (entry.topic) topicSet.add(entry.topic)
    if (entry.mt) mtSet.add(entry.mt)
    for (const d of Object.values<any>(entry.d || {})) {
      items++
      if (d.grounded) {
        grounded++
        if (d.evidence?.kind === 'criterion') criterion++
        else conclusion++
      } else probe++
    }
  }
  const s = shard.stats
  t('stats 题目数 = 重算值', s.questions === Object.keys(shard.questions || {}).length, `${s.questions} vs ${Object.keys(shard.questions || {}).length}`)
  t('stats 条数 = 重算值', s.items === items, `${s.items} vs ${items}`)
  t('stats 已锚定 = 重算值', s.grounded === grounded, `${s.grounded} vs ${grounded}`)
  t('stats 提问式 = 重算值', s.probe === probe, `${s.probe} vs ${probe}`)
  t('stats 结论型 = 重算值', s.conclusion === conclusion, `${s.conclusion} vs ${conclusion}`)
  t('stats 判据型 = 重算值', s.criterion === criterion, `${s.criterion} vs ${criterion}`)
  t('stats 知识点数 = 重算值', s.topics === topicSet.size, `${s.topics} vs ${topicSet.size}`)
  t('stats 母题数 = 重算值', s.mothers === mtSet.size, `${s.mothers} vs ${mtSet.size}`)
  t('结论型 + 判据型 = 已锚定', conclusion + criterion === grounded)
  t('已锚定 + 提问式 = 总条数', grounded + probe === items)
  lines.push(`  分布：已锚定 ${grounded}（结论型 ${conclusion} / 判据型 ${criterion}）｜ 提问式 ${probe}`)
}

// ============================================================
// G4 · 外键完整性
// ============================================================
group('G4 · 外键完整性')
{
  const badTopic: string[] = []
  const badMt: string[] = []
  for (const [qid, entry] of Object.entries<any>(shard.questions || {})) {
    if (entry.topic && !kgIds.has(entry.topic)) badTopic.push(`${qid}:${entry.topic}`)
    if (entry.mt && !motherById.has(entry.mt)) badMt.push(`${qid}:${entry.mt}`)
  }
  t('分片里的 topic 全部存在于知识图谱', badTopic.length === 0, badTopic.join(' '))
  t('分片里的 mt 全部存在于母题库', badMt.length === 0, badMt.join(' '))

  const badKgPre: string[] = []
  for (const n of kg.nodes) {
    for (const p of n.prereq || []) {
      if (!kgIds.has(p)) badKgPre.push(`${n.id}->${p}`)
      if (p === n.id) badKgPre.push(`${n.id} 自环`)
    }
  }
  t('知识图谱前置边全部指向存在的节点且无自环', badKgPre.length === 0, badKgPre.slice(0, 5).join(' '))

  const badMtTopic: string[] = []
  for (const m of mothers) for (const tp of m.topics || []) if (!kgIds.has(tp)) badMtTopic.push(`${m.id}:${tp}`)
  t('母题引用的知识点全部存在', badMtTopic.length === 0, badMtTopic.slice(0, 5).join(' '))

  const badTag: string[] = []
  for (const qid of Object.keys(tags)) if (!bank.has(qid)) badTag.push(qid)
  t('标注表题号全部存在于题库', badTag.length === 0, badTag.slice(0, 5).join(' '))

  const badTagMt: string[] = []
  for (const [qid, r] of Object.entries<any>(tags)) {
    if (r.mt && !motherById.has(r.mt)) badTagMt.push(`${qid}:${r.mt}`)
    if (r.topic && !kgIds.has(r.topic)) badTagMt.push(`${qid}:${r.topic}`)
  }
  t('标注表引用的母题/知识点全部存在', badTagMt.length === 0, badTagMt.slice(0, 5).join(' '))

  // 分片与标注表必须一致：同一题在两处的 mt/topic 不能打架
  const conflict: string[] = []
  for (const [qid, entry] of Object.entries<any>(shard.questions || {})) {
    const r = tags[qid]
    if (!r) continue
    if ((entry.mt || null) !== (r.mt || null)) conflict.push(`${qid} mt: ${entry.mt} vs ${r.mt}`)
    if (r.topic && (entry.topic || null) !== (r.topic || null)) conflict.push(`${qid} topic: ${entry.topic} vs ${r.topic}`)
  }
  t('分片与标注表的 mt/topic 一致（两处不打架）', conflict.length === 0, conflict.slice(0, 5).join(' | '))
}

// ============================================================
// G5 · 陷阱库与母题质量
// ============================================================
group('G5 · 陷阱库与母题质量')
{
  t('陷阱 id 全局唯一（跨母题不重名，否则 trap 外键会歧义）', trapPool.size === mothers.reduce((n: number, m: any) => n + Object.keys(m.traps || {}).length, 0))
  const thin = mothers.filter((m: any) => !m.skeleton || m.skeleton.length < 3).map((m: any) => m.id)
  t('每个母题至少 3 步解题骨架', thin.length === 0, thin.join(' '))
  const noTrap = mothers.filter((m: any) => !m.traps || !Object.keys(m.traps).length).map((m: any) => m.id)
  t('每个母题都有陷阱库', noTrap.length === 0, noTrap.join(' '))
  const shortSummary = kg.nodes.filter((n: any) => (n.summary || '').length < 40).map((n: any) => n.id)
  t('每个知识点摘要 ≥ 40 字', shortSummary.length === 0, shortSummary.join(' '))
  const noPre = kg.nodes.filter((n: any) => !n.keywords || n.keywords.length === 0).map((n: any) => n.id)
  t('每个知识点有关键词', noPre.length === 0, noPre.join(' '))
  lines.push(`  陷阱库共 ${trapPool.size} 条`)
}

// ============================================================
// G6 · 解析警示必须与体检结论一致
// ============================================================
group('G6 · 解析警示与体检结论一致性')
{
  const mismatch: string[] = []
  for (const [qid, w] of Object.entries<any>(warn)) {
    const q = bank.get(qid)
    if (!q) { mismatch.push(`${qid} 不在题库`); continue }
    const a = auditExplanation(q)
    if (a.usable) mismatch.push(`${qid} 体检判为可用，却出现在警示里`)
    if (a.status !== w.status) mismatch.push(`${qid} status ${w.status} != ${a.status}`)
    if (!w.reason) mismatch.push(`${qid} 缺原因`)
  }
  t('警示里的每一题都被体检判为不可用', mismatch.length === 0, mismatch.slice(0, 5).join(' | '))

  // 反向：所有被判不可用的题都应该出现在警示里
  const missing: string[] = []
  for (const q of bankRaw) {
    if (q.subject !== '数据结构') continue
    const a = auditExplanation(q)
    if (a.status === 'empty' || a.usable) continue
    if (!warn[q.id]) missing.push(q.id)
  }
  t('所有被判不可用的解析都进了警示（无遗漏）', missing.length === 0, missing.join(' '))

  const conflictCount = Object.values<any>(warn).filter((w) => w.status === 'answer-conflict').length
  t('其中「解析自称答案与标注冲突」6 题', conflictCount === 6, `实际 ${conflictCount}`)
  lines.push(`  警示 ${Object.keys(warn).length} 题：${Object.entries<any>(warn).map(([k, v]) => `${k}(${v.status})`).join(' ')}`)
}

// ============================================================
// G7 · 标注覆盖率
// ============================================================
group('G7 · 标注覆盖率')
{
  const dsAll = bankRaw.filter((q: any) => q.subject === '数据结构')
  const tagged = Object.keys(tags).length
  t('数据结构 151 题', dsAll.length === 151, `实际 ${dsAll.length}`)
  t(`标注覆盖率 ≥ 95%（${tagged}/${dsAll.length}）`, tagged / dsAll.length >= 0.95, `${((tagged / dsAll.length) * 100).toFixed(1)}%`)
  const byRule = Object.values<any>(tags).filter((r) => r.by === 'rule').length
  const byOverride = Object.values<any>(tags).filter((r) => r.by === 'override').length
  t('人工纠错表确实被应用（存在 by=override 的条目）', byOverride > 0, `${byOverride} 条`)
  lines.push(`  规则标注 ${byRule} 条 · 人工纠错 ${byOverride} 条 · 未标 ${dsAll.length - tagged} 题`)
}

// ============================================================
// 汇总
// ============================================================
lines.push('')
lines.push(`RESULT: ${pass} pass / ${fail} fail`)
const report = lines.join('\n')
fs.writeFileSync(REPORT, report, 'utf8')
console.log(report.split('\n').filter((l) => l.startsWith('  FAIL') || l.startsWith('###') || l.startsWith('RESULT')).join('\n'))
console.log(`\n报告：${REPORT.pathname}`)
process.exit(fail === 0 ? 0 : 1)
