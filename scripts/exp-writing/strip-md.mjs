/**
 * 清理解析文本里的 Markdown **加粗** 星号残留。
 * 富文本渲染器（richText.ts / tex.tsx）只支持 KaTeX 公式、表格、图片与 <b>，
 * 不解析 Markdown，因此 **xxx** 会把两个星号原样显示出来。
 * 这里只把「成对且中间不含星号/换行」的 **xxx** 还原为 xxx，
 * 不触碰 2012/2014 原有解析里的 $...$ 与 LaTeX 公式，
 * 也不会误伤表达式里单独出现的乘号星号（不成对）。
 * 幂等：可重复执行。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const QFILE = path.join(ROOT, 'src/data/questions.json')
const questions = JSON.parse(fs.readFileSync(QFILE, 'utf8'))

const changed = []
for (const q of questions) {
  const e = q.explanation || ''
  const next = e.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  if (next !== e) {
    q.explanation = next
    changed.push(q.id)
  }
}
fs.writeFileSync(QFILE, JSON.stringify(questions), 'utf8')
console.log(`清理 Markdown 加粗残留: ${changed.length} 题`)
console.log(`  ${changed.join(' ')}`)
