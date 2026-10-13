/**
 * AI 指引加载器
 * ============================================================
 * 三条硬约束（都来自这个项目已经踩过的坑）：
 *
 * ① **纯静态站，运行时不调模型。**
 *    指引全部在构建期由 scripts/ai-guide 预生成成 JSON，前端只做查表。
 *    没有任何「调用大模型」的运行时路径，因此也就没有 key、没有超时、没有费用。
 *
 * ② **必须缓存 Promise，不是缓存结果。**
 *    练习页一屏多题、每题都可能触发加载；如果只缓存已完成的 Promise 结果，
 *    首屏会并发发出多次同一个请求（汇率台那次的教训）。这里把未完成的 Promise
 *    也放进 Map，同一个 URL 全局只发一次。
 *
 * ③ **静默降级。**
 *    指引是增强项，不是主流程。加载失败 / 文件不存在 / JSON 坏了 —— 一律 resolve null，
 *    绝不 throw、绝不能把练习页带崩。宁可没有指引，不可做不成题。
 *
 * 部署注意：vite 的 base 是 './'，所以路径必须相对 document.baseURI 解析，
 * 不能用绝对路径 '/guide/...'（子路径部署会 404）。
 */

import type { Question, Subject } from '../types'

// ============================================================
// 数据结构
// ============================================================

export interface KgNode {
  id: string
  name: string
  chapter: string
  summary: string
  prereq: string[]
  keywords: string[]
  weight: number
}

export interface KnowledgeGraph {
  version: string
  paper: string
  subject: string
  nodeCount: number
  maxDepth: number
  nodes: KgNode[]
}

export interface DiagItem {
  key: string
  /** 已锚定：讲错误路径的诊断 */
  why?: string
  /** 未锚定：提问式引导 */
  probe?: string
  /** 逐字证据（来自题库解析原文） */
  evidence?: { quote: string; kind: 'conclusion' | 'criterion' }
  grounded: boolean
  /** 引用的母题陷阱 id（存在于母题陷阱库中才会保留） */
  trap?: string
}

export interface GuideEntry {
  topic: string | null
  mt: string | null
  grounded: boolean
  /** explanation = 有可信解析、诊断已锚定；probe = 解析不可信，只给提问 */
  src: 'explanation' | 'probe'
  d: Record<string, DiagItem>
}

export interface GuideShard {
  version: string
  paper: string
  subject: string
  generator: string
  stats: {
    questions: number
    items: number
    grounded: number
    probe: number
    conclusion: number
    criterion: number
    topics: number
    mothers: number
  }
  questions: Record<string, GuideEntry>
}

export interface Mother {
  id: string
  name: string
  topics: string[]
  skeleton: string[]
  traps: Record<string, { label: string; why?: string }>
}

/** 解析体检结果：题库里被判定不可作为锚定源的题（含原因） */
export interface ExpWarn {
  status: 'answer-conflict' | 'dirty' | 'content-mismatch' | 'empty'
  reason: string
}

// ============================================================
// 资源表：新增科目只需在这里加一行
// ============================================================

interface GuideResource {
  subject: Subject
  kg: string
  diag: string
  mothers: string
  warn: string
  tags: string
}

/**
 * 目前只做了数据结构一科（试点）。
 * 其他科目没有对应文件，加载器会静默返回 null，界面上不出现指引区块。
 */
const RESOURCES: GuideResource[] = [
  {
    subject: '数据结构',
    kg: 'guide/kg-408.json',
    diag: 'guide/diag/408-ds.json',
    mothers: 'guide/mothers-408-ds.json',
    warn: 'guide/exp-warn-408-ds.json',
    tags: 'guide/tags-408-ds.json',
  },
]

function resourceFor(subject: string): GuideResource | undefined {
  return RESOURCES.find((r) => r.subject === subject)
}

// ============================================================
// 加载（Promise 缓存 + 静默降级）
// ============================================================

/** 缓存的是 Promise 本身，不是 Promise 的结果 —— 这样并发的首个请求之后的都复用它 */
const cache = new Map<string, Promise<unknown>>()

function loadJson<T>(rel: string): Promise<T | null> {
  const cached = cache.get(rel) as Promise<T | null> | undefined
  if (cached) return cached

  const p = (async (): Promise<T | null> => {
    try {
      const url = new URL(rel, document.baseURI).href
      const resp = await fetch(url, { cache: 'force-cache' })
      if (!resp.ok) return null
      return (await resp.json()) as T
    } catch {
      // 静默降级：指引加载不了不影响做题
      return null
    }
  })()

  cache.set(rel, p)
  return p
}

const kgCache = new Map<string, Promise<KnowledgeGraph | null>>()
const shardCache = new Map<string, Promise<GuideShard | null>>()
const motherCache = new Map<string, Promise<Map<string, Mother> | null>>()
const warnCache = new Map<string, Promise<Record<string, ExpWarn> | null>>()
const tagCache = new Map<string, Promise<Record<string, TagRow> | null>>()

