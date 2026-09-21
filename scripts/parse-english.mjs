/**
 * 英语一真题 LaTeX → english.json
 *
 * 源：https://github.com/pfoocc/201_204_kaoyan 的 `201/` 目录（英语一 2005–2023），
 * 文件结构高度规整：
 *   201/<年>/cloze/{articles,options,answer}.tex
 *   201/<年>/read/{articles1-4,options1-4,read1-4,read*_answer}.tex
 * 全语料只用到 8 个 LaTeX 命令（task/end/begin/item/include/uline/newpage/fancyhead），
 * 没有公式、没有自定义宏，所以清洗规则可以写得很紧。
 *
 * 产出：src/data/english.json = { materials, questions }
 *   - materials：共享长文（阅读理解 5 题共用一篇；完形填空 20 空共用一篇），按 id 去重
 *   - questions：单选（完形 20 题/年 + 阅读 20 题/年），带 materialId 指回长文
 *
 * 源目录解析顺序：命令行参数 → $EN_SRC → $TEMP/en-src/201 → 自动稀疏克隆。
 *
 * 用法：node scripts/parse-english.mjs [源目录]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CLOZE_ANSWER_WORDS, READING_ANSWER_FIX } from './english-cloze-key.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'src', 'data', 'english.json')
const REPORT = join(root, 'scripts', '.english-report.txt')

const log = []
const say = (s) => log.push(s)

// ---------------------------------------------------------------
// 源目录
// ---------------------------------------------------------------
function resolveSource() {
  const cands = [
    process.argv[2],
    process.env.EN_SRC,
    process.env.TEMP ? join(process.env.TEMP, 'en-src', '201') : null,
    process.env.TMPDIR ? join(process.env.TMPDIR, 'en-src', '201') : null,
  ].filter(Boolean)
  for (const c of cands) {
    if (existsSync(join(c, '2023', 'cloze', 'articles.tex'))) return c
  }
  // 兜底：稀疏克隆
  const w = join(process.env.TEMP || process.env.TMPDIR || '.', 'en-src')
  say(`源目录不存在，自动稀疏克隆到 ${w}`)
  if (!existsSync(w)) {
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
      'https://github.com/pfoocc/201_204_kaoyan.git', w], { stdio: 'inherit' })
  }
  execFileSync('git', ['-C', w, 'sparse-checkout', 'set', '201'], { stdio: 'inherit' })
  return join(w, '201')
}

const SRC = resolveSource()
say(`源目录：${SRC}`)

const read = (p) => readFileSync(join(SRC, p), 'utf-8')

// ---------------------------------------------------------------
// LaTeX 清洗
//
// 顺序有讲究：
//  1) 先吃 \uline{~~12~~}（完形填空的空位标记）——必须在通用去壳之前，
//     否则内层的 ~~ 会被当成普通文本留下。
//  2) 再吃 \uline{~~~~}（题干里的作答横线）。
//  3) 最后才是通用 \uline{...} 去壳。
// ---------------------------------------------------------------
function cleanTex(s) {
  let t = s
  // 空位标记 → {{N}}（渲染层据此高亮当前空）
  t = t.replace(/\\uline\s*\{\s*~+\s*(\d+)\s*~+\s*\}/g, '{{$1}}')
  // 作答横线 → 下划线串
  t = t.replace(/\\uline\s*\{\s*~+\s*\}/g, '______')
  // 其余下划线去壳
  t = t.replace(/\\uline\s*\{([^{}]*)\}/g, '$1')
  // LaTeX 引号
  t = t.replace(/``/g, '\u201C').replace(/''/g, '\u201D')
  // 破折号（--- 必须在 -- 之前）
  t = t.replace(/---/g, '\u2014').replace(/--/g, '\u2013')
  // 转义字符还原
  t = t.replace(/\\([%&_$#{}])/g, '$1')
  // 兜底：未知命令 \foo{...} → 内容；裸 \foo → 删除
  t = t.replace(/\\[a-zA-Z]+\s*\{([^{}]*)\}/g, '$1')
  t = t.replace(/\\[a-zA-Z]+\b/g, '')
  // 不换行空格
  t = t.replace(/~/g, ' ')
  return t
}

/** 段落化：按行清理，空行分段。源文件里一段就是一行（长行不折行）。 */
function toParagraphs(s) {
  return s
    .split('\n')
    .map((l) => cleanTex(l).replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

// ---------------------------------------------------------------
// 结构化解析
// ---------------------------------------------------------------

/**
 * 解析 options 文件里的 \item 块。
 * 形态：`\item [题干] \begin{tasks}(4) \task A项 \task B项 \task C项 \task D项 \end{tasks}`
 * 完形填空的 \item 后无题干（空在长文里），阅读理解的有。
 *
 * 逐行扫描而不是按 \task 正则抓取 —— 因为源里有两处把选项写成了孤立的
 * `[C]is at odds with its earlier rulings.`（2021 阅读 2 与 4 的第 4 题，
 * 标注 [C] 却漏了 \task）。按下标顺序扫描才能把它插回正确位置（第 3 项），
 * 否则该题只剩 3 个选项、会被归一化层整题剔除。
 */
function parseItemBlocks(text) {
  const blocks = []
  let cur = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^\\item\b/.test(line)) {
      if (cur) blocks.push(cur)
      cur = { stem: cleanTex(line.replace(/^\\item\b/, '')), options: [] }
      continue
    }
    if (!cur) continue
    if (/^\\(begin|end)\{tasks\}/.test(line)) continue
    const t = /^\\task(?![a-zA-Z])(.*)$/.exec(line)
    if (t) {
      cur.options.push(cleanTex(t[1]).replace(/\s+/g, ' ').trim())
      continue
    }
    const b = /^\[([A-D])\]\s*(.*)$/.exec(line)
    if (b) {
      cur.options.push(cleanTex(b[2]).replace(/\s+/g, ' ').trim())
      continue
    }
    // 其余都算题干的续行（源里部分年份题干会折行）
    cur.stem = `${cur.stem} ${cleanTex(line)}`
  }
  if (cur) blocks.push(cur)
  return blocks
    .filter((b) => b.options.length > 0)
    .map((b) => ({
      stem: b.stem.replace(/\s+/g, ' ').trim(),
      options: b.options,
    }))
}

