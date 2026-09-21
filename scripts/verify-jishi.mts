// P2 复试机试模块回归测试
//
// 对象：src/data/jishi.ts（素材库） + src/store/jishiStore.ts（独立持久化状态）
// 重点校验两件事：
//   1. 素材完整性（14 模板 / 错误表 / 手册 / 题单 / 周历 / 院校形态 / 三次确认 都不为空且字段齐全）
//   2. 默写计时的达标判定与最好成绩累积逻辑，以及和主题库 store 的存储隔离
//
// 运行：node --experimental-strip-types scripts/verify-jishi.mts
// 报告写入 scripts/.jishi-report.txt
import path from 'node:path'
import fs from 'node:fs'
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

const outData = path.join(__dirname, '.jishi-data.cjs')
const outStore = path.join(__dirname, '.jishi-store.cjs')
bundle(path.join(root, 'src', 'data', 'jishi.ts'), outData)
bundle(path.join(root, 'src', 'store', 'jishiStore.ts'), outStore)

// zustand persist 需要 localStorage（node 无）
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const require = createRequire(import.meta.url)
const D = require(outData)
const S = require(outStore)

const LINES: string[] = []
const log = (s: unknown) => LINES.push(String(s))

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++
    log(`  ✓ ${name}`)
  } else {
    fail++
    log(`  ✗ ${name} — ${JSON.stringify(detail)}`)
  }
}

log('===== P2 复试机试模块回归 =====\n')

// ---------------------------------------------------------------- [A] 素材
log('[A] 素材完整性')

const tpls = D.JISHI_TEMPLATES as {
  id: string
  no: number
  name: string
  note: string
  layer: 1 | 2 | 3
  minutes: number
  code: string
}[]

