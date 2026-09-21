// ============================================================
// 富文本解析（纯函数，无 React / 无 DOM，便于单测）
//
// 把一段文本切成有序 token 序列：
//   text  → 纯文本
//   math  → $行内$ / $$块级$$
//   img   → ![alt](url)
//   table → <table>…</table>（只保留内部 HTML，渲染时再解析行列）
//
// 渲染层（tex.tsx）只负责把 token 变成 React 元素，
// 解析规则全部集中在这里，避免"渲染逻辑改不动、测不了"。
// ============================================================

export interface RichTok {
  k: 'text' | 'math' | 'img' | 'table'
  v: string
  /** math：是否块级 */
  block?: boolean
  /** img：alt 文本 */
  alt?: string
}

export interface TableCell {
  /** 是否表头单元格 */
  th: boolean
  /** 单元格文本（已剥离其余标签，可能仍含 $公式$ / ![]()，由渲染层再走一遍内联解析） */
  text: string
}

/** Markdown 图片：![alt](url "title") */
export const IMG_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/
/** 表格起始 */
export const TABLE_HEAD_RE = /^<table\b/i
/** 表格整体（非贪婪取到第一个 </table>） */
export const TABLE_RE = /^<table\b[^>]*>([\s\S]*?)<\/table>/i
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
const CELL_RE = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
const CAPTION_RE = /<caption\b[^>]*>([\s\S]*?)<\/caption>/i

/** 文本是否需要走富文本管线（否则可零开销直接输出） */
export const RICH_RE = /[$]|!\[|<table\b/i

/** 该文本是否需要富文本处理 */
export function needsRich(text: string): boolean {
  return !!text && RICH_RE.test(text)
}

/** 剥掉单元格内的其余标签，仅保留文字（<br> 与块级收尾转成换行） */
export function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** 表格内部 HTML → 行列结构（纯数据，方便单测） */
export function tableToRows(html: string): { caption: string; rows: TableCell[][] } {
  const capM = CAPTION_RE.exec(html)
  const caption = capM ? stripTags(capM[1]).trim() : ''
  const rows: TableCell[][] = []
  for (const r of html.matchAll(ROW_RE)) {
    const cells: TableCell[] = []
    for (const c of r[1].matchAll(CELL_RE)) {
      cells.push({ th: c[1].toLowerCase() === 'th', text: stripTags(c[2]).trim() })
    }
    if (cells.length > 0) rows.push(cells)
  }
  return { caption, rows }
}

/** 把一段文本切成 token 序列 */
export function parseRich(src: string): RichTok[] {
  const out: RichTok[] = []
  let buf = ''
  let i = 0

  const flush = () => {
    if (buf) {
      out.push({ k: 'text', v: buf })
      buf = ''
    }
  }

  while (i < src.length) {
    const ch = src[i]

    // HTML 表格
    if (ch === '<' && TABLE_HEAD_RE.test(src.slice(i))) {
      const m = TABLE_RE.exec(src.slice(i))
      if (m) {
        flush()
        out.push({ k: 'table', v: m[1] })
        i += m[0].length
        continue
      }
    }

    // Markdown 图片 → 外链渲染（只接受 http/https，挡掉 data:/javascript: 注入）
    if (ch === '!' && src[i + 1] === '[') {
      const m = IMG_RE.exec(src.slice(i))
      if (m && /^https?:\/\//i.test(m[2])) {
        flush()
        out.push({ k: 'img', v: m[2], alt: m[1] })
        i += m[0].length
        continue
      }
    }

    if (ch === '\\' && src[i + 1] === '$') {
      // 转义的 \$ → 字面美元符
      buf += '$'
      i += 2
      continue
    }

    if (ch === '$') {
      const block = src[i + 1] === '$'
      const open = block ? 2 : 1
      const closer = block ? '$$' : '$'
      const close = src.indexOf(closer, i + open)
      if (close > -1) {
        const body = src.slice(i + open, close)
        // 空公式（如 "$$"）或跨度过大（多半不是公式）→ 当字面量
        if (body.trim() && body.length < 600) {
          flush()
          out.push({ k: 'math', v: body, block })
          i = close + open
          continue
        }
      }
    }

    buf += ch
    i++
  }
  flush()
  return out
}