/** 从 \fancyhead[L]{201-2023-read-1-[C,B,A,C,D]} 取尾部方括号里的答案字母 */
function parseAnswerLetters(text, expect) {
  const m = /\[([^\]]*)\]\s*\}\s*$/.exec(text.trim())
  if (!m) throw new Error(`答案格式无法识别：${text.trim().slice(0, 120)}`)
  const letters = m[1].match(/[A-D]/g) || []
  if (letters.length !== expect) {
    throw new Error(`答案个数 ${letters.length} ≠ ${expect}：${text.trim().slice(0, 120)}`)
  }
  return letters
}

/** 选项可用性校验：必须 4 项且都非空（空选项在界面上无从作答，整题剔除） */
function usableOptions(it, label) {
  if (it.options.length !== 4) {
    warns.push(`${label} 选项数 = ${it.options.length}`)
    return null
  }
  const empty = it.options.filter((o) => !o.trim()).length
  if (empty) {
    warns.push(`${label} 有 ${empty} 个空选项`)
    return null
  }
  return it.options
}

// ---------------------------------------------------------------
// 完形填空答案：用权威**词表**反解字母
//
// 主源自称「未校对」，实测 2015/2016 两年的完形答案键大面积错位
// （2015 错 10 空，2016 错 11 空，详见 english-cloze-key.mjs 的头部说明）。
// 所以答案一律以词为准：拿权威词在选项里定位，找到哪个就选哪个字母。
// 这样既修掉了错键，又顺带校验了我们的选项文本 ——
// 如果选项里根本找不到那个词，说明这道题的选项本身就跟官方版本不一致。
// ---------------------------------------------------------------

/** 归一化：只留下小写字母与数字（吃掉大小写、标点、连字符、空格差异） */
const normWord = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * 把权威答案词解析成选项下标（0–3）。
 * 先精确匹配；不中再退化到「前缀包含」，且必须唯一命中（避免 in / in fact 这类误配）。
 * 返回 { idx, how } 或 null。
 */
function resolveWordToOption(options, word) {
  const w = normWord(word)
  if (!w) return null
  const exact = options.findIndex((o) => normWord(o) === w)
  if (exact >= 0) return { idx: exact, how: 'exact' }
  const cand = []
  options.forEach((o, i) => {
    const n = normWord(o)
    if (!n) return
    if (n.startsWith(w) || w.startsWith(n)) cand.push(i)
  })
  return cand.length === 1 ? { idx: cand[0], how: 'prefix' } : null
}

