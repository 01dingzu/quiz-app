/**
 * 真实渲染冒烟：用系统自带的 Chrome/Edge + 零依赖 CDP 驱动（Node 22 自带 WebSocket）。
 *
 * 为什么不用 agent-browser：它要装 ~500MB Chromium，而本机已有 Chrome，
 * 而且这个项目的冒烟只需要「路由能渲染 + 关键交互生效 + 无运行时报错」，
 * 不需要截图与视觉校验。
 *
 * 为什么必须有渲染级冒烟：tsc/vite 只保证编译通过，验证脚本只保证纯逻辑正确，
 * 两者都抓不到「React 挂载即抛异常 → 白屏」。这里专门监听 Runtime.exceptionThrown
 * 与 Log.entryAdded 把白屏暴露出来。
 *
 * Chrome 由本脚本自己 spawn 托管，不需要事先启动。
 *   两个 Windows 坑：
 *   1. chrome.exe 是 GUI 子系统程序，PowerShell 的 `&` 既不等待也不捕获它的 stdout，
 *      所以 `--dump-dom` 在 PowerShell 里永远拿到空字符串 —— 必须在 Node 里 spawn。
 *   2. 如果复用已在运行的 Chrome 实例，命令行参数会被转发给那个旧进程，headless 不生效，
 *      因此必须给独立的 user-data-dir。
 *
 * 用法：
 *   node scripts/smoke-cdp.mjs            （需先另开 vite preview 或 dev）
 *   环境变量：SMOKE_BASE（默认 http://localhost:4173）、SMOKE_REPORT、SMOKE_CHROME
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9333)
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const REPORT = process.env.SMOKE_REPORT || 'smoke-report.txt'

const CHROME_CANDIDATES = [
  process.env.SMOKE_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const lines = []
let pass = 0
let fail = 0

function check(name, ok, extra = '') {
  if (ok) {
    pass++
    lines.push(`PASS  ${name}${extra ? `  [${extra}]` : ''}`)
  } else {
    fail++
    lines.push(`FAIL  ${name}${extra ? `  [${extra}]` : ''}`)
  }
}
function section(t) {
  lines.push('', `=== ${t} ===`)
}
function excerpt(t, n = 260) {
  return t.replace(/\s+/g, ' ').trim().slice(0, n)
}

// ---------- CDP 极简客户端 ----------

async function probeCdp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    if (r.ok) return await r.json()
  } catch {
    /* 还没起来 */
  }
  return null
}

async function waitForCdp(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const v = await probeCdp()
    if (v) return v
    await sleep(250)
  }
  return null
}

// 没人在监听就自己起一个无头 Chrome；退出时负责收尸，避免残留进程。
let chromeProc = null
let profileDir = null
let version = await waitForCdp(1200)

if (!version) {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!exe) throw new Error(`找不到可用的 Chrome/Edge，试过：${CHROME_CANDIDATES.join(' / ')}`)
  profileDir = mkdtempSync(join(tmpdir(), 'qb-smoke-'))
  chromeProc = spawn(
    exe,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${PORT}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  chromeProc.stderr.on('data', () => {}) // 吞掉 DevTools listening 之类的噪声
  version = await waitForCdp(25000)
  if (!version) throw new Error(`自行启动的 Chrome 未能开放 CDP 端口 ${PORT}`)
  lines.push(`Chrome（本次启动）: ${version.Browser}  · ${exe}`)
} else {
  lines.push(`Chrome（复用已有）: ${version.Browser}`)
}

function cleanup() {
  if (chromeProc) {
    try {
      chromeProc.kill()
    } catch {
      /* 已退出 */
    }
  }
  if (profileDir) {
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      /* Windows 上偶发占用，忽略 */
    }
  }
}
process.on('exit', cleanup)

// 取一个 page target；headless 刚起来时列表可能还没填好，轮询一下。
let page = null
for (let i = 0; i < 30 && !page; i++) {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) await sleep(200)
}
if (!page) throw new Error('没有可用的 page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()
let events = []

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id != null) {
    const p = pending.get(m.id)
    if (p) {
      pending.delete(m.id)
      if (m.error) p.reject(new Error(JSON.stringify(m.error)))
      else p.resolve(m.result)
    }
  } else {
    events.push(m)
  }
})

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

