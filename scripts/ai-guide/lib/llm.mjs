/**
 * LLM 调用抽象层
 * ============================================================
 * 两个 provider，接口完全一致，产出格式也一致：
 *
 *   http —— 真实调用（OpenAI 兼容协议：DeepSeek / 通义千问 / 其他都走这个）
 *           API key 只从**环境变量**读，绝不写入任何文件或产物。
 *
 *   file —— 从本地 JSON 读「模型响应」。这不是玩具，它有三个真实用途：
 *           ① 离线开发 / 回归测试：没有 key 也能验证整条管线与校验规则；
 *           ② 人工审核：审核者改这个文件就等于改产物，无需碰代码；
 *           ③ **先定义质量标准再跑真实模型**：把「合格的输出长什么样」
 *              固化成 fixture，之后换模型只需对比通过率，不必重新讨论标准。
 *
 * 记账：所有调用累计 token 用量，结束时打印成本估算（便于控制 §6 的预算）。
 */

import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 120_000

// ============================================================
// http provider（OpenAI 兼容）
// ============================================================

function makeHttpProvider(cfg) {
  const baseURL = (cfg.baseURL || process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = cfg.model || process.env.LLM_MODEL || 'deepseek-chat'
  const apiKey = cfg.apiKey || process.env.LLM_API_KEY || ''
  const priceIn = Number(cfg.priceIn ?? process.env.LLM_PRICE_IN ?? 0)   // ¥ / 百万 token
  const priceOut = Number(cfg.priceOut ?? process.env.LLM_PRICE_OUT ?? 0)
  const usage = { calls: 0, in: 0, out: 0, retries: 0, failures: 0 }

  if (!apiKey) {
    throw new Error(
      'http provider 需要 API key：请设置环境变量 LLM_API_KEY（不会写入任何文件）。\n' +
      '  例：$env:LLM_API_KEY="sk-..."; $env:LLM_BASE_URL="https://api.deepseek.com"; $env:LLM_MODEL="deepseek-chat"'
    )
  }

  async function once(messages, { maxTokens = 4096, temperature = 0.2, jsonMode = true } = {}) {
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }
    if (jsonMode) body.response_format = { type: 'json_object' }

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), cfg.timeoutMs || DEFAULT_TIMEOUT_MS)
    try {
      const resp = await fetch(`${baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ac.signal,
      })
      if (!resp.ok) {
        const t = await resp.text().catch(() => '')
        const err = new Error(`HTTP ${resp.status} ${t.slice(0, 200)}`)
        err.status = resp.status
        throw err
      }
      const j = await resp.json()
      const text = j.choices?.[0]?.message?.content ?? ''
      const u = j.usage || {}
      usage.calls++
      usage.in += u.prompt_tokens || 0
      usage.out += u.completion_tokens || 0
      return text
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    name: `http:${model}`,
    usage,
    cost() {
      return +(((usage.in / 1e6) * priceIn) + ((usage.out / 1e6) * priceOut)).toFixed(4)
    },
    async ask(messages, opts = {}) {
      const maxRetry = opts.maxRetry ?? 3
      let lastErr
      for (let i = 0; i <= maxRetry; i++) {
        try {
          return await once(messages, opts)
        } catch (e) {
          lastErr = e
          // 4xx（除 429）是请求本身的问题，重试无意义
          if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) throw e
          if (i < maxRetry) {
            usage.retries++
            await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
          }
        }
      }
      usage.failures++
      throw lastErr
    },
  }
}

// ============================================================
// file provider（离线 / 人工审核 / 回归）
// ============================================================

function makeFileProvider(cfg) {
  const file = path.resolve(cfg.responsesFile)
  if (!fs.existsSync(file)) {
    throw new Error(`file provider 找不到响应文件：${file}`)
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const usage = { calls: 0, in: 0, out: 0, missing: 0 }
  const missingKeys = []

  return {
    name: `file:${path.basename(file)}`,
    usage,
    missingKeys,
    cost() { return 0 },
    async ask(messages, opts = {}) {
      const key = opts.requestKey
      if (!key) throw new Error('file provider 需要 opts.requestKey 定位预置响应')
      usage.calls++
      const hit = data[key]
      if (hit === undefined) {
        usage.missing++
        missingKeys.push(key)
        // 缺失不是错误 —— 生成脚本会跳过该批，并在报告里列出
        return null
      }
      const text = typeof hit === 'string' ? hit : JSON.stringify(hit)
      usage.out += Math.ceil(text.length / 2)
      return text
    },
  }
}

// ============================================================
// 工厂 + 并发池
// ============================================================

export function createProvider(cfg = {}) {
  const kind = cfg.provider || process.env.LLM_PROVIDER || 'file'
  if (kind === 'http') return makeHttpProvider(cfg)
  if (kind === 'file') return makeFileProvider(cfg)
  throw new Error(`未知 provider: ${kind}（可选 http | file）`)
}

/**
 * 简易并发池。LLM 调用的瓶颈在服务端限流，
 * 默认并发 2 已经能吃掉大部分等待时间，且不会触发 429。
 */
export async function pool(items, worker, concurrency = 2) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * 从模型返回里稳健地取出 JSON。
 * 真实模型经常把 JSON 包在 ```json 围栏里，或在前后加一句客套话。
 */
export function parseJsonLoose(text) {
  if (text == null) return null
  let t = String(text).trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  try { return JSON.parse(t) } catch { /* 继续尝试截取 */ }
  const first = Math.min(...[t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0))
  const lastBrace = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  if (Number.isFinite(first) && lastBrace > first) {
    try { return JSON.parse(t.slice(first, lastBrace + 1)) } catch { /* 放弃 */ }
  }
  return null
}

/** 成本估算输出（¥），配合 §6 的成本表使用 */
export function usageReport(provider) {
  const u = provider.usage
  return {
    provider: provider.name,
    calls: u.calls,
    tokensIn: u.in,
    tokensOut: u.out,
    retries: u.retries || 0,
    failures: u.failures || 0,
    missing: u.missing || 0,
    costCNY: provider.cost(),
  }
}
