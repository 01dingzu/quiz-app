var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  canonMath: () => canonMath,
  evaluateMath: () => evaluateMath,
  insertImplicitMul: () => insertImplicitMul,
  latexToText: () => latexToText,
  mathEqual: () => mathEqual,
  nearlyEqual: () => nearlyEqual,
  splitMulti: () => splitMulti,
  traceMathEqual: () => traceMathEqual
});
module.exports = __toCommonJS(stdin_exports);

// src/lib/mathExpr.ts
var CONSTS = {
  pi: Math.PI,
  \u03C0: Math.PI,
  e: Math.E,
  inf: Infinity
};
var FUNCS = {
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
  cosh: Math.cosh
};
function insertImplicitMul(s) {
  let t = s;
  t = t.replace(/(\d)\s*([a-zA-Zπ(])/g, "$1*$2");
  t = t.replace(/\)\s*(\d|[a-zA-Zπ(])/g, ")*$1");
  t = t.replace(/(pi|π|e)\s*\(/g, "$1*(");
  t = t.replace(/(pi|π)\s*(?=[a-zA-Z])/g, "$1*");
  return t;
}
function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}
function evaluateMath(input) {
  const src = insertImplicitMul(input.replace(/\s+/g, ""));
  let i = 0;
  const peek = () => src[i];
  const fail = (msg) => {
    throw new Error(msg);
  };
  function parseExpr() {
    let v = parseTerm();
    for (; ; ) {
      const c = peek();
      if (c === "+") {
        i++;
        v += parseTerm();
      } else if (c === "-") {
        i++;
        v -= parseTerm();
      } else {
        return v;
      }
    }
  }
  function parseTerm() {
    let v = parseUnary();
    for (; ; ) {
      const c = peek();
      if (c === "*") {
        i++;
        v *= parseUnary();
      } else if (c === "/") {
        i++;
        v /= parseUnary();
      } else {
        return v;
      }
    }
  }
  function parseUnary() {
    const c = peek();
    if (c === "-") {
      i++;
      return -parseUnary();
    }
    if (c === "+") {
      i++;
      return parseUnary();
    }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (peek() === "^") {
      i++;
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }
  function parsePrimary() {
    const c = peek();
    if (c === void 0) fail("\u8868\u8FBE\u5F0F\u610F\u5916\u7ED3\u675F");
    if (c === "(") {
      i++;
      const v = parseExpr();
      if (peek() !== ")") fail("\u7F3A\u5C11\u53F3\u62EC\u53F7");
      i++;
      return v;
    }
    const numMatch = /^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(src.slice(i));
    if (numMatch) {
      i += numMatch[0].length;
      return Number(numMatch[0]);
    }
    const idMatch = /^[a-zA-Zπ]+/.exec(src.slice(i));
    if (idMatch) {
      const raw = idMatch[0];
      const name = raw.toLowerCase();
      i += raw.length;
      if (hasOwn(CONSTS, name)) return CONSTS[name];
      const fn = hasOwn(FUNCS, name) ? FUNCS[name] : void 0;
      if (fn) {
        let arg;
        if (peek() === "(") {
          i++;
          arg = parseExpr();
          if (peek() !== ")") fail("\u51FD\u6570\u7F3A\u5C11\u53F3\u62EC\u53F7");
          i++;
        } else {
          arg = parsePrimary();
        }
        return fn(arg);
      }
      fail("\u672A\u77E5\u7B26\u53F7: " + raw);
    }
    if (c === ".") {
      const m = /^\.\d+/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        return Number(m[0]);
      }
    }
    fail("\u65E0\u6CD5\u89E3\u6790: " + JSON.stringify(src.slice(i, i + 12)));
  }
  try {
    const v = parseExpr();
    if (i < src.length) return { ok: false, reason: "\u5C3E\u90E8\u6709\u591A\u4F59\u5185\u5BB9: " + src.slice(i, i + 12) };
    if (Number.isNaN(v)) return { ok: false, reason: "NaN" };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
function nearlyEqual(a, b, tol = 1e-9) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  const diff = Math.abs(a - b);
  if (diff === 0) return true;
  return diff <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

// src/lib/equiv.ts
var MULTI_SPLIT = /\s*(?:,|，|;|；|、|\s或\s|\s及\s|\s和\s)\s*/;
function expandStructures(s) {
  let out = s;
  for (let guard = 0; guard < 40; guard++) {
    const mRoot = /\\sqrt\s*\[\s*([^{}]*?)\s*\]\s*\{([^{}]*)\}/.exec(out);
    if (mRoot) {
      out = out.slice(0, mRoot.index) + `((${mRoot[2]})^(1/(${mRoot[1]})))` + out.slice(mRoot.index + mRoot[0].length);
      continue;
    }
    const mSqrt = /\\sqrt\s*\{([^{}]*)\}/.exec(out);
    if (mSqrt) {
      out = out.slice(0, mSqrt.index) + `sqrt(${mSqrt[1]})` + out.slice(mSqrt.index + mSqrt[0].length);
      continue;
    }
    const mFrac = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/.exec(out);
    if (mFrac) {
      out = out.slice(0, mFrac.index) + `((${mFrac[1]})/(${mFrac[2]}))` + out.slice(mFrac.index + mFrac[0].length);
      continue;
    }
    break;
  }
  return out;
}
var FULLWIDTH = [
  [/（/g, "("],
  [/）/g, ")"],
  [/，/g, ","],
  [/；/g, ";"],
  [/：/g, ":"],
  [/＝/g, "="],
  [/＋/g, "+"],
  [/－/g, "-"],
  [/＊/g, "*"],
  [/／/g, "/"],
  [/．/g, "."],
  [/，/g, ","],
  [/％/g, "%"],
  [/＜/g, "<"],
  [/＞/g, ">"]
];
function latexToText(raw) {
  let s = raw ?? "";
  s = s.replace(/\$\$?/g, "");
  s = s.replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|bigg|Bigg|displaystyle|limits|nolimits)\b/g, "");
  s = s.replace(/\\(?:quad|qquad|thinspace|enspace|,|;|!| )/g, " ");
  s = s.replace(/\\\\(?![a-zA-Z])/g, " ");
  for (let k = 0; k < 8; k++) {
    const next = s.replace(/\\(?:mathrm|mathbf|mathsf|mathit|text|operatorname|mbox|textnormal)\s*\{([^{}]*)\}/g, "$1");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\\cdot|\\times/g, "*").replace(/\\div/g, "/");
  s = s.replace(/\\(ln|lg|log|sin|cos|tan|cot|sec|csc|exp|max|min|arcsin|arccos|arctan|lim)\b/g, "$1");
  s = s.replace(/\\pi\b/g, "pi").replace(/\\infty\b/g, "inf");
  s = expandStructures(s);
  s = s.replace(/\\[a-zA-Z]+\b/g, (m) => m.slice(1));
  s = s.replace(/[{}]/g, "");
  for (const [re, rep] of FULLWIDTH) s = s.replace(re, rep);
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
function canonMath(raw) {
  return latexToText(raw).replace(/\s+/g, "").replace(/[.。]+$/g, "").toLowerCase();
}
function splitMulti(s) {
  return s.split(MULTI_SPLIT).map((x) => x.trim()).filter(Boolean);
}
function stripAssignment(s) {
  const m = /^\s*[a-zA-Z]\s*=\s*(.+)$/.exec(s);
  return m ? m[1].trim() : s;
}
function singleEqual(answer, input) {
  if (canonMath(answer) === canonMath(input)) return true;
  const aText = latexToText(answer);
  const iText = latexToText(input);
  const aRhs = stripAssignment(aText);
  const iRhs = stripAssignment(iText);
  if (aRhs !== aText || iRhs !== iText) {
    if (canonMath(aRhs) === canonMath(iRhs)) return true;
  }
  const a = evaluateMath(aRhs);
  const b = evaluateMath(iRhs);
  if (a.ok && b.ok && nearlyEqual(a.value, b.value)) return true;
  return false;
}
function mathEqual(spec, input) {
  const raw = (input ?? "").trim();
  if (!raw) return false;
  const candidates = [spec.answer, ...spec.accept ?? []].filter(Boolean);
  for (const c of candidates) {
    if (singleEqual(c, raw)) return true;
    const partsA = splitMulti(c);
    const partsB = splitMulti(raw);
    if (partsA.length > 1 && partsB.length === partsA.length) {
      const used = new Array(partsB.length).fill(false);
      let allHit = true;
      for (const pa of partsA) {
        let hit = false;
        for (let i = 0; i < partsB.length; i++) {
          if (used[i]) continue;
          if (singleEqual(pa, partsB[i])) {
            used[i] = true;
            hit = true;
            break;
          }
        }
        if (!hit) {
          allHit = false;
          break;
        }
      }
      if (allHit) return true;
    }
  }
  return false;
}
function traceMathEqual(spec, input) {
  const a = evaluateMath(latexToText(spec.answer));
  const b = evaluateMath(latexToText(input));
  return {
    canonicalHit: canonMath(spec.answer) === canonMath(input),
    numericAnswer: a.ok ? a.value : null,
    numericInput: b.ok ? b.value : null,
    equal: mathEqual(spec, input)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  canonMath,
  evaluateMath,
  insertImplicitMul,
  latexToText,
  mathEqual,
  nearlyEqual,
  splitMulti,
  traceMathEqual
});
