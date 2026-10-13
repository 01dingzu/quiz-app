/**
 * 锚定机制回归测试
 * ============================================================
 * 锁定两件事：
 *   ① 解析体检在**真实题库**上的判定（哪些解析可用、哪些必须隔离）
 *   ② 锚定校验的两条路径规则（有原文必引用 / 无原文只提问）
 *
 * 题库数据变动会让 A 组的部分数字断言失败 —— 这是期望行为：
 * 题目变了就应该重新体检，而不是让校验规则悄悄失效。
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  auditExplanation, auditBank, extractSelfAnswers, stripWatermarks, MIN_USABLE_LEN, contentOverlap,
} from './lib/explanation-audit.mjs'
import {
  verifyQuote, validateDiagnostic, validateShard, normalizeForMatch, MAX_DIAG_LEN,
} from './lib/grounding.mjs'
import { parseJsonLoose } from './lib/llm.mjs'
import { hashInput } from './lib/state.mjs'

const DATA_URL = new URL('../../src/data/questions.json', import.meta.url)
const REPORT_URL = new URL('../.ai-guide-test-report.txt', import.meta.url)

let pass = 0, fail = 0
const lines = []
function t(name, cond, detail = '') {
  if (cond) { pass++; lines.push(`  \u2713 ${name}`) }
  else { fail++; lines.push(`  \u2717 ${name}${detail ? '   \u2192 ' + detail : ''}`) }
}
function group(title) { lines.push(''); lines.push(`### ${title}`) }

// ============================================================
// A 组 · 解析体检（真实数据）
// ============================================================
const rawAll = JSON.parse(fs.readFileSync(DATA_URL, 'utf8'))
const ds = rawAll.filter((q) => q.subject === '数据结构')
const rep = auditBank(ds)

group('A · 解析体检（数据结构真实题库）')
t('数据结构共 151 题', rep.total === 151, `实际 ${rep.total}`)
t('有解析（>=30 字）40 题', rep.withExplanation === 40, `实际 ${rep.withExplanation}`)
t('可锚定 29 题（其余隔离）', rep.usable === 29, `实际 ${rep.usable}`)
t('被隔离 11 题', rep.blocked.length === 11, `实际 ${rep.blocked.length}`)

const blockedIds = new Set(rep.blocked.map((b) => b.id))
const CONFLICT_IDS = ['2023-01', '2023-02', '2023-05', '2023-08', '2023-10', '2023-11']
const DIRTY_IDS = ['2023-06', '2023-09']
// A6 新增：A1 抓不到的错位解析（2023-03 没写自述答案；2023-07 自述答案恰好对）
const MISMATCH_IDS = ['2023-03', '2023-07', '2020-10']
for (const id of CONFLICT_IDS) {
  t(`答案自述冲突被隔离：${id}`, blockedIds.has(id))
}
for (const id of DIRTY_IDS) {
  t(`乱码残留被隔离：${id}`, blockedIds.has(id))
}
for (const id of MISMATCH_IDS) {
  t(`内容不同源被隔离：${id}`, blockedIds.has(id))
}

// --- A6 内容同源：这两个是 A1 的盲区，必须靠内容比对才抓得到 ---
const a2303 = auditExplanation(ds.find((q) => q.id === '2023-03'))
t('2023-03 无自述答案（A1 抓不到，必须靠 A6）', a2303.selfAnswers.length === 0, a2303.selfAnswers.join('/'))
t('2023-03 内容不同源（题问三元组表，解析讲哈夫曼编码）', a2303.content.verdict === 'different-source')
t('2023-03 判定为 content-mismatch', a2303.status === 'content-mismatch', a2303.status)
t('2023-03 不可作为锚定源', a2303.usable === false)
t('2023-07 自述答案与 answer 一致（连冲突都算不上）', auditExplanation(ds.find((q) => q.id === '2023-07')).selfAnswers.includes('B'))
t('2023-07 仍被判内容不同源', auditExplanation(ds.find((q) => q.id === '2023-07')).content.verdict === 'different-source')
t('2023-07 不可作为锚定源', auditExplanation(ds.find((q) => q.id === '2023-07')).usable === false)
// 真同源的解析不得被误伤
t('2014-02 判为同源（与阈值留有余量）', auditExplanation(ds.find((q) => q.id === '2014-02')).content.verdict === 'same-source')
t('2011-03 判为同源', auditExplanation(ds.find((q) => q.id === '2011-03')).content.verdict === 'same-source')
t('2012-10 判为同源', auditExplanation(ds.find((q) => q.id === '2012-10')).content.verdict === 'same-source')
// 题干信息量不足时不下判断（2014-11 题干几乎是纯数字）
t('题干特征词过少时返回 undecidable 而非误判', contentOverlap(
  { stem: '下列选项中，不可能是快速排序第2趟排序结果的是', options: { A: '2,3,5,4,6,7,9', B: '2,7,5,6,4,3,9', C: '3,2,5,4,7,6,9', D: '4,2,3,5,7,6,9' } },
  '快排的阶段性排序结果的特点是，第i趟完成时，会有i个以上的数出现在它最终将要出现的位置',
).verdict === 'undecidable')
t('无解析题的 content 判定为 undecidable', auditExplanation(ds.find((q) => q.id === '2009-01')).content.verdict === 'undecidable')

const q2311 = ds.find((q) => q.id === '2023-11')
const a2311 = auditExplanation(q2311)
t('2023-11 解析自称答案为 C（题目标注 D）', a2311.selfAnswers.includes('C'), a2311.selfAnswers.join('/'))
t('2023-11 判定为 answer-conflict', a2311.status === 'answer-conflict', a2311.status)
// 2023-11 同时满足 A1 与 A6，status 应保留置信度更高的 A1（信息量更大，且零假阳性）
t('A1 与 A6 同时命中时保留更具体的 answer-conflict', a2311.status !== 'content-mismatch')
t('2023-11 的 A6 仍被记录（只是不改写 status）', a2311.content.verdict === 'different-source')
t('2023-11 错位嫌疑 high（CPU 执行时间的数字与题干零重合）', a2311.misplacement.level === 'high', a2311.misplacement.level)
t('2023-11 不可作为锚定源', a2311.usable === false)

const q2014_02 = ds.find((q) => q.id === '2014-02')
const a2014_02 = auditExplanation(q2014_02)
t('2014-02（1141 字最长解析）可锚定', a2014_02.usable === true, a2014_02.status)
t('2014-02 解析无脏字符', a2014_02.dirtyChars.length === 0)

// 水印：2011-07 的 D 选项末尾混入站点推广语，应被剥离且不影响可用性
const q2011_07 = ds.find((q) => q.id === '2011-07')
const a2011_07 = auditExplanation(q2011_07)
t('2011-07 选项水印被剥离', a2011_07.optionIssues.some((o) => o.kind === 'watermark'))
t('2011-07 净化后选项不含「N诺考研」', !a2011_07.cleanOptions.D.includes('N诺考研'), a2011_07.cleanOptions.D)
t('2011-07 仍可锚定（水印可剥，不阻断）', a2011_07.usable === true)

// 合法字符不得误判：2023-03 与 2020-11 的解析/选项含 × 与罗马数字
const a2023_03 = auditExplanation(ds.find((q) => q.id === '2023-03'))
t('乘号 × 不判脏（Latin-1 白名单）', !a2023_03.reasons.some((r) => r.includes('非法字符')), a2023_03.reasons.join('|'))
const a2011_08 = auditExplanation(ds.find((q) => q.id === '2011-08'))
t('罗马数字 ⅠⅡⅢ 不判脏', a2011_08.dirtyChars.length === 0 && !a2011_08.optionIssues.some((o) => o.kind === 'dirty'))

// 自述答案抽取器
t('抽取器识别「故本题的正确答案为 C」', extractSelfAnswers('……故本题的正确答案为 C。').some((s) => s.key === 'C'))
t('抽取器不误判「选项 A 的描述」', extractSelfAnswers('选项 A 的描述是正确的').length === 0)
t('无解析题判定为 empty 且不可锚定', auditExplanation(ds.find((q) => q.id === '2009-01')).status === 'empty')
t('empty 状态也返回净化后的选项', typeof auditExplanation(ds.find((q) => q.id === '2009-01')).cleanOptions.A === 'string')

// ============================================================
// B 组 · 逐字引用校验
// ============================================================
group('B · 逐字引用校验 verifyQuote')
const SRC = '插入元素时，front不变，rear+1.而插入第一个元素之后，队尾要指向尾元素，显然，rear初始应该为n-1,front为0。'

t('完全一致的引用通过', verifyQuote('rear初始应该为n-1,front为0', SRC).ok)
t('跨空格/换行的引用通过（归一化去空白）', verifyQuote('rear 初始应该为 n-1，front 为 0', SRC).ok)
t('全角半角标点差异不影响匹配', verifyQuote('rear初始应该为n-1，front为0', SRC).ok)
t('编造的引用被拒', !verifyQuote('rear初始应该为n+1,front为0', SRC).ok)
t('过短的引用被拒（< 6 字）', !verifyQuote('front', SRC).ok, JSON.stringify(verifyQuote('front', SRC).reason))
t('整段复制被拒（无校验意义）', !verifyQuote(SRC, SRC).ok)
t('空引用被拒', !verifyQuote('', SRC).ok)
t('锚定源为空时被拒', !verifyQuote('rear初始应该为n-1', '').ok)

const LATEX_SRC = '该段程序的时间复杂度 $T(n) = O(n \\log_2 n)$ ，故选 B。'
t('LaTeX 包裹差异不影响匹配', verifyQuote('T(n) = O(n log2 n)', LATEX_SRC).ok,
  JSON.stringify(verifyQuote('T(n) = O(n log2 n)', LATEX_SRC).reason))
t('归一化去掉空白与 LaTeX 命令', normalizeForMatch('$\\mathrm{O}(\\log_2 n)$') === 'o(log2n)',
  normalizeForMatch('$\\mathrm{O}(\\log_2 n)$'))

// ============================================================
// C 组 · 单条诊断校验（两条路径）
// ============================================================
group('C · 单条诊断校验')
const ctxG = {
  qid: 'T-G', answerKeys: ['B'], explanationText: SRC, explanationUsable: true,
  trapLibrary: { 'T-1': { label: '把队尾指针当成指向末尾元素的后一位' } },
}
const ctxP = { ...ctxG, qid: 'T-P', explanationText: '', explanationUsable: false }

// --- 路径 G：有可信解析 → 必须逐字引用 ---
const okG = validateDiagnostic({ key: 'A', why: '把队尾指针理解成指向末尾元素的后一位', evidence: { quote: 'rear初始应该为n-1' } }, ctxG)
t('路径G：引用正确 → 通过', okG.ok, okG.errors.join(';'))
t('路径G：标记 grounded=true', okG.grounded === true)
t('路径G：缺 evidence → 拒绝', !validateDiagnostic({ key: 'A', why: '把队尾指针理解错了' }, ctxG).ok)
t('路径G：引用编造 → 拒绝', !validateDiagnostic({ key: 'A', why: '把队尾指针理解错了', evidence: { quote: 'rear初始应该为n+1' } }, ctxG).ok)

// --- 路径 P：无可信解析 → 只能提问 ---
const okP = validateDiagnostic({ key: 'A', probe: '先想清楚队尾指针指向的是元素本身还是它的后一个位置？' }, ctxP)
t('路径P：提问式 → 通过', okP.ok, okP.errors.join(';'))
t('路径P：标记 grounded=false', okP.grounded === false)
t('路径P：给结论 → 拒绝', !validateDiagnostic({ key: 'A', why: '因为队尾指向元素本身，所以初始值应取 n-1' }, ctxP).ok)
t('路径P：probe 里夹带结论（因为…）→ 拒绝', !validateDiagnostic({ key: 'A', probe: '因为队尾指向元素本身，初始值是不是该取 n-1？' }, ctxP).ok)
t('路径P：非提问式 → 拒绝', !validateDiagnostic({ key: 'A', probe: '队尾指针的含义' }, ctxP).ok)
t('路径P：同时给 why 与 probe → 按 why 判，拒绝', !validateDiagnostic({ key: 'A', why: '因为…', probe: '？' }, ctxP).ok)

// --- 通用规则 ---
t('正确项不得出现诊断', !validateDiagnostic({ key: 'B', why: 'x', evidence: { quote: 'rear初始应该为n-1' } }, ctxG).ok)
t('非法 key 被拒', !validateDiagnostic({ key: 'E', why: 'x', evidence: { quote: 'rear初始应该为n-1' } }, ctxG).ok)
t('复述答案被拒', !validateDiagnostic({ key: 'A', why: '正确答案是 B，所以 A 不对', evidence: { quote: 'rear初始应该为n-1' } }, ctxG).ok)
t('空话（概念不清）被拒', !validateDiagnostic({ key: 'A', why: '概念不清，需要加强', evidence: { quote: 'rear初始应该为n-1' } }, ctxG).ok)
t('空话（粗心）被拒', !validateDiagnostic({ key: 'A', probe: '是不是有点粗心？', }, ctxP).ok)
t(`超长（> ${MAX_DIAG_LEN} 字）被拒`, !validateDiagnostic({ key: 'A', why: '啊'.repeat(MAX_DIAG_LEN + 1), evidence: { quote: 'rear初始应该为n-1' } }, ctxG).ok)
t('恰好上限长度通过', validateDiagnostic({ key: 'A', why: '啊'.repeat(MAX_DIAG_LEN), evidence: { quote: 'rear初始应该为n-1' } }, ctxG).ok)

// --- trap 引用 ---
const trapOk = validateDiagnostic({ key: 'A', why: '把队尾指针当成末尾元素的后一位', evidence: { quote: 'rear初始应该为n-1' }, trap: 'T-1' }, ctxG)
t('trap 存在于陷阱库 → 保留', trapOk.ok && trapOk.cleaned.trap === 'T-1')
const trapGhost = validateDiagnostic({ key: 'A', why: '把队尾指针当成末尾元素的后一位', evidence: { quote: 'rear初始应该为n-1' }, trap: 'T-NOT-EXIST' }, ctxG)
t('trap 不存在 → 剥除引用但保留正文', trapGhost.ok && trapGhost.cleaned.trap === undefined)
t('trap 剥除时给出 warning', trapGhost.warnings.some((w) => w.includes('T-NOT-EXIST')))

// --- 真实脏题上一体化验证：2023-11 的解析不可用，任何结论都必须被挡下 ---
group('C-2 · 真实脏题（2023-11）端到端')
const tryConclusion = validateDiagnostic(
  { key: 'A', why: '枢轴是最右侧元素', evidence: { quote: '每条指令平均需要' } },
  { qid: '2023-11', answerKeys: ['D'], explanationText: a2311.cleanText, explanationUsable: a2311.usable, trapLibrary: {} }
)
t('2023-11 上给结论会被挡下（解析不可信）', !tryConclusion.ok, tryConclusion.errors.join(';'))
const tryProbe = validateDiagnostic(
  { key: 'A', probe: '先确认「枢轴最终位置」这一性质：划分结束后枢轴左小右大，题目给的序列里哪个位置具备该性质？' },
  { qid: '2023-11', answerKeys: ['D'], explanationText: a2311.cleanText, explanationUsable: a2311.usable, trapLibrary: {} }
)
t('2023-11 上给提问式引导可以放行', tryProbe.ok, tryProbe.errors.join(';'))

// --- 证据强度两级：多数解析只论证了正确项，对干扰项只能给「判定标准」而非「结论」 ---
group('C-3 · 证据强度两级（conclusion / criterion）')
const gConclusion = validateDiagnostic(
  { key: 'A', why: '把队尾指针当成末尾元素的后一位', evidence: { quote: 'rear初始应该为n-1', kind: 'conclusion' } }, ctxG)
t('kind=conclusion → 通过', gConclusion.ok, gConclusion.errors.join(';'))
t('kind=conclusion 透传到输出', gConclusion.cleaned.evidence.kind === 'conclusion')
t('kind 缺省按 conclusion 处理', validateDiagnostic(
  { key: 'A', why: '把队尾指针当成末尾元素的后一位', evidence: { quote: 'rear初始应该为n-1' } }, ctxG).cleaned.evidence.kind === 'conclusion')

const gCriterion = validateDiagnostic(
  { key: 'A', why: '按解析给的判据逐项比对，A 描述与该判据不符', evidence: { quote: 'front不变，rear+1', kind: 'criterion' } }, ctxG)
t('kind=criterion → 通过（引用依旧必须逐字命中）', gCriterion.ok, gCriterion.errors.join(';'))
t('kind=criterion 透传到输出', gCriterion.cleaned.evidence.kind === 'criterion')

t('criterion 也不能编造引用', !validateDiagnostic(
  { key: 'A', why: '按判据推导', evidence: { quote: 'front会加1，rear不变', kind: 'criterion' } }, ctxG).ok)
t('kind 非法值被拒（不许自创强度）', !validateDiagnostic(
  { key: 'A', why: '按判据推导', evidence: { quote: 'rear初始应该为n-1', kind: 'guess' } }, ctxG).ok)
t('单条校验回传 evidenceKind 供上层分账', gCriterion.evidenceKind === 'criterion' && gConclusion.evidenceKind === 'conclusion')
t('路径P 的 evidenceKind 为 null', okP.evidenceKind === null)

// ============================================================
// D 组 · 分片校验
// ============================================================
group('D · 分片校验 validateShard')
const sampleBank = {
  '2023-11': q2311,
  '2014-03': ds.find((q) => q.id === '2014-03'),   // 注意：2014-03 的正确答案是 A
}
const shard = {
  items: {
    // 无可信解析（2023-11 的解析被判 answer-conflict）→ 只允许提问式
    '2023-11': {
      A: { probe: '先看划分后枢轴左侧是否都小于它、右侧是否都大于它？' },
      B: { why: '因为枢轴一定是最右元素，所以排除' },
    },
    // 可锚定 → 必须带逐字证据；正确项 A 不得出现诊断
    '2014-03': {
      B: { why: '把队满条件里的取模基数搞错了', evidence: { quote: 'end2 指向队尾元素的后一个位置' } },
      C: { why: '正确答案是 A，所以 C 不对', evidence: { quote: 'end1 指向队头元素' } },
      D: { why: '照解析给出的队尾指向判据逐条比对，D 与该判据不符', evidence: { quote: 'end1 指向队头元素', kind: 'criterion' } },
    },
    'no-such-qid': { A: { probe: '先看题意？' } },
  },
}
const vs = validateShard(shard, sampleBank, { trapLibrary: {} })
t('统计到 5 条（孤儿题不计入）', vs.stats.total === 5, `实际 ${vs.stats.total}`)
t('孤儿诊断（题目不存在）被捕获', vs.failures.some((f) => f.qid === 'no-such-qid'))
t('不可信解析上的结论条目被挡下（2023-11/B）', vs.failures.some((f) => f.qid === '2023-11' && f.key === 'B'))
t('可锚定题上的合法条目被保留（2014-03/B）', !!vs.items['2014-03']?.B)
t('复述答案的条目被挡下（2014-03/C）', vs.failures.some((f) => f.qid === '2014-03' && f.key === 'C'))
t('通过率被正确统计', vs.stats.passRate > 0 && vs.stats.passRate < 1, String(vs.stats.passRate))
t('grounded / probe 计数分开统计', vs.stats.probe >= 1 && vs.stats.grounded >= 1,
  `grounded=${vs.stats.grounded} probe=${vs.stats.probe}`)
t('conclusion / criterion 计数分开统计', vs.stats.conclusion === 1 && vs.stats.criterion === 1,
  `conclusion=${vs.stats.conclusion} criterion=${vs.stats.criterion}`)
t('criterion 条目进人工优先抽检名单', vs.needsReview.some((r) => r.qid === '2014-03' && r.key === 'D' && r.kind === 'criterion'))
t('probe 条目进人工优先抽检名单', vs.needsReview.some((r) => r.qid === '2023-11' && r.key === 'A' && r.kind === 'probe'))
t('conclusion 条目不进抽检名单（引用即结论，无需人工）', !vs.needsReview.some((r) => r.qid === '2014-03' && r.key === 'B'))

// ============================================================
// E 组 · 工具函数
// ============================================================
group('E · 工具函数')
t('hashInput 对相同输入稳定', hashInput('a', 'b') === hashInput('a', 'b'))
t('hashInput 对变更敏感', hashInput('a', 'b') !== hashInput('a', 'c'))
t('parseJsonLoose 解析裸 JSON', parseJsonLoose('{"a":1}')?.a === 1)
t('parseJsonLoose 解析 ```json 围栏', parseJsonLoose('好的：\n```json\n{"a":2}\n```\n以上')?.a === 2)
t('parseJsonLoose 解析前后夹带说明', parseJsonLoose('结果如下 {"a":3} 完毕')?.a === 3)
t('parseJsonLoose 对无效输入返回 null', parseJsonLoose('完全不是 JSON') === null)
t('stripWatermarks 返回被剥片段', stripWatermarks('正文N诺考研结尾').removed.length === 1)

// ============================================================
// 汇总
// ============================================================
lines.push('')
lines.push(`RESULT: ${pass} pass / ${fail} fail`)
const report = lines.join('\n')
fs.writeFileSync(fileURLToPath(REPORT_URL), report, 'utf8')
// 另写一份纯 ASCII 日志：Windows 上 PowerShell 重定向默认 UTF-16，
// 直接 > 出来的日志会被判定为二进制而无法读取，这里绕开终端编码问题。
fs.writeFileSync(
  fileURLToPath(new URL('../.ai-guide-test-ascii.log', import.meta.url)),
  report.replace(/\u2713/g, 'OK  ').replace(/\u2717/g, 'FAIL').replace(/\u2192/g, '->'),
  'utf8',
)

console.log(report.split('\n').filter((l) => l.startsWith('  \u2717') || l.startsWith('###') || l.startsWith('RESULT')).join('\n'))
console.log(`\n报告：${fileURLToPath(REPORT_URL)}`)
process.exit(fail === 0 ? 0 : 1)