await send('Runtime.enable')
await send('Page.enable')
await send('Log.enable')

/**
 * 导航并等 load；SPA 有异步 chunk，额外等一拍让 React 完成渲染。
 * 应用用的是 HashRouter（main.tsx），所以路由地址是 `#/jishi` 这种形式。
 * 只有 hash 变化时属于同文档导航，不会触发 loadEventFired —— 这种情况不能白等超时。
 */
async function goto(hashPath) {
  const url = `${BASE}/#${hashPath}`
  events = []
  const cur = await evaluate('location.href')
  const sameDoc = cur.split('#')[0] === url.split('#')[0]

  if (!sameDoc) {
    const loadFired = new Promise((resolve) => {
      const h = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', h)
          resolve()
        }
      }
      ws.addEventListener('message', h)
    })
    await send('Page.navigate', { url })
    await Promise.race([loadFired, sleep(12000)])
  } else {
    await send('Page.navigate', { url })
  }
  await sleep(1200)
}

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (r.exceptionDetails) {
    throw new Error(`evaluate 抛错: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`)
  }
  return r.result.value
}

const bodyText = () => evaluate('document.body.innerText')

/** 收集本次导航后的错误级事件 */
function runtimeErrors() {
  const out = []
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails
      out.push('exception: ' + (d.exception?.description || d.text))
    } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
      out.push('log: ' + e.params.entry.text)
    }
  }
  return out
}

/** 按可见文案点击按钮（文案可能带前后缀，用 startsWith/includes 匹配） */
async function clickButton(label, mode = 'includes') {
  const expr = `(() => {
    const bs = [...document.querySelectorAll('button')]
    const b = bs.find(x => {
      const t = (x.innerText || '').trim()
      return ${mode === 'startsWith' ? `t.startsWith(${JSON.stringify(label)})` : `t.includes(${JSON.stringify(label)})`}
    })
    if (!b) return 'NOT_FOUND'
    if (b.disabled) return 'DISABLED'
    b.click()
    return 'OK'
  })()`
  const r = await evaluate(expr)
  await sleep(700)
  return r
}

// ---------- 各路由断言 ----------

// [A] 首页：三试卷切换器
section('A · 首页 / 试卷切换')
await goto('/')
{
  const t = await bodyText()
  const errs = runtimeErrors()
  check('首页渲染出内容（非白屏）', t.length > 600, `len=${t.length}`)
  check('试卷切换器标题存在', t.includes('试卷（切换会重置年份 / 科目筛选）'))
  check('四张可用试卷都在（408 / 政治 / 英语一 / 数学一）', ['408', '政治', '英语一', '数学一'].every((x) => t.includes(x)))
  check('英语一已是可选试卷（不再有「暂不纳入」占位）', !t.includes('暂不纳入'))
  check('默认落在 408 卷', t.includes('当前：计算机学科专业基础'))
  check('默认卷副标题含题目数与 KPI', /701 题 · 客观 80\/150 分 · 目标正确率 88%/.test(t), excerpt(t, 120))
  check('机试入口卡片存在', t.includes('复试机试'))
  // 「说明」卡的题库构成必须是现算的：历史上这里是手写数字，
  // 补录 28 道综合应用题之后依然写着「408 综合应用题 77（2009-2024）」。
  check('说明卡题库构成随题库现算（含 105 道应用题 / 560 道英语）', t.includes('408 综合应用题 105') && t.includes('英语一 560'), excerpt(t, 200))
  check('说明卡无陈旧数字（77 道应用题 / 199 道数学）', !t.includes('综合应用题 77') && !t.includes('数学一客观题 199'), '')
  check('首页无运行时报错', errs.length === 0, errs.join(' | '))
  lines.push(`  text: ${excerpt(t, 200)}`)
}

