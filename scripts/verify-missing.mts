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
const { isMissingImg, hasImageRef, hasImageAsset, FIG_REF_RE, TBL_REF_RE } = detectMod
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

console.log('\n[1] 缺图检测规则（单选）')
check('2009-03 题干"如右图所示"命中', hasImageRef(q('2009-03')))
check('2011-37 题干"如下图所示"命中', hasImageRef(q('2011-37')))
check('2022-08 题干"下图所示的 5 阶 B 树"命中', hasImageRef(q('2022-08')))
check('2016-01 题干"如下表所示"命中', hasImageRef(q('2016-01')))
check('2024-07 题干"如题 7 图所示"命中', hasImageRef(q('2024-07')))
check('2011-08 图论术语（"下列关于图的叙述"）不误报', !hasImageRef(q('2011-08')))
check('2011-06 仅解析提到图、题干无引用 → 不误报', !hasImageRef(q('2011-06')))
check('2009-01 无图引用不命中', !hasImageRef(q('2009-01')))

console.log('\n[1b] 图 / 表引用分别判定')
check('FIG_REF_RE 命中"如下图"、不命中"如下表"', FIG_REF_RE.test('如下图所示') && !FIG_REF_RE.test('如下表所示'))
check('TBL_REF_RE 命中"如下表"、不命中"如下图"', TBL_REF_RE.test('如下表所示') && !TBL_REF_RE.test('如下图所示'))
check('图论术语"有向图中"两类都不命中', !FIG_REF_RE.test('有向图中') && !TBL_REF_RE.test('有向图中'))
check('"如题 47 图所示"命中图引用', FIG_REF_RE.test('如题 47 图所示'))

console.log('\n[1c] 题目自带图/表 → 不判缺')
check('hasImageAsset 认 Markdown 内联图（2015-a42）', hasImageAsset(q('2015-a42')))
check('hasImageAsset 认内嵌 <table>（2009-a46）', hasImageAsset(q('2009-a46')))
check('hasImageAsset 认非空 images[]', hasImageAsset({ ...q('2009-01'), images: ['x.png'] } as never))
check('hasImageAsset 忽略空 images[]', !hasImageAsset({ ...q('2009-01'), images: [] } as never))
check('题干内嵌 Markdown 图片 → 不算缺图（2015-a42）', !isMissingImg(q('2015-a42')))
check('题干内嵌 <table> → 不算缺表（2009-a46）', !isMissingImg(q('2009-a46')))
check('同段"图"引用 + 内嵌表（2012-a44 流水线图即表格）→ 不算缺图', !isMissingImg(q('2012-a44')))
check('小问引用了图、但整题只有表 → 判缺图（2016-a47）', isMissingImg(q('2016-a47')))
check('小问引用图、图片内嵌在题干 → 不判缺（2010-a45）', !isMissingImg(q('2010-a45')))
check('小问 stem 纳入检测范围（2009-a47 题干含图且内嵌图）', !isMissingImg(q('2009-a47')))

console.log('\n[1d] 缺图基线（按试卷分册登记：408 是存量基线，政治/数学一为扩容新增）')
const paperOf = (x: { paper?: string }) => x.paper ?? '408'
const in408 = BANK.filter((x: { paper?: string }) => paperOf(x) === '408')
const missSingle = in408.filter((x: { type: string }) => isMissingImg(x) && x.type === 'single')
const missApplied = in408.filter((x: { type: string }) => isMissingImg(x) && x.type === 'applied')
const missing408 = in408.filter((x) => isMissingImg(x))
check('408 单选题缺图 = 30（存量基线，未回归）', missSingle.length === 30, missSingle.length)
check(
  '408 综合应用题缺图 = 1（仅 2016-a47）',
  missApplied.length === 1 && missApplied[0].id === '2016-a47',
  missApplied.map((x: { id: string }) => x.id),
)
check('408 缺图合计 = 31（存量基线，未回归）', missing408.length === 31, missing408.length)

// 扩容后：数学一也带进来 2 道真的引用了图的题（函数图像 / 空间平面图），
// 政治题干纯文字，无图引用。按册显式登记，避免基线被"稀释"。
const missingNon408 = BANK.filter((x) => isMissingImg(x) && paperOf(x) !== '408')
check(
  '非 408 缺图题全部来自数学一，且恰好是引用函数图像/空间平面图的那 2 道',
  missingNon408.length === 2 &&
    missingNon408.every((x: { paper?: string }) => paperOf(x) === '数学一') &&
    ['math-2015-01', 'math-2019-06'].every((id) => missingNon408.some((x: { id: string }) => x.id === id)),
  missingNon408.map((x: { id: string }) => x.id),
)
check('政治题干无图引用（0 题）', BANK.filter((x) => isMissingImg(x) && paperOf(x) === '政治').length === 0)
check(
  'missingImgQuestions(paper) 分册过滤生效',
  missingImgQuestions('408').length === 31 &&
    missingImgQuestions('政治').length === 0 &&
    missingImgQuestions('数学一').length === 2,
  {
    408: missingImgQuestions('408').length,
    政治: missingImgQuestions('政治').length,
    数学一: missingImgQuestions('数学一').length,
  },
)
// 新题库暴露出的正则误报：'下表' 出现在「坐标下表**示**」里被误判成引用表格
check(
  'TBL_REF_RE 命中"如下表所示"/"下表给出"，不命中"坐标下表示的二次曲面"',
  TBL_REF_RE.test('如下表所示') && TBL_REF_RE.test('下表给出了') && !TBL_REF_RE.test('在空间直角坐标下表示的二次曲面'),
)
check('"坐标下表示" 题型不误报缺表（math-2016-06）', !isMissingImg(q('math-2016-06')))
check('真实引用函数图像的题仍判缺图（math-2015-01 如右图所示）', isMissingImg(q('math-2015-01')))

const missing = BANK.filter((x) => isMissingImg(x))
check('全题库缺图 = 31（408 基线）+ 2（数学一）= 33', missing.length === 33, {
  total: missing.length,
  non408: missingNon408.length,
})
check(
  '缺图题均无结构化图片字段',
  missing.every((x: unknown) => {
    const a = x as Record<string, unknown>
    return !a.image && !a.img && !a.figure && !(Array.isArray(a.images) && a.images.length > 0)
  }),
)
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
