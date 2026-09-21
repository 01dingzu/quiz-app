// 富文本解析回归测试：打包真实源码（richText + quizStore），验证
//  - 快速路径判定（纯文本不进入管线）
//  - $公式$ / $$块级$$ / 转义 \$ / 空公式 / 超长公式 的切分
//  - Markdown 图片识别与协议白名单（只收 http/https）
//  - <table> 识别与行列解析（含表格内的公式保留）
//  - 全题库扫描：所有 ![]() 与 <table> 都必须被解析出来（防漏解析）
// 运行：node scripts/verify-tex.mts
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

const outRich = path.join(__dirname, '.tex-rich.cjs')
const outStore = path.join(__dirname, '.tex-store.cjs')
bundle(path.join(root, 'src', 'lib', 'richText.ts'), outRich)
bundle(path.join(root, 'src', 'store', 'quizStore.ts'), outStore)

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const require = createRequire(import.meta.url)
const { needsRich, parseRich, stripTags, tableToRows } = require(outRich)
const { BANK } = require(outStore)

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

const kinds = (toks: { k: string }[]) => toks.map((t) => t.k).join(',')

// ---------------- [1] 快速路径 ----------------
console.log('\n[1] 快速路径判定')
check('纯文本不进管线', !needsRich('下列关于图的叙述中，正确的是'))
check('含 $公式$ 进管线', needsRich('求 $A^2$ 的值'))
check('含 Markdown 图片进管线', needsRich('见下图 ![](https://a/b.jpg)'))
check('含 <table> 进管线', needsRich('<table><tr><td>1</td></tr></table>'))
check('空串不进管线', !needsRich(''))

// ---------------- [2] 公式切分 ----------------
console.log('\n[2] 公式切分')
check('行内公式', kinds(parseRich('求 $A^2$ 的值')) === 'text,math,text', parseRich('求 $A^2$ 的值'))
const blk = parseRich('$$x+y$$')
check('块级公式标记 block', blk.length === 1 && blk[0].k === 'math' && blk[0].block === true, blk)
check(
  '转义 \\$ 当字面量',
  parseRich('价格 \\$100').map((t) => t.v).join('') === '价格 $100',
  parseRich('价格 \\$100'),
)
check('未闭合 $ 当字面量', kinds(parseRich('$未闭合')) === 'text', parseRich('$未闭合'))
const long = '$' + 'x'.repeat(700) + '$'
check('超长跨度(>600)不当作公式', kinds(parseRich(long)) === 'text', kinds(parseRich(long)))
check('公式内保留原始内容', parseRich('$\\mathbf{A}^2$')[0].v === '\\mathbf{A}^2')

// ---------------- [3] 图片识别 ----------------
console.log('\n[3] Markdown 图片')
const withImg = parseRich('已知图 G 如下图所示。\n\n![](https://408.foreverlink.love/images/a.jpg)\n\n请回答：')
const imgTok = withImg.find((t: { k: string }) => t.k === 'img')
check('识别出 img token', !!imgTok)
check('图片 URL 正确', imgTok?.v === 'https://408.foreverlink.love/images/a.jpg', imgTok?.v)
check('图片 alt 缺省为空串', imgTok?.alt === '')
check(
  '图片前后的文字都保留',
  withImg.filter((t: { k: string }) => t.k === 'text').map((t: { v: string }) => t.v).join('').includes('请回答'),
)
check('data: 协议不识别为图片', !parseRich('![](data:image/png;base64,AAAA)').some((t: { k: string }) => t.k === 'img'))
check(
  'javascript: 协议不识别为图片',
  !parseRich('![x](javascript:alert)').some((t: { k: string }) => t.k === 'img'),
)
check(
  '带 title 的图片能识别',
  parseRich('![](https://a/b.jpg "题图")')[0].v === 'https://a/b.jpg',
  parseRich('![](https://a/b.jpg "题图")'),
)