// [B] 试卷切换：政治
section('B · 切到政治')
{
  const r = await clickButton('政治', 'startsWith')
  check('点击「政治」按钮成功', r === 'OK', r)
  const sub = await evaluate(`document.querySelector('.paper-sub')?.innerText || ''`)
  check('副标题切到思想政治理论', sub.includes('思想政治理论'), excerpt(sub, 120))
  check('政治题库量 = 495 题', sub.includes('495 题'), excerpt(sub, 120))
  check('政治客观分 50/100', sub.includes('50/100'), excerpt(sub, 120))
  const t = await bodyText()
  check('多选题型在筛选中出现（政治特有）', t.includes('多选'), '')
}

// [C] 试卷切换：数学一
section('C · 切到数学一')
{
  const r = await clickButton('数学一', 'startsWith')
  check('点击「数学一」按钮成功', r === 'OK', r)
  const sub = await evaluate(`document.querySelector('.paper-sub')?.innerText || ''`)
  check('副标题切到数学（一）', sub.includes('数学（一）'), excerpt(sub, 120))
  check('数学题库量 = 218 题', sub.includes('218 题'), excerpt(sub, 120))
  const t = await bodyText()
  check('数学一考纲出现填空题型', t.includes('填空'), '')
  check('数学一模拟卷不出现 11/11/10/8（那是 408 的比例）', !t.includes('11 / 11 / 10 / 8'), '')
}

// [D] 机试页
section('D · 机试页 /jishi')
await goto('/jishi')
{
  const t = await bodyText()
  const errs = runtimeErrors()
  check('机试页渲染出内容', t.length > 600, `len=${t.length}`)
  check('页头文案存在', t.includes('复试机试 · 独立赛道'))
  check('14 个模板区块存在', t.includes('14 个必默写模板'))
  check('三档分层筛选存在', t.includes('第一层') && t.includes('第二层') && t.includes('第三层'))
  check('180 分钟作战时间轴存在', t.includes('180'))
  check('机试页无运行时报错', errs.length === 0, errs.join(' | '))

  const before = await evaluate(`document.querySelectorAll('.jishi-timer').length`)
  check('默写前没有计时器', before === 0, `count=${before}`)

  const started = await clickButton('▶ 开始默写计时')
  check('点击「开始默写计时」成功', started === 'OK', started)
  const clock1 = await evaluate(`document.querySelector('.jishi-timer-clock')?.innerText || ''`)
  // fmtSec 的格式是「0 秒 / 1 分 5 秒」，不是 mm:ss
  check('计时器已出现且格式正确', /⏱\s*(\d+ 秒|\d+ 分 \d+ 秒)/.test(clock1), clock1 || '(空)')
  await sleep(1600)
  const clock2 = await evaluate(`document.querySelector('.jishi-timer-clock')?.innerText || ''`)
  check('计时器在走字（1.6s 后读数变化）', clock1 !== clock2, `${clock1} → ${clock2}`)

  const finished = await clickButton('我写完了 · 记录用时')
  check('点击「我写完了 · 记录用时」成功', finished === 'OK', finished)
  const afterT = await bodyText()
  check('弹回列表（计时器消失）', (await evaluate(`document.querySelectorAll('.jishi-timer').length`)) === 0)
  check('训练次数已 +1（已练 1 次）', afterT.includes('已练 1 次'), '')
  const persisted = await evaluate(`(() => {
    const raw = localStorage.getItem('quiz-app:jishi:v1')
    if (!raw) return 'NO_KEY'
    const s = JSON.parse(raw)
    const rounds = JSON.stringify(s.state?.templates ?? {})
    return rounds
  })()`)
  check('记录落到 localStorage（quiz-app:jishi:v1）', persisted !== 'NO_KEY' && persisted !== '{}', excerpt(String(persisted), 160))
}

// [E] 统计页
section('E · 统计页 /stats')
await goto('/stats')
{
  const t = await bodyText()
  const errs = runtimeErrors()
  // 空档位下的统计页本来就短（各项都是 0），阈值只用于识别白屏
  check('统计页渲染出内容', t.length > 150, `len=${t.length}`)
  check('分试卷客观题 KPI 区块存在', t.includes('分试卷客观题正确率'), excerpt(t, 160))
  check('统计页无运行时报错', errs.length === 0, errs.join(' | '))
}

