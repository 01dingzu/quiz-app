// 答对题归档功能回归测试：打包真实源码（quizStore），验证
//  - isArchivedAttempt 归档判定各分支（做对无srs→归档 / 答错→否 / srs未毕业→否 / 已毕业→归档）
//  - startSession 自由练习过滤已归档题
//  - unarchiveQuestion / rearchiveQuestion 覆盖列表生效
//  - practiceCount / archivedCount / archivedQuestions
//  - 模拟考试 buildExam 不过滤（保持完整题库）
//  - persist partialize 包含 unarchived（不丢数据）
// 运行：node --experimental-strip-types scripts/verify-archive.mts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function bundle(entry: string, out: string) {
  buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: out,
    define: { 'import.meta.env.DEV': 'false' },
    logLevel: 'silent',
  })
}

const outStore = path.join(__dirname, '.archive-store.cjs')
bundle(path.join(root, 'src', 'store', 'quizStore.ts'), outStore)

// zustand persist 需要 localStorage（node 无）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const require = createRequire(import.meta.url)
const storeMod = require(outStore)
const {
  useQuiz,
  BANK,
  isArchivedAttempt,
  isArchivedQuestion,
  archivedCount,
  archivedQuestions,
  practiceCount,
} = storeMod
const { getState, setState } = useQuiz

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} — ${JSON.stringify(detail)}`)
  }
}

const q = (id: string) => BANK.find((x: { id: string }) => x.id === id)!
const mk = (qid: string, correct: boolean, srs?: unknown) => ({
  qid,
  year: q(qid).year,
  no: q(qid).no,
  subject: q(qid).subject,
  picked: 'A',
  correct,
  flagged: null,
  ts: Date.now(),
  srs,
})
const srsActive = { easeFactor: 2.5, interval: 1, reps: 1, nextReview: Date.now(), graduated: false }
const srsGraduated = { easeFactor: 2.5, interval: 30, reps: 5, nextReview: Date.now(), graduated: true }

console.log('\n[1] 归档判定 isArchivedAttempt')
check('无作答记录 → 不归档', isArchivedAttempt(undefined) === false)
check('最近答错 → 不归档', isArchivedAttempt(mk('2009-01', false)) === false)
check('答对且无 SRS（从没错过/未收藏）→ 归档', isArchivedAttempt(mk('2009-01', true)) === true)
check('答对但 SRS 未毕业（仍在复习队列）→ 不归档', isArchivedAttempt(mk('2009-01', true, srsActive)) === false)
check('答对且 SRS 已毕业 → 归档', isArchivedAttempt(mk('2009-01', true, srsGraduated)) === true)

console.log('\n[2] 自由练习过滤已归档题')
setState({
  filter: { years: [2009], subjects: [], shuffle: false },
  session: null,
  index: 0,
  picked: {},
  attempts: {
    '2009-01': mk('2009-01', true), // 答对无 srs → 归档
    '2009-02': mk('2009-02', true, srsActive), // 曾错过复习中 → 不归档
    '2009-03': mk('2009-03', false), // 最近答错 → 不归档
  },
  unarchived: [],
})
const year2009Total = BANK.filter((x) => x.year === 2009).length
useQuiz.getState().startSession()
const s1 = getState().session!
check('startSession 不含已归档题（2009-01）', !s1.includes('2009-01'), s1)
check('startSession 保留复习中/答错题（2009-02/03）', s1.includes('2009-02') && s1.includes('2009-03'), s1)
check('startSession 数量 = 2009 总数 - 1 道归档', s1.length === year2009Total - 1, { s1: s1.length, year2009Total })

console.log('\n[3] unarchived 覆盖（移出/重新归档）')
useQuiz.getState().unarchiveQuestion('2009-01')
check('unarchiveQuestion 后 isArchivedQuestion=false', isArchivedQuestion('2009-01') === false)
useQuiz.getState().startSession()
check('移出归档后重新出现在练习', getState().session!.includes('2009-01'), getState().session)
useQuiz.getState().unarchiveQuestion('2009-01')
check('重复移出去重（仍 1 条）', getState().unarchived.length === 1, getState().unarchived)
useQuiz.getState().unarchiveQuestion('no-such-id')
check('无效 qid 忽略', getState().unarchived.length === 1, getState().unarchived)
useQuiz.getState().rearchiveQuestion('2009-01')
useQuiz.getState().startSession()
check('重新归档后再次隐藏', !getState().session!.includes('2009-01'), getState().session)

console.log('\n[4] 派生计数与排序')
setState({ unarchived: [] })
check('archivedCount = 1（2009-01）', archivedCount() === 1, archivedCount())
const aq = archivedQuestions()
check(
  'archivedQuestions 排序（年份倒序、同年题号升序）',
  aq.every((x, i) => i === 0 || aq[i - 1].year > x.year || (aq[i - 1].year === x.year && aq[i - 1].no <= x.no)),
  aq.map((x) => x.id),
)
check('archivedQuestions 仅含归档题', aq.length === 1 && aq[0].id === '2009-01', aq.map((x) => x.id))
setState({ unarchived: ['2009-01'] })
check('unarchived 排除后 archivedCount = 0', archivedCount() === 0, archivedCount())
check('practiceCount 同步为 2009 全量', practiceCount(getState().filter) === year2009Total, practiceCount(getState().filter))
setState({ unarchived: [] })

console.log('\n[5] 模拟考试不过滤归档题')
const all2009 = BANK.filter((x) => x.year === 2009)
const attsAll: Record<string, unknown> = {}
for (const x of all2009) attsAll[x.id] = mk(x.id, true) // 2009 全部答对 → 全部归档
setState({ attempts: attsAll, unarchived: [] })
useQuiz.getState().startExam({ counts: {
  数据结构: 11,
  计算机组成原理: 11,
  操作系统: 10,
  计算机网络: 8,
}, durationMin: 0 })
const ses = getState().session!
check('2009 全部归档后考试会话仍可启动（不过滤）', ses.length > 0, ses.length)
check('考试会话中的题全部来自归档池（未过滤）', ses.every((id) => isArchivedAttempt(attsAll[id])), ses)
check('同 filter（2009）下自由练习题数 = 0（全部归档被过滤）', practiceCount(getState().filter) === 0, practiceCount(getState().filter))

console.log('\n[6] 持久化 partialize')
setState({ unarchived: ['2009-02'] })
const partial = useQuiz.persist.getOptions().partialize(getState())
check('partialize 包含 unarchived', Array.isArray(partial.unarchived) && partial.unarchived.includes('2009-02'), partial.unarchived)
check('旧字段不丢（attempts/history/skipped/imgReports）', !!partial.attempts && Array.isArray(partial.history) && Array.isArray(partial.skipped) && Array.isArray(partial.imgReports), Object.keys(partial))

// 清理打包产物
try {
  const fs = await import('node:fs')
  fs.unlinkSync(outStore)
} catch {
  /* ignore */
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
if (fail > 0) process.exit(1)
