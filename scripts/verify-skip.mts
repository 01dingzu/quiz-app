// 跳过题目功能回归测试：打包真实 quizStore 源码，验证
//  - skipCurrent 标记 + 前进
//  - pick 作答后从 skipped 移除
//  - startSession 新会话重排（skipped 排最前）
//  - resumeSession 重排 + 定位第一道未答跳过题
//  - 无跳过题时 resumeSession 完全不动（不破坏位置）
// 运行：node --experimental-strip-types scripts/verify-skip.mts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outfile = path.join(__dirname, '.skip-bundle.cjs')
buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'store', 'quizStore.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile,
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'silent',
})

// zustand persist 需要 localStorage（node 无）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const require = createRequire(import.meta.url)
const mod = require(outfile)
const { useQuiz, BANK } = mod
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

function fresh() {
  setState({
    filter: { years: [], subjects: [], shuffle: false },
    mode: 'practice',
    examRemainSec: 0,
    examStartTs: null,
    session: null,
    index: 0,
    picked: {},
    skipped: [],
    attempts: {},
    flagged: {},
    history: [],
  })
}

// 真实题 id 取前 6 道（BANK 保证存在，pick 才生效）
const ids = BANK.slice(0, 6).map((q: { id: string }) => q.id)
const [q1, q2, q3, q4, q5, q6] = ids

console.log('\n[1] skipCurrent：标记 + 前进')
fresh()
setState({ session: [q1, q2, q3], index: 0 })
useQuiz.getState().skipCurrent()
check('跳过第 1 题后 skipped=[q1]', JSON.stringify(getState().skipped) === JSON.stringify([q1]), getState().skipped)
check('index 前进到 1', getState().index === 1, getState().index)
useQuiz.getState().skipCurrent()
check('再跳一次 skipped=[q1,q2]', JSON.stringify(getState().skipped) === JSON.stringify([q1, q2]), getState().skipped)
check('index 前进到 2', getState().index === 2, getState().index)
useQuiz.getState().skipCurrent()
check('最后一道仍可标记 skipped 含 q3', getState().skipped.includes(q3), getState().skipped)
check('最后一道跳过 index 不越界', getState().index === 2, getState().index)

console.log('\n[2] 已答题不可跳过')
fresh()
setState({ session: [q1, q2], index: 0, picked: { [q1]: 'A' } })
useQuiz.getState().skipCurrent()
check('已答的题跳过无效（skipped 空）', getState().skipped.length === 0, getState().skipped)
check('index 不动', getState().index === 0, getState().index)

console.log('\n[3] pick 作答后自动移除跳过标记')
fresh()
setState({ session: [q1, q2, q3], index: 0, skipped: [q1, q2] })
useQuiz.getState().pick(q1, BANK[0].answer)
check('作答后 skipped 移除 q1', !getState().skipped.includes(q1), getState().skipped)
check('skipped 仍保留 q2', getState().skipped.includes(q2), getState().skipped)

console.log('\n[4] startSession 新会话：skipped 排最前（保持会话原始相对顺序）')
fresh()
setState({ skipped: [q5, q2] })
useQuiz.getState().startSession()
const s1 = getState().session!
check('会话头部为 q2,q5（按题库原顺序）', s1[0] === q2 && s1[1] === q5, s1.slice(0, 4))
check('会话尾部不含 q2/q5', !s1.slice(2).includes(q2) && !s1.slice(2).includes(q5), s1.slice(0, 6))
check('index 归零', getState().index === 0, getState().index)

console.log('\n[5] resumeSession：重排 + 定位第一道未答跳过题')
fresh()
setState({ session: [q1, q2, q3, q4], index: 3, picked: { [q1]: 'A' }, skipped: [q1, q3] })
useQuiz.getState().resumeSession()
check('重排后 = [q1,q3,q2,q4]', JSON.stringify(getState().session) === JSON.stringify([q1, q3, q2, q4]), getState().session)
check('定位到 q3（未答的跳过题）', getState().index === 1, getState().index)

console.log('\n[6] resumeSession：无未答跳过题 → 完全不动')
fresh()
setState({ session: [q1, q2, q3], index: 2, picked: { [q1]: 'A', [q2]: 'A' }, skipped: [q1] })
useQuiz.getState().resumeSession()
check('会话顺序不变', JSON.stringify(getState().session) === JSON.stringify([q1, q2, q3]), getState().session)
check('index 不动（停留在第 3 题）', getState().index === 2, getState().index)

console.log('\n[7] resumeSession：无跳过题 → 完全不动')
fresh()
setState({ session: [q1, q2, q3], index: 1, picked: { [q1]: 'A' }, skipped: [] })
useQuiz.getState().resumeSession()
check('会话顺序不变', JSON.stringify(getState().session) === JSON.stringify([q1, q2, q3]), getState().session)
check('index 不动', getState().index === 1, getState().index)

console.log('\n[8] 跳过题全部答完后再 resume → 不动')
fresh()
setState({ session: [q1, q2, q3], index: 0, picked: { [q1]: 'A', [q2]: 'A', [q3]: 'A' }, skipped: [q2] })
useQuiz.getState().resumeSession()
check('会话顺序不变', JSON.stringify(getState().session) === JSON.stringify([q1, q2, q3]), getState().session)
check('index 不动', getState().index === 0, getState().index)

console.log('\n[9] 默认状态 skipped 为空')
fresh()
check('skipped 初始 []', Array.isArray(getState().skipped) && getState().skipped.length === 0, getState().skipped)

// 清理打包产物
try {
  const fs = await import('node:fs')
  fs.unlinkSync(outfile)
} catch {
  /* ignore */
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
if (fail > 0) process.exit(1)