// [F] 政治自由练习：真正抽题 → 渲染选项 → 作答 → 判题
section('F · 政治自由练习（抽题 → 作答 → 判题）')
await goto('/')
{
  await clickButton('政治', 'startsWith')
  const started = await clickButton('开始练习', 'startsWith')
  check('点击「开始练习」成功', started === 'OK', started)
  const hash = await evaluate('location.hash')
  check('已进入练习页（hash 路由 #/practice）', hash === '#/practice', hash)

  const hasProgress = await evaluate(`!!document.querySelector('.progress-row')`)
  check('练习进度条已渲染', hasProgress === true)

  const t = await bodyText()
  check('题干已渲染', t.includes('第 1 / 495 题'), excerpt(t, 120))
  check('分册信息正确（政治 · 495 题）', t.includes('马原') || t.includes('毛中特'), '')

  const optCount = await evaluate(`document.querySelectorAll('button.opt').length`)
  check('单选题渲染出 4 个选项', optCount === 4, `opts=${optCount}`)

  // 选 A 作答：无论对错，都应立刻进入「只读回顾」态并给出判定
  const picked = await evaluate(`(() => {
    const b = document.querySelector('button.opt')
    if (!b) return 'NOT_FOUND'
    b.click()
    return 'OK'
  })()`)
  check('点击选项作答成功', picked === 'OK', picked)
  await sleep(500)

  const verdict = await evaluate(`document.querySelector('.verdict')?.innerText || ''`)
  check('作答后出现判题结论', verdict.length > 0, excerpt(verdict, 80))
  check('判定为对或错（ok/bad 二选一）',
    (await evaluate(`!!document.querySelector('.verdict.ok') || !!document.querySelector('.verdict.bad')`)) === true)
  check('正确选项被高亮（.opt.correct）',
    (await evaluate(`document.querySelectorAll('button.opt.correct').length`)) === 1)
  check('已答选项全部禁用（防重复作答）',
    (await evaluate(`[...document.querySelectorAll('button.opt')].every(b => b.disabled)`)) === true)
  check('「下一题」已解锁', (await evaluate(`!!document.querySelector('.nav-btn.primary:not([disabled])')`)) === true)
  const errs = runtimeErrors()
  check('练习页无运行时报错', errs.length === 0, errs.join(' | '))
}

// [G] 数学一填空：等价判题引擎在真实浏览器里的表现（含恶意输入）
section('G · 数学一填空（等价写法 + 恶意输入）')
await goto('/')
{
  await clickButton('数学一', 'startsWith')
  const started = await clickButton('开始练习', 'startsWith')
  check('点击「开始练习」成功', started === 'OK', started)

  // 数学一按题号排：1–10 选择、11–16 填空，跳过前面直到出现填空输入框
  let found = false
  let skips = 0
  for (; skips < 20; skips++) {
    if (await evaluate(`!!document.querySelector('.blank-input')`)) {
      found = true
      break
    }
    if ((await clickButton('跳过')) !== 'OK') break
  }
  check('跳过选择题后能翻到填空题', found, `skips=${skips}`)

  if (found) {
    const hint = await bodyText()
    check('等价写法提示对用户可见', hint.includes('支持分数 / 小数等等价写法'))

    // React 受控输入：必须用原生 setter + input 事件，直接改 value 不会触发 onChange
    const typed = await evaluate(`(() => {
      const el = document.querySelector('.blank-input')
      if (!el) return 'NOT_FOUND'
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, '!!!smoke 恶意输入 !!!')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return el.value
    })()`)
    check('填空输入框可输入', typed === '!!!smoke 恶意输入 !!!', String(typed))

    const submitted = await clickButton('确认作答')
    check('点击「确认作答」成功', submitted === 'OK', submitted)
    await sleep(500)

    const verdict = await evaluate(`document.querySelector('.verdict')?.innerText || ''`)
    check('填空作答后出现判题结论', verdict.length > 0, excerpt(verdict, 80))
    check('恶意输入被判为错误（未误判为对）',
      (await evaluate(`!!document.querySelector('.verdict.bad')`)) === true, excerpt(verdict, 60))
    const revealed = await evaluate(`document.querySelector('.blank-answer')?.innerText || ''`)
    // 正确答案本身可能很短（这道题的答案就是「0」），只验证「有揭示」不验证长度
    check('答错后揭示正确答案', revealed.includes('正确：'), excerpt(revealed, 80))
    const errs = runtimeErrors()
    check('等价判题引擎未抛异常（恶意输入未击穿）', errs.length === 0, errs.join(' | '))
  }
}

