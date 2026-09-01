// SRS 逻辑端到端验证：esbuild 打包真实 quizStore.ts，在 Node 中跑完整复习场景
// 运行: node .verify/srs-verify.mjs （cwd = quiz-app）
import { buildSync } from 'esbuild'
import { createRequire } from 'module'
import { unlinkSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outfile = path.join(__dirname, 'srs-bundle.cjs')
buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'store', 'quizStore.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile,
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'silent',
})
// types.ts 单独打包（避免 tree-shake 掉 sm2Update）
const typesFile = path.join(__dirname, 'types-bundle.cjs')
buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'types.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: typesFile,
  logLevel: 'silent',
})

// zustand persist 需要 localStorage（node 无）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const require = createRequire(import.meta.url)
const mod = require(outfile)
const { sm2Update } = require(typesFile)
const { useQuiz, BANK, dueIds, dueCount } = mod
const ONE_DAY = 24 * 60 * 60 * 1000

let pass = 0, fail = 0
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

// 清空持久化，从干净状态开始
localStorage.removeItem('quiz-app:v1')
useQuiz.persist.rehydrate()
const st = () => useQuiz.getState()

const q = BANK.find((x) => x.subject === '数据结构') ?? BANK[0]
const qid = q.id
const wrongKey = (['A', 'B', 'C', 'D']).find((k) => k !== q.answer)
console.log(`\n测试题: ${q.year}-${String(q.no).padStart(2, '0')}  答案=${q.answer}  题库总数=${BANK.length}`)

// ===== 场景 A：首次答错 → SRS 启动 + 立即进复习队列 =====
console.log('\n[场景 A] 首次答错')
st().pick(qid, wrongKey)
{
  const rec = st().attempts[qid]
  assert('correct=false', rec?.correct === false)
  assert('srs 已启动', !!rec?.srs)
  assert('reps=0', rec?.srs?.reps === 0, JSON.stringify(rec?.srs))
  assert('interval=1', rec?.srs?.interval === 1)
  assert('dueCount=1（错题立即进队列）', dueCount(st().attempts, st().flagged) === 1)
  assert('dueIds 含本题', dueIds(st().attempts, st().flagged).includes(qid))
}

// ===== 场景 B：错题答对 → trackSrs 修复验证（reps+1 / interval 更新） =====
console.log('\n[场景 B] 错题答对（trackSrs 修复点）')
st().clearSession() // 清会话内 picked，允许再次 pick
st().pick(qid, q.answer)
{
  const rec = st().attempts[qid]
  assert('correct=true', rec?.correct === true)
  assert('srs 仍在追踪（修复点）', !!rec?.srs, JSON.stringify(rec?.srs))
  assert('reps=1', rec?.srs?.reps === 1, JSON.stringify(rec?.srs))
  assert('interval=1（首次答对 1 天）', rec?.srs?.interval === 1)
  assert('未毕业', rec?.srs?.graduated === false)
  assert('dueCount=0（未收藏，答对后移出队列）', dueCount(st().attempts, st().flagged) === 0)
}

// ===== 场景 C：收藏题按 SM-2 节奏复习 =====
console.log('\n[场景 C] 收藏题 SRS 节奏')
st().toggleFlag(qid)
{
  const now = Date.now()
  const rec = st().attempts[qid]
  assert('flagged=true', st().flagged[qid] === true)
  assert('现在不在队列（明天复习）', !dueIds(st().attempts, st().flagged, now).includes(qid))
  assert('明天到期后进队列', dueIds(st().attempts, st().flagged, now + 2 * ONE_DAY).includes(qid))
  // 第二天答对
  st().clearSession()
  st().pick(qid, q.answer)
  const rec2 = st().attempts[qid]
  assert('reps=2', rec2?.srs?.reps === 2, JSON.stringify(rec2?.srs))
  assert('interval=3（第 2 次答对）', rec2?.srs?.interval === 3)
  assert('easeFactor=2.5（答错2.3→答对2次 2.5）', Math.abs((rec2?.srs?.easeFactor ?? 0) - 2.5) < 1e-9, String(rec2?.srs?.easeFactor))
}

// ===== 场景 D：连续答对至毕业 =====
console.log('\n[场景 D] 连续答对 → 毕业')
{
  let srs = null
  const steps = [
    [1, 1], [2, 3], [3, 8], [4, 22], [5, 64],
  ]
  for (const [rep, iv] of steps) {
    srs = sm2Update(srs, true, Date.now())
    assert(`第 ${rep} 次答对 → reps=${rep}, interval=${iv}`, srs.reps === rep && srs.interval === iv, JSON.stringify(srs))
  }
  assert('毕业（reps>=5 且 interval>=21）', srs.graduated === true, JSON.stringify(srs))
  // 毕业后退队列
  const rec = { qid, year: q.year, no: q.no, subject: q.subject, picked: 'A', correct: true, flagged: true, ts: Date.now(), srs }
  const attempts = { ...st().attempts, [qid]: rec }
  assert('毕业后不进队列', !dueIds(attempts, st().flagged, Date.now() + 100 * ONE_DAY).includes(qid))
}

// ===== 场景 E：答错重置 =====
console.log('\n[场景 E] 答错重置')
{
  let srs = sm2Update(null, true, Date.now()) // reps=1
  srs = sm2Update(srs, true, Date.now())       // reps=2, interval=3
  srs = sm2Update(srs, false, Date.now())      // 答错
  assert('reps=0（重置）', srs.reps === 0, JSON.stringify(srs))
  assert('interval=1', srs.interval === 1)
  assert('easeFactor=2.5（2.5→两答对2.7→-0.2）', Math.abs(srs.easeFactor - 2.5) < 1e-9, String(srs.easeFactor))
}

// ===== 场景 F：未答对且未收藏的新题不应被 SRS 追踪（避免污染） =====
console.log('\n[场景 F] 普通答对不追踪 SRS')
{
  const q2 = BANK.find((x) => x.id !== qid && x.answer) ?? BANK[1]
  st().clearSession()
  st().pick(q2.id, q2.answer)
  const rec = st().attempts[q2.id]
  assert('srs 为 undefined（未污染）', rec?.srs === undefined, JSON.stringify(rec?.srs))
}

console.log(`\n===== 结果: ${pass} 通过, ${fail} 失败 =====`)

// 清理打包产物
for (const f of [outfile, typesFile]) {
  try { unlinkSync(f) } catch { /* ignore */ }
}

process.exit(fail === 0 ? 0 : 1)