check('14 个必默写模板', tpls.length === 14, tpls.length)
check('模板 id 唯一', new Set(tpls.map((t) => t.id)).size === tpls.length)
check('模板名称唯一', new Set(tpls.map((t) => t.name)).size === tpls.length)
check(
  '序号连续 1..14 且与数组顺序一致',
  tpls.every((t, i) => t.no === i + 1),
  tpls.map((t) => t.no),
)
check('三层分层信息齐全', [1, 2, 3].every((l) => D.JISHI_LAYER_INFO[l]?.name && D.JISHI_LAYER_INFO[l]?.share && D.JISHI_LAYER_INFO[l]?.desc))
check('每层都至少有 1 个模板', [1, 2, 3].every((l) => tpls.some((t) => t.layer === l)), {
  1: tpls.filter((t) => t.layer === 1).length,
  2: tpls.filter((t) => t.layer === 2).length,
  3: tpls.filter((t) => t.layer === 3).length,
})
check('layer 取值仅 1 / 2 / 3', tpls.every((t) => [1, 2, 3].includes(t.layer)))
check('每个模板都有翻车点提醒', tpls.every((t) => t.note.trim().length > 5))
check('每个模板都有正数目标用时', tpls.every((t) => Number.isFinite(t.minutes) && t.minutes > 0), tpls.map((t) => t.minutes))
check(
  '每个模板都有可编译形态的代码（含 #include 或函数定义 + 分号）',
  tpls.every((t) => t.code.includes(';') && (t.code.includes('#include') || t.code.includes('('))),
)
check('代码里没有未转义的裸换行占位符（$/`）', tpls.every((t) => !/[`]/.test(t.code)))

const errs = D.JISHI_ERRORS as { symptom: string; cause: string; action: string }[]
check('高频错误表 7 条且三字段齐全', errs.length === 7 && errs.every((e) => e.symptom && e.cause && e.action), errs.length)

const phases = D.JISHI_PHASES as { stage: string; time: string; what: string }[]
check('考场手册 5 个阶段且三字段齐全', phases.length === 5 && phases.every((p) => p.stage && p.time && p.what), phases.length)
check('考场手册覆盖 180 分钟（最后阶段含 180）', phases[phases.length - 1].time.includes('180'))
check('铁律 3 条非空', (D.JISHI_IRON_RULES as string[]).length === 3 && (D.JISHI_IRON_RULES as string[]).every((r) => r.trim().length > 8))

const drills = D.JISHI_DRILLS as { id: string; name: string; week: string; target: number; links: { name: string; url: string }[] }[]
check('专题题单 7 组', drills.length === 7, drills.length)
check('题单 id 唯一', new Set(drills.map((d) => d.id)).size === drills.length)
check('每组题单都有正数题量目标', drills.every((d) => Number.isFinite(d.target) && d.target > 0))
check('每组题单至少 1 个外部平台链接', drills.every((d) => d.links.length >= 1))
check(
  '所有链接都是 http(s) 绝对地址（只跳转不抓取）',
  drills.every((d) => d.links.every((l) => /^https?:\/\//.test(l.url))),
  drills.flatMap((d) => d.links.filter((l) => !/^https?:\/\//.test(l.url)).map((l) => l.url)),
)
check('题目总量目标 >= 120 题', drills.reduce((a, d) => a + d.target, 0) >= 120, drills.reduce((a, d) => a + d.target, 0))

const weeks = D.JISHI_WEEKS as { week: string; topic: string; target: string; focus: string }[]
check('12 周节奏 8 行且字段齐全', weeks.length === 8 && weeks.every((w) => w.week && w.topic && w.target && w.focus), weeks.length)
check('周历首行 W1、末行 W12', weeks[0].week === 'W1' && weeks[weeks.length - 1].week === 'W12')

const schools = D.JISHI_SCHOOLS as { tier: string; school: string; detail: string }[]
check('院校形态 12 所', schools.length === 12, schools.length)
check('三档齐全', new Set(schools.map((s) => s.tier)).size === 3, [...new Set(schools.map((s) => s.tier))])
check('每所院校都有具体形态说明', schools.every((s) => s.detail.trim().length > 12))
check(
  '一票否决档含北大 / 厦大 / 矿大（方案 §8 提到的判定依据）',
  ['北京大学', '厦门大学', '中国矿业大学（徐州）'].every((n) => schools.some((s) => s.school === n)),
)

const pre = D.JISHI_PREFLIGHT as { item: string; where: string; why: string }[]
check('考前三次确认齐全且都给了查阅位置与理由', pre.length === 3 && pre.every((p) => p.item && p.where && p.why), pre.length)

// ---------------------------------------------------------------- [B] store
log('\n[B] 独立持久化状态（jishiStore）')

const { useJishi, fmtSec } = S
const { getState, setState } = useJishi
setState({ templates: {}, todos: [] })

check('初始状态为空', Object.keys(getState().templates).length === 0 && getState().todos.length === 0)

// 达标判定：seconds <= minutes*60
getState().recordDrill('tpl-01', 100, 3) // 3 分 = 180 秒，100 秒 → 达标
let a = getState().templates['tpl-01']
check('限时内完成 → lastPass=true', a.lastPass === true, a)
check('首次记录 rounds=1', a.rounds === 1, a)
check('首次记录 bestSec = 本次用时', a.bestSec === 100, a)

getState().recordDrill('tpl-01', 200, 3) // 超时
a = getState().templates['tpl-01']
check('超时完成 → lastPass=false', a.lastPass === false, a)
check('rounds 累加为 2', a.rounds === 2, a)
check('bestSec 记住最好的（100）', a.bestSec === 100, a)
check('lastSec 更新为最近一次（200）', a.lastSec === 200, a)

getState().recordDrill('tpl-01', 60, 3)
a = getState().templates['tpl-01']
check('再刷新最好成绩（100 → 60）', a.bestSec === 60, a)
check('rounds 累加为 3', a.rounds === 3, a)

getState().recordDrill('tpl-02', 180, 3)
check('恰好等于限时 → 达标（边界含等号）', getState().templates['tpl-02'].lastPass === true, getState().templates['tpl-02'])

check('多模板记录互不干扰', Object.keys(getState().templates).length === 2, Object.keys(getState().templates))

getState().clearTemplate('tpl-01')
check('clearTemplate 只删指定模板', !getState().templates['tpl-01'] && !!getState().templates['tpl-02'])

getState().toggleTodo('d1')
getState().toggleTodo('d2')
check('toggleTodo 勾选累积', getState().todos.length === 2 && getState().todos.includes('d1'), getState().todos)
getState().toggleTodo('d1')
check('再点一次取消勾选', !getState().todos.includes('d1') && getState().todos.length === 1, getState().todos)
getState().toggleTodo('d2')
check('反复切换不会产生重复项', getState().todos.length === 0, getState().todos)

getState().resetAll()
check('resetAll 同时清记录与勾选', Object.keys(getState().templates).length === 0 && getState().todos.length === 0)

// 存储隔离
const opts = useJishi.persist.getOptions()
check('存储 key = quiz-app:jishi:v1', opts.name === 'quiz-app:jishi:v1', opts.name)
check('与主题库 key 隔离（互不覆盖）', opts.name !== 'quiz-app:v1', opts.name)

// 可序列化：持久化的必须是纯数据，不能混进函数
getState().recordDrill('tpl-03', 120, 5)
getState().toggleTodo('d3')
const ser = JSON.parse(JSON.stringify(getState())) as Record<string, unknown>
check('持久化内容仅含 templates / todos 两项数据', Object.keys(ser).sort().join(',') === 'templates,todos', Object.keys(ser))
check(
  'templates 为纯数据（无函数值）',
  Object.values(ser.templates as Record<string, Record<string, unknown>>).every((v) =>
    Object.values(v).every((x) => typeof x !== 'function'),
  ),
)

// ---------------------------------------------------------------- [C] 文案
log('\n[C] 用时文案 fmtSec')
check('fmtSec(0) = "0 秒"', fmtSec(0) === '0 秒', fmtSec(0))
check('fmtSec(59) = "59 秒"', fmtSec(59) === '59 秒', fmtSec(59))
check('fmtSec(60) = "1 分 0 秒"', fmtSec(60) === '1 分 0 秒', fmtSec(60))
check('fmtSec(185) = "3 分 5 秒"', fmtSec(185) === '3 分 5 秒', fmtSec(185))

// ---------------------------------------------------------------- 收尾
try {
  fs.unlinkSync(outData)
  fs.unlinkSync(outStore)
} catch {
  /* ignore */
}

const report = [...LINES, '', `===== 结果：${pass} 通过 / ${fail} 失败 =====`].join('\n')
fs.writeFileSync(path.join(__dirname, '.jishi-report.txt'), report, 'utf-8')
console.log(`\nJISHI: ${pass} pass / ${fail} fail -> scripts/.jishi-report.txt`)
if (fail > 0) process.exit(1)
