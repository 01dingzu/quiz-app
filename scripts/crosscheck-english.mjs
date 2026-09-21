/**
 * 英语一题库的外部交叉验证
 *
 * 主源（pfoocc/201_204_kaoyan 的 LaTeX）自称「未校对」，所以答案必须拿独立源复核。
 * 这里用 TsekaLuk/Kaoyan-English1-Papers 的 `solutions/*.md`。
 *
 * 三个坑，都在这个脚本里处理掉了：
 *
 * 1) **目录名和标题都会骗人**。实测 `solutions/2024/english1_2024.md` 里装的是 2022 年的
 *    卷子，`solutions/2021/english1_2021.md` 标题写 2021 而正文其实是 2015 年的。
 *    → 年份一律按**正文词表重合度**判定，不信目录名、不信标题。
 *
 * 2) **答案要按词比对，不能按字母**。同一份卷子在不同来源里选项顺序可能不同
 *    （主源的 readme 里就带一个 random_aws.py 专门打乱选项并重算答案）。
 *    只比字母会把「顺序不同」误报成「答案错」，所以比对的是**作答选项的文本**。
 *
 * 3) **残缺选项表会伪装成答案键**。有的文件只剩每题的 A 项（"1. [A] Some / 2. [A] put"），
 *    无脑匹配会把每题都读成 A。→ 连续多题同一个字母的一律丢弃。
 *
 * 用法：node scripts/crosscheck-english.mjs [解析目录] [english.json]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOL = process.argv[2] || process.env.EN_SOL || join(process.env.TEMP || '.', 'en-sol')
const DATA = process.argv[3] || join(root, 'src', 'data', 'english.json')
const REPORT = join(root, 'scripts', '.english-crosscheck.txt')

const log = []
const say = (s = '') => log.push(s)

if (!existsSync(SOL)) {
  process.stdout.write(`SKIP solution dir not found: ${SOL}\n`)
  process.exit(0)
}

const parsed = JSON.parse(readFileSync(DATA, 'utf-8'))
const bank = parsed.questions
const materialsAll = parsed.materials

const byYear = new Map()
for (const q of bank) {
  if (!byYear.has(q.year)) byYear.set(q.year, new Map())
  byYear.get(q.year).set(q.no, q)
}

// ---------------------------------------------------------------
// 文案规范化：只保留小写字母与数字，抹掉标点与空格差异
// ---------------------------------------------------------------
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9']+/g, '')
    .replace(/'/g, '')

// ---------------------------------------------------------------
// 年份判定（按正文词表重合度）
// ---------------------------------------------------------------
const YEAR_VOCAB = (() => {
  const m = new Map()
  const push = (y, s) => {
    if (!m.has(y)) m.set(y, [])
    m.get(y).push(s)
  }
  for (const [id, txt] of Object.entries(materialsAll)) {
    const y = Number(/^en-(\d{4})-/.exec(id)?.[1])
    if (y) push(y, txt)
  }
  for (const q of bank) push(q.year, q.stem + ' ' + Object.values(q.options).join(' '))
  const out = new Map()
  for (const [y, arr] of m) out.set(y, new Set(arr.join(' ').toLowerCase().match(/[a-z]{4,}/g) || []))
  return out
})()

function detectYearByContent(text) {
  const toks = text.toLowerCase().match(/[a-z]{4,}/g) || []
  if (toks.length < 200) return []
  const uniq = [...new Set(toks)]
  const scored = []
  for (const [year, vocab] of YEAR_VOCAB) {
    let hit = 0
    for (const t of uniq) if (vocab.has(t)) hit++
    scored.push({ year, score: hit / uniq.length })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3)
}

// ---------------------------------------------------------------
// 抽取「题号 → { 选项表, 答案字母, 答案词 }」
// ---------------------------------------------------------------
function extract(text) {
  const lines = text.split('\n').map((l) => l.trim())
  const recs = new Map()
  const ensure = (no) => {
    if (!recs.has(no)) recs.set(no, { options: null, letter: null, word: null })
    return recs.get(no)
  }
  const nextNonEmpty = (i) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j]) return lines[j]
    return ''
  }

  /** 从一行里抓 "…[A] xxx [B] yyy [C] zzz [D] www" 形态的选项表 */
  const grabOptions = (line) => {
    const parts = [...line.matchAll(/\[([A-D])\]\s*([^[]*)/g)]
    if (parts.length !== 4) return null
    const o = {}
    for (const p of parts) o[p[1]] = p[2].trim()
    return o
  }

  let curNo = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    const m = /^[#>*\s]*(\d{1,2})\s*[.．、]\s*(.*)$/.exec(line)
    if (m) {
      const no = Number(m[1])
      curNo = no >= 1 && no <= 40 ? no : null
      if (!curNo) continue
      const rest = m[2]
      const rec = ensure(curNo)

      const opts = grabOptions(line)
      if (opts) rec.options = opts

      // "21.【答案】[A] maintaining …"
      const ex = /^【答案】\s*\[([A-D])\]\s*(.*)$/.exec(rest)
      if (ex) {
        rec.letter = ex[1]
        rec.word = ex[2].trim()
        continue
      }
      // "1. [A] coined"（汇总块：只有一个 [X]，且下一行不是 [B] 开头的续行）
      const br = line.match(/\[[A-D]\]/g) || []
      if (br.length === 1 && !nextNonEmpty(i).startsWith('[B]')) {
        const one = /\[([A-D])\]\s*(.*)$/.exec(line)
        rec.letter = one[1]
        rec.word = one[2].trim()
      }
      continue
    }

    // 独立的 "【答案】[D] what"，挂到上一个题号
    const ans = /^【答案】\s*\[([A-D])\]\s*(.*)$/.exec(line)
    if (ans && curNo) {
      const rec = ensure(curNo)
      rec.letter = ans[1]
      rec.word = ans[2].trim()
    }
  }
  return recs
}

