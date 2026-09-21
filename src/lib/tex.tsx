import { useMemo, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { needsRich, parseRich, stripTags, tableToRows, type RichTok } from './richText'

// ============================================================
// 富文本渲染（题干 / 选项 / 解析 / 答案通用）
//
// 解析规则见 ./richText.ts（纯函数，可单测）。这里只负责把 token
// 变成 React 元素：
//   $公式$      → KaTeX
//   ![alt](url) → 外链图片
//   <table>     → 真实表格
//
// 安全约定：
//   - 除 KaTeX 自身输出外，不使用 dangerouslySetInnerHTML。
//   - 表格只按白名单读 tr/td/th/caption，标签一律丢弃、属性一律忽略；
//     单元格文本重新走同一条内联渲染管线，因此表格内也能渲染公式与图片。
//   - 图片只接受 http/https，挡掉 data:/javascript: 注入。
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMath(body: string, block: boolean): string {
  try {
    return katex.renderToString(body, {
      displayMode: block,
      throwOnError: false,
      output: 'html',
      strict: false,
      trust: false,
    })
  } catch {
    // 渲染失败不该让整页崩掉 —— 退回原文
    return escapeHtml((block ? '$$' : '$') + body + (block ? '$$' : '$'))
  }
}

/** 渲染单个 token */
function renderTok(t: RichTok, key: string): ReactNode {
  if (t.k === 'math') {
    return (
      <span
        key={key}
        className={'tex' + (t.block ? ' tex-block' : '')}
        dangerouslySetInnerHTML={{ __html: renderMath(t.v, !!t.block) }}
      />
    )
  }
  if (t.k === 'img') {
    return (
      <a key={key} className="q-img-wrap" href={t.v} target="_blank" rel="noreferrer">
        <img className="q-img" src={t.v} alt={t.alt || '题图'} loading="lazy" />
      </a>
    )
  }
  if (t.k === 'table') return <HtmlTable key={key} html={t.v} />
  return <span key={key}>{t.v}</span>
}

/** 安全表格渲染：只认 tr/td/th/caption，属性一律忽略（无 HTML 注入面） */
function HtmlTable({ html }: { html: string }) {
  const { caption, rows } = tableToRows(html)
  if (rows.length === 0) return <span className="q-table-fallback">{stripTags(html).trim()}</span>
  return (
    <div className="q-table-wrap">
      <table className="q-table">
        {caption && <caption>{caption}</caption>}
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri}>
              {cells.map((c, ci) =>
                c.th ? (
                  <th key={ci}>{renderInline(c.text, `h${ri}-${ci}`)}</th>
                ) : (
                  <td key={ci}>{renderInline(c.text, `d${ri}-${ci}`)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 内联渲染：纯文本走零开销快路径，其余切 token 后逐个渲染。
 * 表格单元格会递归调用本函数，因此格内公式/图片同样生效。
 */
export function renderInline(text: string, keyBase = 'i'): ReactNode {
  if (!text) return null
  if (!needsRich(text)) return text
  const toks = parseRich(text)
  if (toks.length === 1 && toks[0].k === 'text') return toks[0].v
  return toks.map((t, i) => renderTok(t, `${keyBase}-${i}`))
}

/** 渲染可能含公式 / 图片 / 表格的文本 */
export function Tex({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo<ReactNode>(() => renderInline(text, 't'), [text])
  if (className) return <span className={className}>{nodes}</span>
  return <>{nodes}</>
}

/** 该文本是否含公式（用于条件加样式类） */
export function hasTex(s: string): boolean {
  return !!s && s.includes('$')
}