// ---------------- [4] 表格识别 ----------------
console.log('\n[4] HTML 表格')
const tbl = parseRich('页表内容如下表所示：<table><tr><td>页号</td><td>块号</td></tr></table>')
const tblTok = tbl.find((t: { k: string }) => t.k === 'table')
check('识别出 table token', !!tblTok)
check('表格前文字保留', tbl[0].v.includes('页表内容如下表所示'))
const parsed = tableToRows(tblTok!.v)
check('解析出 1 行 2 列', parsed.rows.length === 1 && parsed.rows[0].length === 2, parsed.rows)
check('单元格文本正确', parsed.rows[0][0].text === '页号' && parsed.rows[0][1].text === '块号', parsed.rows[0])
const thTbl = tableToRows('<table><tr><th>A</th><td>B</td></tr></table>')
check('th/td 区分正确', thTbl.rows[0][0].th === true && thTbl.rows[0][1].th === false, thTbl.rows[0])
const capTbl = tableToRows('<caption>表 1</caption><tr><td>x</td></tr>')
check('caption 解析正确', capTbl.caption === '表 1' && capTbl.rows[0][0].text === 'x', capTbl)
check(
  '表格内 $公式$ 原样保留给渲染层',
  tableToRows('<tr><td>$x^2$</td></tr>').rows[0][0].text === '$x^2$',
  tableToRows('<tr><td>$x^2$</td></tr>').rows[0][0].text,
)
check('stripTags 把 <br> 转成换行', stripTags('a<br>b') === 'a\nb', stripTags('a<br>b'))
check('stripTags 剥离其余标签', stripTags('<b>加粗</b>') === '加粗', stripTags('<b>加粗</b>'))
check('表格含 $ 时整体进管线', needsRich('<table><tr><td>$x$</td></tr></table>'))

// ---------------- [5] 全题库扫描：零漏解析 ----------------
console.log('\n[5] 全题库扫描：![]() 与 <table> 必须全部解析')
const MD_HEAD = /!\[[^\]]*\]\(https?:\/\//gi
const TB_HEAD = /<table\b/gi
let texts = 0
let mdTotal = 0
let tbTotal = 0
let mdMissed: string[] = []
let tbMissed: string[] = []
let richTexts = 0

function scan(id: string, t: unknown) {
  if (typeof t !== 'string' || !t) return
  texts++
  if (!needsRich(t)) return
  richTexts++
  const mdWant = (t.match(MD_HEAD) || []).length
  const tbWant = (t.match(TB_HEAD) || []).length
  if (mdWant === 0 && tbWant === 0) return
  const toks = parseRich(t)
  const mdGot = toks.filter((x: { k: string }) => x.k === 'img').length
  const tbGot = toks.filter((x: { k: string }) => x.k === 'table').length
  mdTotal += mdWant
  tbTotal += tbWant
  if (mdGot !== mdWant) mdMissed.push(`${id}(${mdGot}/${mdWant})`)
  if (tbGot !== tbWant) tbMissed.push(`${id}(${tbGot}/${tbWant})`)
}

for (const q of BANK) {
  scan(q.id, q.stem)
  scan(q.id, q.explanation)
  if (q.type === 'single' || q.type === 'multi') {
    for (const k of ['A', 'B', 'C', 'D']) scan(q.id, q.options[k])
  }
  if (q.type === 'applied') {
    for (const p of q.parts) {
      scan(q.id, p.stem)
      scan(q.id, p.answer)
    }
  }
}

check('扫描到文本段 > 1500', texts > 1500, texts)
check('全库 Markdown 图片全部解析', mdMissed.length === 0, mdMissed.slice(0, 8))
check('全库 <table> 全部解析', tbMissed.length === 0, tbMissed.slice(0, 8))
check('Markdown 图片总数 >= 26', mdTotal >= 26, mdTotal)
check('内嵌表格总数 >= 30', tbTotal >= 30, tbTotal)

try {
  const fs = await import('node:fs')
  fs.unlinkSync(outRich)
  fs.unlinkSync(outStore)
} catch {
  /* ignore */
}

console.log(
  `\n（扫描 ${texts} 个文本段，其中 ${richTexts} 段进富文本管线；图片 ${mdTotal} 处，表格 ${tbTotal} 处）`,
)
console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
if (fail > 0) process.exit(1)