// [H] 英语一：共享长文（完形 20 空共用一篇、阅读 5 题共用一篇）
// 这是本次扩充唯一新增的**渲染形态**：长文不在题干里，只能靠 materialId 关联，
// 所以必须在真实浏览器里确认「长文渲染出来 + 当前空被高亮 + 换篇/换题不串号」。
section('H · 英语一共享长文（完形高亮当前空 → 阅读换篇）')
await goto('/')
{
  const r = await clickButton('英语一', 'startsWith')
  check('点击「英语一」按钮成功（已可切换）', r === 'OK', r)
  const sub = await evaluate(`document.querySelector('.paper-sub')?.innerText || ''`)
  check('副标题切到英语（一）', sub.includes('英语（一）'), excerpt(sub, 120))
  check('英语一题库量 = 560 题', sub.includes('560 题'), excerpt(sub, 120))
  check('英语一客观分 60/100', sub.includes('60/100'), excerpt(sub, 120))

  const t0 = await bodyText()
  check('模拟考试按科目分槽（完形填空 / 阅读理解）', t0.includes('完形填空') && t0.includes('阅读理解'), '')
  check('组卷题量 = 40 题', t0.includes('开始考试 · 40 题'), excerpt(t0, 160))
  check('估算满分 50（20×0.5 + 20×2）', t0.includes('估算满分 50'), '')

  const started = await clickButton('开始练习', 'startsWith')
  check('点击「开始练习」成功', started === 'OK', started)
  const t = await bodyText()
  check('进入英语一练习（第 1 / 560 题）', t.includes('第 1 / 560 题'), excerpt(t, 160))
  check('完形题干是空号提示（第 1 空）', t.includes('第 1 空'), excerpt(t, 120))

  const demo = `document.querySelector('details.material')`
  check('长文区块已渲染', (await evaluate(`!!${demo}`)) === true)
  check('长文默认展开（练习页 materialOpen）', (await evaluate(`!!document.querySelector('details.material[open]')`)) === true)
  const blanks = await evaluate(`document.querySelectorAll('.material-blank').length`)
  check('完形长文渲染出 20 个空位标记（{{N}} 已解析）', blanks === 20, `blanks=${blanks}`)
  const active = await evaluate(`document.querySelectorAll('.material-blank.active').length`)
  check('只有当前空被高亮（第 1 题 → 恰 1 个 active）', active === 1, `active=${active}`)
  const activeTxt = await evaluate(`document.querySelector('.material-blank.active')?.innerText || ''`)
  check('高亮的是第 1 空', activeTxt.trim() === '1', JSON.stringify(activeTxt))
  const clozeLen = await evaluate(`document.querySelector('.material-body')?.innerText.length || 0`)
  check('完形长文正文已渲染（> 800 字符）', clozeLen > 800, `len=${clozeLen}`)

  // 作答完形 → 判题
  const picked = await evaluate(`(() => {
    const b = document.querySelector('button.opt')
    if (!b) return 'NOT_FOUND'
    b.click()
    return 'OK'
  })()`)
  check('完形选项可作答', picked === 'OK', picked)
  await sleep(450)
  check('完形作答后出现判题结论', (await evaluate(`document.querySelector('.verdict')?.innerText || ''`)).length > 0)
  const optCount = await evaluate(`document.querySelectorAll('button.opt').length`)
  check('完形渲染出 4 个选项', optCount === 4, `opts=${optCount}`)

  // 翻到第 2 题：高亮必须跟着题号移动（这是「20 空共用一篇」最容易做错的地方）
  const n2 = await clickButton('下一题')
  if (n2 === 'OK') {
    const activeTxt2 = await evaluate(`document.querySelector('.material-blank.active')?.innerText || ''`)
    check('翻到第 2 题后高亮移到第 2 空', activeTxt2.trim() === '2', JSON.stringify(activeTxt2))
    check('翻页后长文仍是同一篇（未重新加载新篇）', (await evaluate(`document.querySelectorAll('.material-blank').length`)) === 20)
  } else {
    check('翻到第 2 题（下一题可点）', false, n2)
  }

  // 连续作答 + 前进，直到进入阅读理解（第 21 题）
  let landed = false
  for (let i = 0; i < 24; i++) {
    const no = await evaluate(`document.querySelector('.q-no')?.innerText || ''`)
    if (no.includes('第 21 题')) {
      landed = true
      break
    }
    if ((await evaluate(`!!document.querySelector('.verdict')`)) === false) {
      await evaluate(`(() => { const b = document.querySelector('button.opt'); if (b) b.click(); return !!b })()`)
      await sleep(120)
    }
    if ((await clickButton('下一题')) !== 'OK') break
  }
  check('连续作答后翻到阅读理解第 21 题', landed, `i=${landed}`)

  if (landed) {
    const stem = await evaluate(`document.querySelector('.q-stem')?.innerText || ''`)
    check('阅读题干是英文设问句（非空且无缺字）', (stem.match(/[A-Za-z]/g) ?? []).length >= 20, `${stem.length} 字: ${excerpt(stem, 90)}`)
    check('阅读理解长文同样已渲染', (await evaluate(`!!document.querySelector('details.material')`)) === true)
    const readBlanks = await evaluate(`document.querySelectorAll('.material-blank').length`)
    check('阅读长文没有空位标记（只有完形才有）', readBlanks === 0, `blanks=${readBlanks}`)
    const readLen = await evaluate(`document.querySelector('.material-body')?.innerText.length || 0`)
    check('阅读长文正文已渲染（> 800 字符）', readLen > 800, `len=${readLen}`)
    check('已换到另一篇长文（正文与完形那篇不同）', readLen !== clozeLen, `${clozeLen} vs ${readLen}`)
    check('阅读页无运行时报错', runtimeErrors().length === 0, runtimeErrors().join(' | '))
  }

  // 顶部品牌副标题必须由题库实际覆盖的试卷推导（曾经硬编码漏掉英语一）
  const t2 = await bodyText()
  check('顶栏试卷列表包含英语一', t2.includes('408 / 政治 / 英语一 / 数学一'), excerpt(t2, 90))
  check('顶栏题量为全库 1974 题', t2.includes('1974 题'), excerpt(t2, 90))
  const errs = runtimeErrors()
  check('英语一练习页无运行时报错', errs.length === 0, errs.join(' | '))
}

