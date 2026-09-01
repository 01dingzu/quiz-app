// 缺图反馈功能回归测试：打包真实源码（quizStore + missingImg），验证
//  - 缺图检测规则（题干图/表引用命中、图论术语不误报、仅解析命中不误报）
//  - 全题库缺图题数量与排序
//  - reportMissingImg / unreportMissingImg 增删与去重
//  - 手动上报可包含非自动检测题（手动补充）
//  - persist partialize 包含 imgReports（不丢数据）
// 运行：node --experimental-strip-types scripts/verify-missing.mts
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

const outStore = path.join(__dirname, '.missing-store.cjs')
const outDetect = path.join(__dirname, '.missing-detect.cjs')
bundle(path.join(root, 'src', 'store', 'quizStore.ts'), outStore)
bundle(path.join(root, 'src', 'lib', 'missingImg.ts'), outDetect)

// zustand persist 需要 localStorage（node 无）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const require = createRequire(import.meta.url)
const storeMod = require(outStore)
const { useQuiz, BANK, missingImgQuestions, reportedMissingImgQuestions } = storeMod
const detectMod = require(outDetect)
const { isMissingImg, hasImageRef, hasImageAsset } = detectMod
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

console.log('\n[1] 缺图检测规则')
check('2009-03 题干"如右图所示"命中', hasImageRef(q('2009-03')))
check('2011-37 题干"如下图所示"命中', hasImageRef(q('2011-37')))
check('2022-08 题干"下图所示的 5 阶 B 树"命中', hasImageRef(q('2022-08')))
check('2016-01 题干"如下表所示"命中', hasImageRef(q('2016-01')))
check('2024-07 题干"如题 7 图所示"命中', hasImageRef(q('2024-07')))
check('2011-08 图论术语（"下列关于图的叙述"）不误报', !hasImageRef(q('2011-08')))
check('2011-06 仅解析提到图、题干无引用 → 不误报', !hasImageRef(q('2011-06')))
check('2009-01 无图引用不命中', !hasImageRef(q('2009-01')))

const missing = BANK.filter((x) => isMissingImg(x))
check('全题库缺图题 = 30', missing.length === 30, missing.length)
check('缺图题均无图片资源字段', missing.every((x) => !hasImageAsset(x)))
const sorted = missingImgQuestions()
check(
  'missingImgQuestions 按年份倒序、同年题号升序',
  sorted.every((x, i) => i === 0 || sorted[i - 1].year > x.year || (sorted[i - 1].year === x.year && sorted[i - 1].no <= x.no)),
  sorted.map((x) => x.id).slice(0, 6),
)
check('带 image 字段的题不判缺图', !isMissingImg({ ...q('2009-03'), image: 'x.png' } as never))

console.log('\n[2] 上报 / 撤销')
setState({ imgReports: [] })
check('初始 imgReports 为空', getState().imgReports.length === 0, getState().imgReports)
useQuiz.getState().reportMissingImg('2009-03')
check('上报后包含 2009-03', getState().imgReports.includes('2009-03'), getState().imgReports)
useQuiz.getState().reportMissingImg('2009-03')
check('重复上报去重（仍 1 条）', getState().imgReports.length === 1, getState().imgReports)
useQuiz.getState().reportMissingImg('no-such-id')
check('无效 qid 忽略（仍 1 条）', getState().imgReports.length === 1, getState().imgReports)
useQuiz.getState().unreportMissingImg('2009-03')
check('撤销后为空', getState().imgReports.length === 0, getState().imgReports)

console.log('\n[3] 手动上报可包含非自动检测题')
setState({ imgReports: ['2011-37', '2011-08'] }) // 2011-08 是图论术语题，未被自动检测，但可手动上报
const rep = reportedMissingImgQuestions()
check('映射为题目并按年份/题号排序', JSON.stringify(rep.map((x) => x.id)) === JSON.stringify(['2011-08', '2011-37']), rep.map((x) => x.id))

console.log('\n[4] 持久化 partialize')
setState({ imgReports: ['2016-01'] })
const partial = useQuiz.persist.getOptions().partialize(getState())
check('partialize 包含 imgReports', Array.isArray(partial.imgReports) && partial.imgReports.includes('2016-01'), partial.imgReports)
check('旧持久化字段不丢（skipped）', Array.isArray(partial.skipped), partial.skipped)
check('旧持久化字段不丢（attempts/history）', !!partial.attempts && Array.isArray(partial.history), Object.keys(partial))

// 清理打包产物
try {
  const fs = await import('node:fs')
  fs.unlinkSync(outStore)
  fs.unlinkSync(outDetect)
} catch {
  /* ignore */
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
if (fail > 0) process.exit(1)