// 2005–2009 暂不纳入：主源答案键不可信，而三种外部判据（TsekaLuk 解析 PDF、
// en-tsu 卷面、新东方等答案页）最早都只覆盖到 2010 年，无法完成交叉验证。
// 待补齐 2005–2009 的第二判据后再放开。
const YEARS = []
for (let y = 2010; y <= 2023; y++) YEARS.push(y)

const materials = {}
const questions = []
const warns = []
const fixes = []  // 「主源字母键 → 权威词表」的更正流水，最后单独成节汇报
const readFixes = []  // 阅读理解按外部解析更正的流水
const fatal = []

for (const year of YEARS) {
  // ---------- 完形填空 ----------
  const cPassage = toParagraphs(read(`${year}/cloze/articles.tex`))
  const blanks = cPassage.match(/\{\{(\d+)\}\}/g) || []
  if (blanks.length !== 20) {
    throw new Error(`${year} 完形填空空位数 = ${blanks.length} ≠ 20`)
  }
  // 空号必须是 1..20 且不重不漏
  const nums = blanks.map((b) => Number(b.replace(/[^\d]/g, '')))
  for (let i = 0; i < 20; i++) {
    if (nums[i] !== i + 1) throw new Error(`${year} 完形填空空号乱序：${nums.join(',')}`)
  }
  const cMat = `en-${year}-cloze-passage`
  materials[cMat] = cPassage

  const cItems = parseItemBlocks(read(`${year}/cloze/options.tex`))
  if (cItems.length !== 20) throw new Error(`${year} 完形填空条目数 = ${cItems.length} ≠ 20`)
  // 主源字母键只管「格式是否规整」，答案本身以权威词表为准（见下）
  const cSrc = parseAnswerLetters(read(`${year}/cloze/answer.tex`), 20)
  const keyWords = CLOZE_ANSWER_WORDS[year]
  if (!keyWords || keyWords.length !== 20) {
    warns.push(`${year} 完形填空缺权威词表，只能沿用主源字母键（不可信）`)
  }

  cItems.forEach((it, i) => {
    const no = i + 1
    const op = usableOptions(it, `${year} 完形填空第 ${no} 空`)
    if (!op) return

    const id = `en-${year}-cloze-${String(no).padStart(2, '0')}`
    const word = keyWords ? keyWords[i] : null
    let answer = cSrc[i]

    if (word) {
      const r = resolveWordToOption(op, word)
      if (!r) {
        fatal.push(`${id} 权威答案词「${word}」不在选项 [${op.join(' / ')}] 中 —— 选项文本疑与官方版本不一致`)
      } else {
        answer = 'ABCD'[r.idx]
        if (answer !== cSrc[i]) fixes.push(`${id} 主源 ${cSrc[i]} → 权威 ${answer}（${word}）`)
        else if (r.how === 'prefix') warns.push(`${id} 答案词「${word}」为前缀匹配命中（选项：${op[r.idx]}），建议人工确认`)
      }
    }

    questions.push({
      id,
      year,
      no,
      paper: '英语一',
      subject: '完形填空',
      type: 'single',
      stem: `第 ${no} 空`,
      materialId: cMat,
      options: { A: op[0], B: op[1], C: op[2], D: op[3] },
      answer,
      explanation: '',
      score: 0.5,
    })
  })

  // ---------- 阅读理解 Part A ----------
  for (let i = 1; i <= 4; i++) {
    const rPassage = toParagraphs(read(`${year}/read/articles${i}.tex`))
    const rMat = `en-${year}-read${i}-passage`
    materials[rMat] = rPassage

    const rItems = parseItemBlocks(read(`${year}/read/options${i}.tex`))
    if (rItems.length !== 5) throw new Error(`${year} 阅读 ${i} 条目数 = ${rItems.length} ≠ 5`)
    const rAns = parseAnswerLetters(read(`${year}/read/read${i}_answer.tex`), 5)

    rItems.forEach((it, qi) => {
      // 题号用真题口径：完形填空占 1–20，阅读理解 Part A 占 21–40。
      // 这样答案表（"21.【答案】[A] …"）能直接对上，题号本身也更贴近考场。
      const no = 20 + (i - 1) * 5 + qi + 1
      const op = usableOptions(it, `${year} 阅读 ${i} 第 ${qi + 1} 题`)
      if (!op) return
      if (!it.stem) {
        warns.push(`${year} 阅读 ${i} 第 ${qi + 1} 题题干为空`)
        return
      }
      const id = `en-${year}-read${i}-${qi + 1}`
      // 主源 read*_answer.tex 在 2012–2017 段错误较多，按外部解析的答案词更正
      const rawAns = rAns[qi]
      const fix = READING_ANSWER_FIX[`${year}-${no}`]
      if (fix && fix !== rawAns) readFixes.push(`${id} 源 ${rawAns} → 权威 ${fix}`)
      questions.push({
        id,
        year,
        no,
        paper: '英语一',
        subject: '阅读理解',
        type: 'single',
        stem: it.stem,
        materialId: rMat,
        options: { A: op[0], B: op[1], C: op[2], D: op[3] },
        answer: fix || rawAns,
        explanation: '',
        score: 2,
      })
    })
  }
}

