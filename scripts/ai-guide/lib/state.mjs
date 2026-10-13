/**
 * 幂等状态（脚本目录下的 .ai-guide-state.json）
 * ============================================================
 * 题库会持续扩充（历史上已扩过 P5 英语一 560 题），管线必须能增量续跑。
 * 规则：输入 hash 不变则跳过；题干被修正过 → hash 变 → 自动重跑该题。
 *
 * 该文件不进版本库（含本地路径与批次噪声），已在 .gitignore 中忽略。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const STATE_FILE = 'scripts/ai-guide/.ai-guide-state.json'

/** 稳定 hash：把参与生成的输入拼起来取 sha1 前 12 位 */
export function hashInput(...parts) {
  const h = crypto.createHash('sha1')
  for (const p of parts) h.update(typeof p === 'string' ? p : JSON.stringify(p ?? null))
  h.update('\u0000')
  return h.digest('hex').slice(0, 12)
}

export class State {
  constructor(file = STATE_FILE) {
    this.file = path.resolve(file)
    this.data = { meta: {} }
    try {
      if (fs.existsSync(this.file)) {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        this.data.meta ||= {}
      }
    } catch {
      // 状态文件损坏时从空状态重来（最坏情况是重跑一遍，不会污染产物）
      this.data = { meta: {} }
    }
    this.dirty = false
  }

  /** 该输入是否已经在当前版本下处理过 */
  isFresh(stage, key, hash, version) {
    const entry = this.data[stage]?.[key]
    if (!entry || entry.hash !== hash) return false
    if (version && entry.version !== version) return false
    return true
  }

  mark(stage, key, hash, version) {
    this.data[stage] ||= {}
    this.data[stage][key] = { hash, version, at: new Date().toISOString().slice(0, 10) }
    this.dirty = true
  }

  /** 清掉某阶段里已不在输入集合中的键（题目被删除时） */
  prune(stage, validKeys) {
    const set = new Set(validKeys)
    const bucket = this.data[stage] || {}
    for (const k of Object.keys(bucket)) {
      if (!set.has(k)) { delete bucket[k]; this.dirty = true }
    }
  }

  setMeta(k, v) { this.data.meta[k] = v; this.dirty = true }
  getMeta(k) { return this.data.meta[k] }

  save() {
    if (!this.dirty) return false
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    this.dirty = false
    return true
  }

  summary(stage) {
    const b = this.data[stage] || {}
    return { keys: Object.keys(b).length, latest: Object.values(b).map((x) => x.at).sort().pop() || '-' }
  }
}