/** 丢弃「连续多题同一字母」的伪答案键（实为只剩 A 项的残缺选项表） */
function pruneFakeKeys(recs) {
  const letters = [...recs.values()].filter((r) => r.letter).map((r) => r.letter)
  if (letters.length >= 3 && new Set(letters).size === 1) {
    let n = 0
    for (const r of recs.values()) {
      if (r.letter) {
        r.letter = null
        r.word = null
        n++
      }
    }
    return n
  }
  return 0
}

// ---------------------------------------------------------------
// 比对
// ---------------------------------------------------------------
let totalChecked = 0
let totalMismatch = 0
let totalOrderOnly = 0

for (const f of readdirSync(SOL).filter((x) => x.endsWith('.md')).sort()) {
  const text = readFileSync(join(SOL, f), 'utf-8')
  const headerYear = /((?:19|20)\d{2})\s*年/.exec(text.split('\n').slice(0, 5).join('\n'))?.[1]
  const ranked = detectYearByContent(text)
  const year = ranked[0]?.year ?? (headerYear ? Number(headerYear) : null)
  const recs = extract(text)
  const dropped = pruneFakeKeys(recs)
  const usable = [...recs.entries()].filter(([, r]) => r.letter)

  say(`${f}`)
  say(`  标题年=${headerYear ?? '?'}  内容年=${ranked.map((r) => `${r.year}:${(r.score * 100).toFixed(1)}%`).join(' ')}`)
  if (headerYear && year && Number(headerYear) !== year) {
    say(`  ⚠ 标题与内容不符 —— 按内容年份 ${year} 比对`)
  }
  if (dropped) say(`  丢弃 ${dropped} 条「全是同一字母」的伪答案键（残缺选项表）`)

  if (year == null || usable.length === 0) {
    say('  跳过（无可用答案键）')
    continue
  }
  const ours = byYear.get(year)
  if (!ours) {
    say(`  跳过（题库无 ${year} 年）`)
    continue
  }

  const wrong = []
  const orderOnly = []
  let hit = 0
  let compared = 0
  for (const [no, r] of usable.sort((a, b) => a[0] - b[0])) {
    const q = ours.get(no)
    if (!q) continue
    compared++
    const ourWord = norm(q.options[q.answer])
    // 外部答案词：优先用选项表把它还原出来，否则用行内自带的那段文本
    const extWord = norm(r.options?.[r.letter] ?? r.word ?? '')
    if (!extWord) continue
    // 主源的答案文本可能只截取了前几个词，做双向前缀包含判定
    const same =
      ourWord === extWord ||
      (ourWord.length > 3 && extWord.length > 3 && (ourWord.startsWith(extWord) || extWord.startsWith(ourWord)))
    if (same) {
      hit++
      if (r.letter !== q.answer) orderOnly.push(`第 ${no} 题：答案词一致（${q.options[q.answer]}），但选项序号不同（我们 ${q.answer} / 外部 ${r.letter}）`)
    } else {
      wrong.push(`第 ${no} 题 我们=${q.answer}「${q.options[q.answer]}」 外部=${r.letter}「${r.options?.[r.letter] ?? r.word}」`)
    }
  }
  totalChecked += compared
  totalMismatch += wrong.length
  totalOrderOnly += orderOnly.length
  say(`  比对 ${compared} 题：答案一致 ${hit}（其中仅选项序号不同 ${orderOnly.length}）、不一致 ${wrong.length}`)
  for (const w of orderOnly.slice(0, 6)) say(`    ~ ${w}`)
  for (const w of wrong) say(`    ✗ ${w}`)
}

say()
say(`合计比对 ${totalChecked} 题；答案文本不一致 ${totalMismatch} 题；仅选项序号不同 ${totalOrderOnly} 题`)
writeFileSync(REPORT, log.join('\n') + '\n', 'utf-8')

const ok = totalMismatch === 0 && totalChecked > 0
process.stdout.write(`RESULT checked=${totalChecked} mismatch=${totalMismatch} orderOnly=${totalOrderOnly} report=${REPORT}\n`)
process.exit(ok ? 0 : 1)
