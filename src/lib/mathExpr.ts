// ============================================================
// 受限数学表达式求值器
//
// 为什么不用 eval / new Function：
//   填空题的输入来自用户，比对基准又来自第三方题库。把任何字符串交给
//   JS 引擎执行都是不可接受的 —— 哪怕只在本地 PWA 里。
//   这里用递归下降手写解析器，语法里根本没有「成员访问 / 赋值 / 语句」，
//   从结构上就不可能逃逸。支持的东西严格限于数学：
//
//     number  π/e   + - * / ^ ( )
//     sqrt abs exp ln log lg sin cos tan
//
// 隐式乘法也支持（2pi、2(3+1)、2ln2）—— 这是填空题里最常见的写法差异。
// ============================================================

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; reason: string }

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  inf: Infinity,
}

/** 注：国内考研语境下 log 通常指常用对数；自然对数一律用 ln。 */
const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  lg: Math.log10,
  log: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
}

/** 插入隐式乘号：2pi → 2*pi，2( → 2*(，)( → )*(，pi( → pi*( */
export function insertImplicitMul(s: string): string {
  let t = s
  t = t.replace(/(\d)\s*([a-zA-Zπ(])/g, '$1*$2')
  t = t.replace(/\)\s*(\d|[a-zA-Zπ(])/g, ')*$1')
  t = t.replace(/(pi|π|e)\s*\(/g, '$1*(')
  t = t.replace(/(pi|π)\s*(?=[a-zA-Z])/g, '$1*')
  return t
}

/**
 * 只查自有属性，不走原型链。
 * 直接写 `name in CONSTS` 会命中原型链，于是 'constructor' / 'toString'
 * 这类输入会被当成合法常量返回 Object 构造函数 —— 这是必须堵住的口子。
 *
 * 用 hasOwnProperty.call 而不是 Object.hasOwn：后者的 TS lib 要求 ES2022，
 * 且 Safari < 15.4 不提供，没必要为一个内部判定抬高运行时门槛。
 */
function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k)
}

/**
 * 求值。任何语法错误 / 未知标识符 / 非有限结果都返回 ok:false，
 * 由调用方决定退化成字符串比较还是判错。
 */
export function evaluateMath(input: string): EvalResult {
  const src = insertImplicitMul(input.replace(/\s+/g, ''))
  let i = 0

  const peek = () => src[i]
  // 注意：never 返回类型必须标在**变量**上（而非仅标在箭头函数的返回位），
  // 否则 TS 的控制流分析不会把 fail(...) 的后续视为不可达，
  // parsePrimary 会被判为「缺少返回语句」。
  const fail: (msg: string) => never = (msg) => {
    throw new Error(msg)
  }

  function parseExpr(): number {
    let v = parseTerm()
    for (;;) {
      const c = peek()
      if (c === '+') {
        i++
        v += parseTerm()
      } else if (c === '-') {
        i++
        v -= parseTerm()
      } else {
        return v
      }
    }
  }

  function parseTerm(): number {
    let v = parseUnary()
    for (;;) {
      const c = peek()
      if (c === '*') {
        i++
        v *= parseUnary()
      } else if (c === '/') {
        i++
        v /= parseUnary()
      } else {
        return v
      }
    }
  }

  function parseUnary(): number {
    const c = peek()
    if (c === '-') {
      i++
      return -parseUnary()
    }
    if (c === '+') {
      i++
      return parseUnary()
    }
    return parsePower()
  }

  function parsePower(): number {
    const base = parsePrimary()
    if (peek() === '^') {
      i++
      const exp = parseUnary() // 右结合：2^3^2 = 2^(3^2)
      return Math.pow(base, exp)
    }
    return base
  }

  function parsePrimary(): number {
    const c = peek()
    if (c === undefined) fail('表达式意外结束')
    if (c === '(') {
      i++
      const v = parseExpr()
      if (peek() !== ')') fail('缺少右括号')
      i++
      return v
    }
    const numMatch = /^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(src.slice(i))
    if (numMatch) {
      i += numMatch[0].length
      return Number(numMatch[0])
    }
    const idMatch = /^[a-zA-Zπ]+/.exec(src.slice(i))
    if (idMatch) {
      const raw = idMatch[0]
      const name = raw.toLowerCase()
      i += raw.length
      // 必须只查自有属性 —— 见 hasOwn 的说明，这是必须堵住的原型链口子。
      if (hasOwn(CONSTS, name)) return CONSTS[name]
      const fn = hasOwn(FUNCS, name) ? FUNCS[name] : undefined
      if (fn) {
        // 支持 sqrt(2) 与 sqrt2 两种写法
        let arg: number
        if (peek() === '(') {
          i++
          arg = parseExpr()
          if (peek() !== ')') fail('函数缺少右括号')
          i++
        } else {
          arg = parsePrimary()
        }
        return fn(arg)
      }
      fail('未知符号: ' + raw)
    }
    if (c === '.') {
      // .5 这种写法
      const m = /^\.\d+/.exec(src.slice(i))
      if (m) {
        i += m[0].length
        return Number(m[0])
      }
    }
    fail('无法解析: ' + JSON.stringify(src.slice(i, i + 12)))
  }

  try {
    const v = parseExpr()
    if (i < src.length) return { ok: false, reason: '尾部有多余内容: ' + src.slice(i, i + 12) }
    if (Number.isNaN(v)) return { ok: false, reason: 'NaN' }
    return { ok: true, value: v }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** 相对误差内的数值等价（1e-9） */
export function nearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b
  const diff = Math.abs(a - b)
  if (diff === 0) return true
  return diff <= tol * Math.max(1, Math.abs(a), Math.abs(b))
}