// ---------------------------------------------------------------
// 自检
// ---------------------------------------------------------------
const byYear = {}
for (const q of questions) byYear[q.year] = (byYear[q.year] || 0) + 1
const expected = YEARS.length * 40
if (questions.length !== expected) {
  fatal.push(`题数 ${questions.length} ≠ 期望 ${expected}（${YEARS.length} 年 × 40）`)
}
const dup = new Set()
for (const q of questions) {
  if (dup.has(q.id)) fatal.push(`重复 id：${q.id}`)
  dup.add(q.id)
}
for (const [id, txt] of Object.entries(materials)) {
  if (!txt || txt.length < 100) fatal.push(`${id} 长文过短（${txt.length}）`)
}

say('')
say(`题数：${questions.length}（完形 ${questions.filter((q) => q.subject === '完形填空').length} + 阅读 ${questions.filter((q) => q.subject === '阅读理解').length}）`)
say(`长文：${Object.keys(materials).length} 篇`)
say(`年份覆盖：${Object.keys(byYear).sort().map((y) => `${y}:${byYear[y]}`).join(' ')}`)
const matLen = Object.values(materials).reduce((a, s) => a + s.length, 0)
say(`长文字符数：${matLen}；题目字符数：${questions.reduce((a, q) => a + q.stem.length + Object.values(q.options).reduce((x, y) => x + y.length, 0), 0)}`)
if (fixes.length) {
  const byY = {}
  for (const f of fixes) {
    const y = f.slice(3, 7)
    byY[y] = (byY[y] || 0) + 1
  }
  say('')
  say(`完形填空答案更正 ${fixes.length} 处（主源字母键 → 权威词表）：`)
  say(`  按年：${Object.keys(byY).sort().map((y) => `${y}:${byY[y]}`).join(' ')}`)
  for (const f of fixes) say('  ' + f)
}
if (readFixes.length) {
  const byY = {}
  for (const f of readFixes) {
    const y = f.slice(3, 7)
    byY[y] = (byY[y] || 0) + 1
  }
  say('')
  say(`阅读理解答案更正 ${readFixes.length} 处（主源答案键 → 外部解析）：`)
  say(`  按年：${Object.keys(byY).sort().map((y) => `${y}:${byY[y]}`).join(' ')}`)
  for (const f of readFixes) say('  ' + f)
}
if (warns.length) {
  say('')
  say(`警告 ${warns.length} 条：`)
  for (const w of warns) say('  ' + w)
} else {
  say('警告：无')
}
if (fatal.length) {
  say('')
  say(`致命 ${fatal.length} 条：`)
  for (const f of fatal) say('  ' + f)
}

mkdirSync(dirname(REPORT), { recursive: true })
writeFileSync(REPORT, log.join('\n') + '\n', 'utf-8')

// 报告先落盘，再决定是否中止 —— 否则排查时看不到上面那些警告
if (fatal.length) {
  process.stdout.write(`FAIL fatal=${fatal.length} report=${REPORT}\n`)
  process.exit(1)
}

writeFileSync(OUT, JSON.stringify({ materials, questions }, null, 1), 'utf-8')
// 控制台只打 ASCII 摘要，避免 Windows 控制台编码问题
process.stdout.write(`OK questions=${questions.length} materials=${Object.keys(materials).length} warns=${warns.length} report=${REPORT}\n`)
