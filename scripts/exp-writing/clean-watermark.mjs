/**
 * 清理题库解析里的推广水印（零内容损失）
 * ============================================================
 * 原始采集源在部分解析末尾拼了「全国各院校…免费分享 / github 链接 /
 * 关注微信公众号 N诺考研」等推广文字。这些不是解析正文，且题库部署在
 * 公开 GitHub Pages，不应转载第三方推广内容。
 *
 * 只删除匹配到的推广片段，保留前面的解析正文；可重复执行。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const QFILE = path.join(ROOT, 'src/data/questions.json')

// 推广段总是以「全国各院校」起头，直到解析结束（中间可能断行/带空格）
const PROMO = /全国各院校[\s\S]*$/

const questions = JSON.parse(fs.readFileSync(QFILE, 'utf8'))
let cleaned = 0
const touched = []

for (const q of questions) {
  const s = q.explanation || ''
  if (!PROMO.test(s)) continue
  const next = s.replace(PROMO, '').replace(/[\s　]+$/, '').trim()
  if (next.length === 0) {
    console.error(`警告：${q.id} 清理后为空，跳过（需人工补写）`)
    continue
  }
  q.explanation = next
  cleaned++
  touched.push(`${q.id} (${s.length} → ${next.length} 字)`)
}

fs.writeFileSync(QFILE, JSON.stringify(questions), 'utf8')
console.log(`清理题数: ${cleaned}`)
touched.forEach((t) => console.log('  ' + t))

const left = questions.filter((q) => /N诺|n诺|http|www\.|cskaoyan/.test(q.explanation || ''))
console.log(`残留水印: ${left.length}`)
