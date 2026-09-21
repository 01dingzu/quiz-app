// ============================================================
// 答案等价判定（方案书点名的 P4 核心难点）
//
// 同一道数学填空题的正确答案，写法可以差很多：
//   π/4  |  \frac{\pi}{4}  |  0.7853981…  |  pi/4
//   ln(1+√2)  |  \ln (1 + \sqrt{2})
//   2/3  |  0.6666666667
//   x = 1  |  1
//
// 判定分四层，从严到宽，任一层通过即算对：
//   ① 字符串归一后全等（去空格 / 全角 / 尾句点 / 大小写）
//   ② accept 白名单全等（题库手工维护的别名）
//   ③ 多解逐项无序配对（'1 或 -1' 与 '-1,1'）
//   ④ 数值等价（委托受限求值器，相对误差 1e-9）
//
// 关键是 ④ 走的是 evaluateMath 而不是 eval —— 见 mathExpr.ts 的说明。
// 不能求值的答案（矩阵、集合、含自由变量）会自然退化到 ①②，不会误判。
// ============================================================

import type { BlankSpec } from '../types'
import { evaluateMath, nearlyEqual } from './mathExpr'

const MULTI_SPLIT = /\s*(?:,|，|;|；|、|\s或\s|\s及\s|\s和\s)\s*/

/** 展开 \frac / \sqrt（含嵌套），循环到不再变化。必须先于花括号清理。 */
function expandStructures(s: string): string {
  let out = s
  for (let guard = 0; guard < 40; guard++) {
    const mRoot = /\\sqrt\s*\[\s*([^{}]*?)\s*\]\s*\{([^{}]*)\}/.exec(out)
    if (mRoot) {
      out = out.slice(0, mRoot.index) + `((${mRoot[2]})^(1/(${mRoot[1]})))` + out.slice(mRoot.index + mRoot[0].length)
      continue
    }
    const mSqrt = /\\sqrt\s*\{([^{}]*)\}/.exec(out)
    if (mSqrt) {
      out = out.slice(0, mSqrt.index) + `sqrt(${mSqrt[1]})` + out.slice(mSqrt.index + mSqrt[0].length)
      continue
    }
    const mFrac = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/.exec(out)
    if (mFrac) {
      out = out.slice(0, mFrac.index) + `((${mFrac[1]})/(${mFrac[2]}))` + out.slice(mFrac.index + mFrac[0].length)
      continue
    }
    break
  }
  return out
}

const FULLWIDTH: [RegExp, string][] = [
  [/（/g, '('], [/）/g, ')'], [/，/g, ','], [/；/g, ';'], [/：/g, ':'],
  [/＝/g, '='], [/＋/g, '+'], [/－/g, '-'], [/＊/g, '*'], [/／/g, '/'],
  [/．/g, '.'], [/，/g, ','], [/％/g, '%'], [/＜/g, '<'], [/＞/g, '>'],
]

/** LaTeX / 富文本 → 可比较的纯文本（保留 ^ 与括号，丢掉排版噪音） */
export function latexToText(raw: string): string {
  let s = raw ?? ''
  s = s.replace(/\$\$?/g, '')
  s = s.replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|bigg|Bigg|displaystyle|limits|nolimits)\b/g, '')
  s = s.replace(/\\(?:quad|qquad|thinspace|enspace|,|;|!| )/g, ' ')
  s = s.replace(/\\\\(?![a-zA-Z])/g, ' ')
  // 包裹类命令：\mathrm{e} -> e
  for (let k = 0; k < 8; k++) {
    const next = s.replace(/\\(?:mathrm|mathbf|mathsf|mathit|text|operatorname|mbox|textnormal)\s*\{([^{}]*)\}/g, '$1')
    if (next === s) break
    s = next
  }
  s = s.replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/')
  s = s.replace(/\\(ln|lg|log|sin|cos|tan|cot|sec|csc|exp|max|min|arcsin|arccos|arctan|lim)\b/g, '$1')
  s = s.replace(/\\pi\b/g, 'pi').replace(/\\infty\b/g, 'inf')
  // 展开 \frac / \sqrt 必须在「反斜杠清理」之前 —— 否则 \frac 会先被
  // 变成 frac，结构就再也认不出来了（这是踩过的坑）。
  s = expandStructures(s)
  s = s.replace(/\\[a-zA-Z]+\b/g, (m) => m.slice(1)) // 其余 \alpha → alpha
  s = s.replace(/[{}]/g, '')
  for (const [re, rep] of FULLWIDTH) s = s.replace(re, rep)
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/** 字符串层面的归一（用于第 ① 层） */
export function canonMath(raw: string): string {
  return latexToText(raw)
    .replace(/\s+/g, '')
    .replace(/[.。]+$/g, '')
    .toLowerCase()
}