export function loadKg(subject: string): Promise<KnowledgeGraph | null> {
  const r = resourceFor(subject)
  if (!r) return Promise.resolve(null)
  let p = kgCache.get(subject)
  if (!p) { p = loadJson<KnowledgeGraph>(r.kg); kgCache.set(subject, p) }
  return p
}

export function loadShard(subject: string): Promise<GuideShard | null> {
  const r = resourceFor(subject)
  if (!r) return Promise.resolve(null)
  let p = shardCache.get(subject)
  if (!p) { p = loadJson<GuideShard>(r.diag); shardCache.set(subject, p) }
  return p
}

export function loadMothers(subject: string): Promise<Map<string, Mother> | null> {
  const r = resourceFor(subject)
  if (!r) return Promise.resolve(null)
  let p = motherCache.get(subject)
  if (!p) {
    p = loadJson<{ mothers: Mother[] }>(r.mothers).then((j) =>
      j?.mothers ? new Map(j.mothers.map((m) => [m.id, m])) : null,
    )
    motherCache.set(subject, p)
  }
  return p
}

export function loadExpWarn(subject: string): Promise<Record<string, ExpWarn> | null> {
  const r = resourceFor(subject)
  if (!r) return Promise.resolve(null)
  let p = warnCache.get(subject)
  if (!p) { p = loadJson<Record<string, ExpWarn>>(r.warn); warnCache.set(subject, p) }
  return p
}

/** 题号 → { topic, mt } 的标注表 */
export interface TagRow { topic: string | null; mt: string | null; by?: string }

export function loadTags(subject: string): Promise<Record<string, TagRow> | null> {
  const r = resourceFor(subject)
  if (!r) return Promise.resolve(null)
  let p = tagCache.get(subject)
  if (!p) { p = loadJson<Record<string, TagRow>>(r.tags); tagCache.set(subject, p) }
  return p
}

/** 该科目是否配置了指引资源（用于决定要不要显示入口，避免无谓请求） */
export function hasGuide(subject: string): boolean {
  return !!resourceFor(subject)
}

// ============================================================
// 组装视图
// ============================================================

export interface GuideView {
  topic: KgNode | null
  /** 前置知识链：从最基础的祖先到直接前置，已去重并按图深度排序 */
  prereqs: KgNode[]
  mother: Mother | null
  entry: GuideEntry | null
  /** 该题解析被体检判为不可用时的原因（用于在解析旁给出提示） */
  expWarn: ExpWarn | null
}

/**
 * 取某知识点在图上的祖先链（不含自身）。
 * 用 BFS + 去重，并按到起点的距离分层排序 —— 学生需要的是「先学什么」的顺序，
 * 而不是一堆散乱的前置。图是 DAG（构建期已做拓扑校验），但这里仍然做 visited 保护，
 * 避免未来数据出错时把页面卡死。
 */
export function ancestorChain(kg: KnowledgeGraph, topicId: string, maxNodes = 8): KgNode[] {
  const byId = new Map(kg.nodes.map((n) => [n.id, n]))
  const start = byId.get(topicId)
  if (!start) return []

  const seen = new Set<string>([topicId])
  const levels: KgNode[][] = []
  let frontier = start.prereq.filter((p) => byId.has(p))
  let guard = 0
  while (frontier.length && levels.length < 6 && guard++ < 32) {
    const level: KgNode[] = []
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      const n = byId.get(id)
      if (n) level.push(n)
      for (const p of byId.get(id)?.prereq || []) if (!seen.has(p)) next.push(p)
    }
    if (level.length) levels.push(level)
    frontier = next
  }
  // 最基础的祖先排在最前
  const out = levels.reverse().flat()
  return out.slice(0, maxNodes)
}

/**
 * 一次拿齐某题的全部指引素材。任一资源缺失都不影响其余部分可用。
 *
 * 外键优先级（刻意从「越靠近源数据」到「越靠近派生物」）：
 *   题目自带字段  >  标注表（构建期产出）  >  诊断分片里的冗余字段
 * 这样将来把标注正式写回题库 JSON 时，前端一行都不用改。
 */
export async function loadGuideFor(q: Question): Promise<GuideView | null> {
  if (!hasGuide(q.subject)) return null

  const [kg, shard, tags, mothers, warns] = await Promise.all([
    loadKg(q.subject),
    loadShard(q.subject),
    loadTags(q.subject),
    loadMothers(q.subject),
    loadExpWarn(q.subject),
  ])

  const entry = shard?.questions?.[q.id] || null
  const tagRow = tags?.[q.id] || null
  const mtId = q.mt || tagRow?.mt || entry?.mt || null
  const topicId = q.topics?.[0] || tagRow?.topic || entry?.topic || null

  const mother = mtId && mothers ? mothers.get(mtId) || null : null
  const topicNode = kg && topicId ? kg.nodes.find((n) => n.id === topicId) || null : null
  const expWarn = warns?.[q.id] || null

  if (!entry && !mother && !topicNode && !expWarn) return null

  return {
    topic: topicNode,
    prereqs: kg && topicNode ? ancestorChain(kg, topicNode.id) : [],
    mother,
    entry,
    expWarn,
  }
}
