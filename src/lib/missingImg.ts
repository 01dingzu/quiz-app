import type { Question } from '../types'

// ============================================================
// 缺图/缺表检测
//
// 规则：题干（综合应用题含各小问）里引用了「图」或「表」，
//       而题目里没有对应的图 / 表内容 → 判为缺资源。
//       图与表分开判定：只有表格的题，若还引用了图，仍算缺图。
//
// 关键词刻意排除单独"图"字与"图中"：避免把图论术语题
//（"下列关于图的叙述""有向图中"）误报为缺图。
// ============================================================

/**
 * 表引用关键词。
 *
 * 「下表」后面必须不是「表示 / 表达 / 表明」这类动词 —— 否则
 * 「空间直角坐标**下表**示的二次曲面」（math-2016-06）这类题干会被误判成引用表格。
 * 真实的表引用后面跟的是 所 / 给 / 列 / 为 / 中 / 标点（如下表所示、下表给出、见下表）。
 */
export const TBL_REF_RE = /(下表(?!\s*[示达明现情态征白面演])|如表(?!\s*[示达明现情态征白面演]))/
/** 图引用关键词 */
export const FIG_REF_RE = /(如图|如右图|如左图|下图|右图|左图|图所示|如题\s*\d+\s*图|见图)/
/** 图或表引用（任一）——兼容旧调用方 */
export const IMG_REF_RE =
  /(如图|如右图|如左图|下图|右图|左图|图所示|如题\s*\d+\s*图|见图|下表(?!\s*[示达明现情态征白面演])|如表(?!\s*[示达明现情态征白面演]))/

/** Markdown 内联图片语法：![alt](url "title") */
export const MD_IMG_RE = /!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)/
/** 已内嵌的 HTML 表格 */
export const INLINE_TABLE_RE = /<table\b/i

/** 取题目里所有承载题面的文本段（题干 + 综合应用题各小问题干） */
function faceTexts(q: Question): string[] {
  return q.type === 'applied' ? [q.stem, ...q.parts.map((p) => p.stem)] : [q.stem]
}

/** 题干（含综合应用题各小问 stem）中是否引用图/表 */
export function hasImageRef(q: Question): boolean {
  return faceTexts(q).some((t) => IMG_REF_RE.test(t))
}

/**
 * 题目是否已带图 / 表内容。
 * 识别四种形态：
 *  1. 结构化字段：image / img / figure，或非空 images[]
 *  2. 题干内嵌 Markdown 图片：![](https://…)
 *  3. 题干内嵌 HTML 表格：<table>…</table>（由 tex 渲染为真实表格）
 * 综合应用题的判断范围含各小问 stem。
 */
export function hasImageAsset(q: Question): boolean {
  const anyQ = q as unknown as Record<string, unknown>
  if (anyQ.image || anyQ.img || anyQ.figure) return true
  const imgs = anyQ.images
  if (Array.isArray(imgs) && imgs.length > 0) return true
  const texts = faceTexts(q)
  return texts.some((t) => MD_IMG_RE.test(t) || INLINE_TABLE_RE.test(t))
}

/** 是否缺图/表资源：引用了图但没有图，或引用了表但没有表 */
export function isMissingImg(q: Question): boolean {
  const texts = faceTexts(q)
  const anyQ = q as unknown as Record<string, unknown>
  const structImg =
    !!(anyQ.image || anyQ.img || anyQ.figure) ||
    (Array.isArray(anyQ.images) && (anyQ.images as unknown[]).length > 0)

  let needFig = false
  let needTbl = false
  let hasFig = structImg
  let hasTbl = false

  for (const t of texts) {
    const fig = FIG_REF_RE.test(t)
    const tbl = TBL_REF_RE.test(t)
    if (fig) needFig = true
    if (tbl) needTbl = true
    if (MD_IMG_RE.test(t)) hasFig = true
    if (INLINE_TABLE_RE.test(t)) {
      hasTbl = true
      // 同一段里只提"图"、内嵌的却是表格 → 该图就是以表格形式给出的
      // （如 2012-a44 把流水线执行过程画成表格）
      if (fig && !tbl) hasFig = true
    }
  }

  if (!needFig && !needTbl) return false
  return (needFig && !hasFig) || (needTbl && !hasTbl)
}

/** 缺图题的提示文案 */
export function missingImgHint(): string {
  return '题目引用了图/表，但题库暂未收录对应图片，可能无法完整作答。'
}