/** 按多解分隔符切分；返回长度 1 表示不是多解 */
export function splitMulti(s: string): string[] {
  return s
    .split(MULTI_SPLIT)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** 剥离 'x=1' 这类前缀，取出右侧表达式（仅当左侧是单个字母时） */
function stripAssignment(s: string): string {
  const m = /^\s*[a-zA-Z]\s*=\s*(.+)$/.exec(s)
  return m ? m[1].trim() : s
}

/** 单项比较（不含多解逻辑） */
function singleEqual(answer: string, input: string): boolean {
  if (canonMath(answer) === canonMath(input)) return true

  // 先归一成纯文本再剥离变量名前缀 —— 否则 '$x = 1$' 以 $ 开头，
  // 前缀正则匹配不上，'x=1 与 1 等价' 这条规则就永远不生效。
  const aText = latexToText(answer)
  const iText = latexToText(input)
  const aRhs = stripAssignment(aText)
  const iRhs = stripAssignment(iText)
  if (aRhs !== aText || iRhs !== iText) {
    if (canonMath(aRhs) === canonMath(iRhs)) return true
  }

  const a = evaluateMath(aRhs)
  const b = evaluateMath(iRhs)
  if (a.ok && b.ok && nearlyEqual(a.value, b.value)) return true

  return false
}

/**
 * 答案等价判定。
 * @param spec  题库里的答案规格（answer 为基准写法，accept 为别名白名单）
 * @param input 用户输入
 */
export function mathEqual(spec: BlankSpec, input: string): boolean {
  const raw = (input ?? '').trim()
  if (!raw) return false

  const candidates = [spec.answer, ...(spec.accept ?? [])].filter(Boolean)
  for (const c of candidates) {
    if (singleEqual(c, raw)) return true

    // 多解：顺序无关的一一配对
    const partsA = splitMulti(c)
    const partsB = splitMulti(raw)
    if (partsA.length > 1 && partsB.length === partsA.length) {
      const used = new Array<boolean>(partsB.length).fill(false)
      let allHit = true
      for (const pa of partsA) {
        let hit = false
        for (let i = 0; i < partsB.length; i++) {
          if (used[i]) continue
          if (singleEqual(pa, partsB[i])) {
            used[i] = true
            hit = true
            break
          }
        }
        if (!hit) {
          allHit = false
          break
        }
      }
      if (allHit) return true
    }
  }
  return false
}

/** 判定诊断：返回每一层的结果，供验证脚本与调试使用 */
export interface EquivTrace {
  canonicalHit: boolean
  numericAnswer: number | null
  numericInput: number | null
  equal: boolean
}

export function traceMathEqual(spec: BlankSpec, input: string): EquivTrace {
  const a = evaluateMath(latexToText(spec.answer))
  const b = evaluateMath(latexToText(input))
  return {
    canonicalHit: canonMath(spec.answer) === canonMath(input),
    numericAnswer: a.ok ? a.value : null,
    numericInput: b.ok ? b.value : null,
    equal: mathEqual(spec, input),
  }
}
