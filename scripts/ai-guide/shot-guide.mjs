/**
 * AI 指引面板 · 视觉抽检截图
 * ============================================================
 * 为什么单独写一个：设计文档 §7 把 R1（内容错误）列为「会造成实际伤害」的风险，
 * 并明确要求人工抽检 —— 每条已锚定的诊断都要有人看过。而抽检的瓶颈从来不是
 * 「想看」，是「翻到那一步太麻烦」：要开站、切卷、筛年份科目、答题。
 *
 * 这个脚本把那一串动作压成一条命令，直接产出可看的 PNG：
 *   node scripts/ai-guide/shot-guide.mjs
 *
 * 默认截两张，正好是两条互斥路径各一张：
 *   guide-2011-ds.png  路径 G —— 有可信解析，诊断带「引用原文 / 依判据推得」徽标
 *   guide-2023-ds.png  路径 P —— 解析被体检判不可用，打警示条 + 只给自查问题
 *
 * 用法与环境变量：同 smoke-cdp.mjs（SMOKE_BASE / CDP_PORT / SMOKE_CHROME）。
 * 需先另开 `npm run preview`（默认 http://localhost:4173）。
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9334)
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const OUT_DIR = new URL('../../docs/shots/', import.meta.url)

// 手机竖屏：这是个移动端优先的 PWA，用桌面宽度截出来的排版没有参考价值
const VIEWPORT = { width: 430, height: 932, deviceScaleFactor: 2 }

const CHROME_CANDIDATES = [
  process.env.SMOKE_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

async function probeCdp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    if (r.ok) return await r.json()
  } catch {
    /* 还没起来 */
  }
  return null
}

async function waitForCdp(ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const v = await probeCdp()
    if (v) return v
    await sleep(250)
  }
  return null
}

let chromeProc = null
let profileDir = null
let version = await waitForCdp(1000)
if (!version) {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!exe) throw new Error(`找不到可用的 Chrome/Edge，试过：${CHROME_CANDIDATES.join(' / ')}`)
  profileDir = mkdtempSync(join(tmpdir(), 'qb-shot-'))
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
  chromeProc.stderr.on('data', () => {})
  version = await waitForCdp(25000)
  if (!version) throw new Error(`自行启动的 Chrome 未能开放 CDP 端口 ${PORT}`)
}
console.log(`chrome: ${version.Browser}`)

function cleanup() {
  if (chromeProc) { try { chromeProc.kill() } catch { /* 已退出 */ } }
  if (profileDir) { try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* 占用忽略 */ } }
}
process.on('exit', cleanup)

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
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id == null) return
  const p = pending.get(m.id)
  if (!p) return
  pending.delete(m.id)
  if (m.error) p.reject(new Error(JSON.stringify(m.error)))
  else p.resolve(m.result)
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
await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: true })

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
  if (r.exceptionDetails) {
    throw new Error(`evaluate 抛错: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`)
  }
  return r.result.value
}

async function goto(hashPath) {
  await send('Page.navigate', { url: `${BASE}/#${hashPath}` })
  await sleep(1500)
}

async function clickButton(label, mode = 'includes') {
  const r = await evaluate(`(() => {
    const bs = [...document.querySelectorAll('button')]
    const b = bs.find(x => {
      const t = (x.innerText || '').trim()
      return ${mode === 'startsWith' ? `t.startsWith(${JSON.stringify(label)})` : `t.includes(${JSON.stringify(label)})`}
    })
    if (!b) return 'NOT_FOUND'
    if (b.disabled) return 'DISABLED'
    b.click()
    return 'OK'
  })()`)
  await sleep(450)
  return r
}

async function clickChip(label) {
  const r = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button.chip')].find(x => (x.innerText || '').trim() === ${JSON.stringify(String(label))})
    if (!b) return 'NOT_FOUND'
    b.click()
    return 'OK'
  })()`)
  await sleep(70)
  return r
}

/** 截图：先把目标元素滚到视口顶部，再整页截 —— 让产物里能同时看到题干与指引面板 */
async function shoot(name, scrollTo) {
  if (scrollTo) {
    await evaluate(`document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: 'start' })`)
    await sleep(400)
  }
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 680, height: 1800, scale: 1 },
  })
  mkdirSync(OUT_DIR, { recursive: true })
  const file = new URL(name, OUT_DIR)
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  console.log(`  -> docs/shots/${name}`)
}

/** 走一遍：切 408 → 只留某年某科 → 开始练习 → 展开母题骨架 → 作答（触发诊断披露） */
async function captureOne({ year, keepChip, name, peek }) {
  console.log(`${year} · ${keepChip}`)
  await goto('/')
  await clickButton('408', 'startsWith')

  const ALL_YEARS = [2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]
  for (const y of ALL_YEARS) if (String(y) !== String(year)) await clickChip(y)
  for (const s of ['数据结构', '计算机组成原理', '操作系统', '计算机网络']) {
    if (s !== keepChip) await clickChip(s)
  }

  const picked = await evaluate(
    `[...document.querySelectorAll('.chip.on')].map(x => x.innerText.trim()).filter(t => /^\\d{4}$/.test(t) || ['数据结构','计算机组成原理','操作系统','计算机网络'].includes(t)).join(',')`,
  )
  console.log(`  筛选 = ${picked}`)
  if (picked !== `${year},${keepChip}`) throw new Error('筛选未收敛，截图会不对应')

  const started = await clickButton('开始练习', 'startsWith')
  if (started !== 'OK') throw new Error(`开始练习失败：${started}`)
  await sleep(1000)

  const hasGuide = await evaluate(`!!document.querySelector('.guide')`)
  if (!hasGuide) throw new Error('该题没有渲染出指引面板')

  if (peek) {
    // 作答前先展开母题骨架，顺便留下骨架的视觉记录
    const peeked = await clickButton('想不出来？看解题骨架')
    console.log(`  母题骨架展开：${peeked}`)
  }

  const opted = await evaluate(`(() => {
    const b = document.querySelector('button.opt')
    if (!b) return 'NOT_FOUND'
    b.click()
    return 'OK'
  })()`)
  if (opted !== 'OK') throw new Error(`作答失败：${opted}`)
  await sleep(900)

  const badges = await evaluate(`[...document.querySelectorAll('.guide-list .g-badge')].map(x => x.innerText.trim()).join(' / ')`)
  const warn = await evaluate(`!!document.querySelector('.guide-warn')`)
  console.log(`  徽标：[${badges}]  警示条：${warn}`)

  await shoot(name, '.guide')
}

await captureOne({ year: 2011, keepChip: '数据结构', name: 'guide-2011-ds.png', peek: true })
await captureOne({ year: 2023, keepChip: '数据结构', name: 'guide-2023-ds.png', peek: false })

console.log('done')
ws.close()
process.exit(0)