// [I] 408 综合应用题：OCR 补录题的小问拆分（缺图页模态里看最省事）
// 2022 / 2023 补录的那批是从 PDF 文本层抠出来的，小问靠正则还原 —— 属于「解析产物」，
// 必须在真实浏览器里确认拆出来的小问、分值、参考要点都真的渲染出来了。
section('I · 408 综合应用题（OCR 补录题的小问拆分）')
await goto('/missing')
{
  const head = await bodyText()
  check('缺图清单渲染出内容', head.includes('缺图反馈收集'), excerpt(head, 120))
  // 补录 2022/2023 应用题后，全库缺图从 33 涨到 40（多出的都是 PDF 里取不回的位图）
  check('缺图总数已含补录应用题（40 道）', head.includes('题库有 40 道题'), excerpt(head, 200))

  const opened = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.list-item')].find(x => (x.innerText || '').includes('2022-Q43'))
    if (!row) return 'NOT_FOUND'
    row.click()
    return 'OK'
  })()`)
  check('点开 2022-Q43（OCR 补录、5 小问）', opened === 'OK', opened)
  await sleep(500)

  const parts = await evaluate(`document.querySelectorAll('.applied-part').length`)
  check('OCR 题按小问渲染出 5 问', parts === 5, `parts=${parts}`)
  const nos = await evaluate(`[...document.querySelectorAll('.applied-no')].map(x => x.innerText.trim()).join(',')`)
  check('小问号连续 1）2）3）4）5）', nos === '1）,2）,3）,4）,5）', nos)
  const scoreTxt = await evaluate(`[...document.querySelectorAll('.applied-score')].map(x => x.innerText).join('|')`)
  const scored = (scoreTxt.match(/分/g) ?? []).length
  // 原始真题只给题目总分（43 题共 15 分），不给小问切分 —— 缺的时候宁可不标，也不编。
  check('小问分值要么全标、要么整题不标（不编造）', scored === 0 || scored === parts, `scored=${scored} parts=${parts}`)
  const hint = await evaluate(`document.querySelector('.applied-hint')?.innerText || ''`)
  check('题目总分与小问数对用户可见', hint.includes('满分 15 分') && hint.includes('共 5 问'), excerpt(hint, 120))
  const stems = await evaluate(`[...document.querySelectorAll('.applied-stem')].map(x => x.innerText.trim().length)`)
  check('5 个小问题干均非空（> 5 字）', stems.length === 5 && stems.every((n) => n > 5), stems)

  const openOne = await clickButton('展开参考要点')
  check('可展开参考要点', openOne === 'OK', openOne)
  const ansLen = await evaluate(`document.querySelector('.applied-answer')?.innerText.length || 0`)
  check('参考要点非空（> 30 字）', ansLen > 30, `len=${ansLen}`)
  const errs = runtimeErrors()
  check('缺图页无运行时报错', errs.length === 0, errs.join(' | '))
}

// [J] 综合应用题自评链路：小问 → 自评档位 → 落库掌握判定
// 这一条走的是完整练习会话，覆盖 gradeAnswer 的 applied 分支（0 / 0.5 / 1 求平均，≥0.6 视为掌握）。
section('J · 综合应用题自评（自评 → 掌握判定）')
await goto('/')
{
  await clickButton('408', 'startsWith')

  /**
   * 年份 chip 的语义是「在『全部』态下点某年 = 排除该年」，所以想只留一年，
   * 得把其余 15 个逐个点掉。用精确文案匹配，避免误碰「全部」和时长 chip。
   */
  const clickChip = async (label) => {
    const r = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button.chip')].find(x => (x.innerText || '').trim() === ${JSON.stringify(label)})
      if (!b) return 'NOT_FOUND'
      b.click()
      return 'OK'
    })()`)
    await sleep(90)
    return r
  }

  let excluded = 0
  for (const y of [2009, 2010, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]) {
    if ((await clickChip(String(y))) === 'OK') excluded++
  }
  for (const s of ['数据结构', '计算机组成原理', '操作系统']) await clickChip(s)
  // 时长 chip 也是 .chip.on，读选中状态时按「年份 / 科目」形状过滤掉它
  const picked = await evaluate(
    `[...document.querySelectorAll('.chip.on')].map(x => x.innerText.trim()).filter(t => /^\\d{4}$/.test(t) || ['数据结构','计算机组成原理','操作系统','计算机网络'].includes(t)).join(',')`,
  )
  check('筛选收敛到「2011 · 计算机网络」', picked === '2011,计算机网络', picked)

  const startTxt = await evaluate(
    `([...document.querySelectorAll('.start-btn')].map(x => x.innerText.replace(/\\s+/g, ' ')).find(t => t.includes('开始练习')) || '')`,
  )
  check('该筛选下池子 = 9 题（8 单选 + 1 应用题）', startTxt.includes('共 9 题'), startTxt)

  const started = await clickButton('开始练习', 'startsWith')
  check('点击「开始练习」成功', started === 'OK', started)

  let hit = false
  let skips = 0
  for (; skips < 12; skips++) {
    if ((await evaluate(`document.querySelectorAll('.applied-part').length`)) > 0) {
      hit = true
      break
    }
    if ((await clickButton('跳过')) !== 'OK') break
  }
  check('跳过前面 8 道单选后翻到综合应用题', hit, `skips=${skips}`)

  if (hit) {
    const parts = await evaluate(`document.querySelectorAll('.applied-part').length`)
    check('2011-a47 按小问渲染（4 问）', parts === 4, `parts=${parts}`)
    const hint = await evaluate(`document.querySelector('.applied-hint')?.innerText || ''`)
    check('题目总分与小问数对用户可见（9 分 · 4 问）', hint.includes('满分 9 分') && hint.includes('共 4 问'), excerpt(hint, 120))
    check(
      '每问 3 档自评（4 问 → 12 个按钮）',
      (await evaluate(`document.querySelectorAll('.applied-part .applied-levels').length`)) === 4 &&
        (await evaluate(`document.querySelectorAll('.level-btn').length`)) === 12,
    )
    check(
      '未自评完时提交按钮禁用（且提示还差几问）',
      (await evaluate(`document.querySelector('.submit-row .nav-btn.primary')?.disabled === true`)) === true &&
        (await evaluate(`document.querySelector('.submit-row .nav-btn.primary')?.innerText || ''`)).includes('还差'),
    )

    // 只答对 2 问「基本对」+ 1 问「部分对」+ 1 问没答对 → 得分率 (1+1+0.5+0)/4 = 0.625 ≥ 0.6
    const rated = await evaluate(`(() => {
      const parts = [...document.querySelectorAll('.applied-part')]
      const want = ['基本对', '基本对', '部分对', '没答对']
      let n = 0
      parts.forEach((p, i) => {
        const b = [...p.querySelectorAll('.level-btn')].find(x => (x.innerText || '').includes(want[i]))
        if (b) { b.click(); n++ }
      })
      return n
    })()`)
    check('4 问按 1/1/0.5/0 档位自评', rated === 4, `rated=${rated}`)
    await sleep(350)

    const submitTxt = await evaluate(`document.querySelector('.submit-row .nav-btn.primary')?.innerText || ''`)
    check('自评完成后按钮变为「提交自评」', submitTxt.includes('提交自评'), submitTxt)
    const submitted = await clickButton('提交自评')
    check('点击「提交自评」成功', submitted === 'OK', submitted)
    await sleep(500)

    const verdict = await evaluate(`document.querySelector('.verdict')?.innerText || ''`)
    check('得分率按小问平均算（1+1+0.5+0 → 63%）', verdict.includes('63%'), excerpt(verdict, 90))
    check('≥60% 判为已掌握', (await evaluate(`!!document.querySelector('.verdict.ok')`)) === true, excerpt(verdict, 60))
    check('提交后不再出现自评按钮（防重复提交）', (await evaluate(`document.querySelectorAll('.level-btn').length`)) === 0)
    const selfTxt = await evaluate(`[...document.querySelectorAll('.applied-self')].map(x => x.innerText).join('|')`)
    check('提交后每问回显自评档位', selfTxt.includes('基本对') && selfTxt.includes('部分对') && selfTxt.includes('没答对'), selfTxt)
    // 这是会话最后一题，所以「下一题」不渲染 —— 要看的是作答后的进度与对错计数
    const head = await bodyText()
    check('作答后进度记到「第 9 / 9 题 · 已答 1」', head.includes('第 9 / 9 题') && head.includes('已答 1'), excerpt(head, 140))
    const errs = runtimeErrors()
    check('应用题练习页无运行时报错', errs.length === 0, errs.join(' | '))
  }
}

// ---------- 收尾 ----------

lines.push('', `RESULT: ${pass} pass / ${fail} fail`)
writeFileSync(REPORT, lines.join('\n'), 'utf8')
// 只在控制台打一行 ASCII 摘要：中文经 PowerShell 管道会变乱码，明细一律看报告文件
console.log(`SMOKE: ${pass} pass / ${fail} fail -> ${REPORT}`)
ws.close()
process.exit(fail === 0 ? 0 : 1)
