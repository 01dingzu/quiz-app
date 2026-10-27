import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz, isArchivedAttempt } from '../store/quizStore'
import { LESSONS } from '../lessons'
import { PAPER_ORDER, PAPER_KEY, PAPER_LABEL, PAPER_GLYPH } from '../lib/paper'
import type { Paper } from '../types'

/**
 * 按考点组题组件：勾选若干考点 → 按规则抽题 → 一键开局进真实练习流程。
 *
 * 单一实现、两处复用：
 *   - /learn/compose 独立页（standalone：试卷切换胶囊 + 吸底操作条）
 *   - 首页练习设置卡（嵌入：paper 固定，随试卷切换重置选择）
 *
 * 抽题规则：题目范围（新题＋错题 / 全部 / 只做错题）× 每考点题数上限 ×
 * 顺序（按考点顺序 / 随机打乱）；已归档（答对且从没错过的）题自动跳过。
 * 组出的题走 startSessionWithIds，判分 / SRS / 错题本 / 统计复用现有流程。
 */

type Scope = 'todo' | 'all' | 'wrong'

const SCOPE_LABEL: Record<Scope, string> = {
  all: '全部题',
  todo: '新题＋错题（未掌握的）',
  wrong: '只做错题',
}

const PER_OPTIONS = [
  { v: 0, label: '题数不限' },
  { v: 3, label: '每考点 3 题' },
  { v: 5, label: '每考点 5 题' },
  { v: 10, label: '每考点 10 题' },
]

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface LessonRow {
  lesson: (typeof LESSONS)[number]
  /** 归档排除后的可用题数 */
  total: number
  done: number
  wrong: number
}

interface Props {
  /** 固定试卷（嵌入模式，如首页练习卡）；缺省 = 独立模式，可切试卷 */
  paper?: Paper
  /** 独立模式：显示试卷切换胶囊、操作条吸底 */
  standalone?: boolean
}

export default function LessonComposer({ paper, standalone = false }: Props) {
  const nav = useNavigate()
  const attempts = useQuiz((s) => s.attempts)
  const unarchived = useQuiz((s) => s.unarchived)
  const startSessionWithIds = useQuiz((s) => s.startSessionWithIds)

  const [only, setOnly] = useState<Paper | 'all'>(paper ?? 'all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<Scope>('all')
  const [per, setPer] = useState(0)
  const [mix, setMix] = useState(false)

  // 嵌入模式：跟随外部试卷切换，并清空跨试卷的残留选择
  useEffect(() => {
    if (paper) {
      setOnly(paper)
      setSel(new Set())
    }
  }, [paper])

  /** 全部考点的作答统计（归档排除后） */
  const rows = useMemo<LessonRow[]>(() => {
    return LESSONS.map((l) => {
      const alive = l.practice.filter(
        (q) => !isArchivedAttempt(attempts[q.id]) || unarchived.includes(q.id),
      )
      return {
        lesson: l,
        total: alive.length,
        done: alive.filter((q) => attempts[q.id]).length,
        wrong: alive.filter((q) => attempts[q.id] && !attempts[q.id].correct).length,
      }
    })
  }, [attempts, unarchived])

  /** 当前范围下该考点能组出几题 */
  const remainOf = (r: LessonRow) =>
    scope === 'wrong' ? r.wrong : scope === 'todo' ? r.total - r.done + r.wrong : r.total

  /** 试卷 → 学科分组（嵌入模式只出固定试卷） */
  const papers = useMemo(() => {
    const byPaper = new Map<Paper, LessonRow[]>()
    for (const r of rows) {
      if (!byPaper.has(r.lesson.paper)) byPaper.set(r.lesson.paper, [])
      byPaper.get(r.lesson.paper)!.push(r)
    }
    return PAPER_ORDER.filter((p) => byPaper.has(p)).map((p) => {
      const items = byPaper.get(p)!
      const order: string[] = []
      const by = new Map<string, LessonRow[]>()
      for (const r of items) {
        if (!by.has(r.lesson.subject)) {
          by.set(r.lesson.subject, [])
          order.push(r.lesson.subject)
        }
        by.get(r.lesson.subject)!.push(r)
      }
      return { paper: p, subjects: order.map((k) => ({ subject: k, items: by.get(k)! })) }
    })
  }, [rows])

  const shown = only === 'all' ? papers : papers.filter((p) => p.paper === only)

  /** 组题结果：按选中考点逐个抽题，mix 时全局打乱 */
  const composed = useMemo(() => {
    const ids: string[] = []
    for (const l of LESSONS) {
      if (!sel.has(l.id)) continue
      let qs = l.practice.filter(
        (q) => !isArchivedAttempt(attempts[q.id]) || unarchived.includes(q.id),
      )
      if (scope === 'todo') qs = qs.filter((q) => !attempts[q.id] || !attempts[q.id].correct)
      else if (scope === 'wrong') qs = qs.filter((q) => attempts[q.id] && !attempts[q.id].correct)
      let picked = qs.map((q) => q.id)
      if (per > 0 && picked.length > per) {
        picked = (mix ? shuffled(picked) : picked).slice(0, per)
      }
      ids.push(...picked)
    }
    return mix ? shuffled(ids) : ids
  }, [sel, scope, per, mix, attempts, unarchived])

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const toggleGroup = (ids: string[], on: boolean) =>
    setSel((s) => {
      const n = new Set(s)
      for (const id of ids) {
        if (on) n.add(id)
        else n.delete(id)
      }
      return n
    })

  const start = () => {
    if (composed.length === 0) return
    startSessionWithIds(composed)
    nav('/practice')
  }

  const options = (
    <div className="compose-opts">
      <div className="compose-opts-label">题目范围</div>
      {(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => (
        <button
          key={k}
          className={'pf-chip' + (scope === k ? ' on' : '')}
          onClick={() => setScope(k)}
        >
          {SCOPE_LABEL[k]}
        </button>
      ))}
      <div className="compose-opts-label">每考点题数</div>
      {PER_OPTIONS.map((o) => (
        <button
          key={o.v}
          className={'pf-chip' + (per === o.v ? ' on' : '')}
          onClick={() => setPer(o.v)}
        >
          {o.label}
        </button>
      ))}
      <div className="compose-opts-label">顺序</div>
      <button className={'pf-chip' + (!mix ? ' on' : '')} onClick={() => setMix(false)}>
        按考点顺序
      </button>
      <button className={'pf-chip' + (mix ? ' on' : '')} onClick={() => setMix(true)}>
        随机打乱
      </button>
    </div>
  )

  const sections = shown.map((p) => (
    <section
      key={p.paper}
      className={standalone ? 'paper-block paper-' + PAPER_KEY[p.paper] : undefined}
    >
      {p.subjects.map((g) => {
        const gIds = g.items.map((r) => r.lesson.id)
        const gOn = gIds.length > 0 && gIds.every((id) => sel.has(id))
        return (
          <div key={g.subject}>
            <div className="learn-group">
              <span className="learn-group-t">
                <i className="learn-group-dot" />
                {g.subject}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="learn-group-n">{gIds.length} 个考点</span>
                <button className="compose-mini" onClick={() => toggleGroup(gIds, !gOn)}>
                  {gOn ? '清空本组' : '全选本组'}
                </button>
              </span>
            </div>
            {g.items.map((r) => {
              const l = r.lesson
              const remain = remainOf(r)
              return (
                <div
                  key={l.id}
                  className={'compose-row' + (sel.has(l.id) ? ' on' : '')}
                  onClick={() => toggle(l.id)}
                >
                  <span className="compose-box">{sel.has(l.id) ? '✓' : ''}</span>
                  <span className="compose-row-t">
                    <span className="compose-row-title">{l.title}</span>
                    <span className="compose-row-sub">
                      可用 {r.total} 题 · 已做 {r.done} · 错题 {r.wrong}
                    </span>
                  </span>
                  <span className="compose-row-n">
                    可组 {per > 0 ? Math.min(per, remain) : remain} 题
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </section>
  ))

  const bar = (
    <div className={'compose-bar' + (standalone ? ' compose-bar-sticky' : '')}>
      <div className="compose-bar-info">
        已选 {sel.size} 个考点 · 组出 {composed.length} 道题
        <small>
          {SCOPE_LABEL[scope]} · {per > 0 ? `每考点 ≤ ${per} 题` : '题数不限'} ·{' '}
          {mix ? '随机打乱' : '按考点顺序'} · 已归档的题自动跳过
        </small>
      </div>
      {sel.size > 0 && (
        <button className="compose-mini" onClick={() => setSel(new Set())}>
          清空
        </button>
      )}
      <button className="compose-start" disabled={composed.length === 0} onClick={start}>
        {composed.length === 0 ? '先勾选考点' : `开始练习 · ${composed.length} 题`}
      </button>
    </div>
  )

  if (!standalone) {
    return (
      <>
        <div className="sec-title">
          按考点组题（当前试卷：{PAPER_LABEL[paper ?? '408']}）
        </div>
        <div className="review-sub" style={{ margin: '0 0 12px' }}>
          勾选一个或多个考点，只刷这些考点的练习题；可选范围与题数，支持跨考点混编。
        </div>
        {options}
        <div style={{ marginTop: 10 }}>{sections}</div>
        {bar}
      </>
    )
  }

  return (
    <>
      <div className="paper-filter">
        <button
          className={'pf-chip' + (only === 'all' ? ' on on-all' : '')}
          onClick={() => setOnly('all')}
        >
          全部
          <span className="pf-n">{papers.length}</span>
        </button>
        {papers.map((p) => (
          <button
            key={p.paper}
            className={'pf-chip paper-' + PAPER_KEY[p.paper] + (only === p.paper ? ' on' : '')}
            onClick={() => setOnly(p.paper)}
          >
            <span className="pf-glyph">{PAPER_GLYPH[p.paper]}</span>
            {PAPER_LABEL[p.paper]}
          </button>
        ))}
      </div>

      <div className="card learn-head">
        <div className="sec-title" style={{ marginTop: 0 }}>
          按考点组题
        </div>
        <div className="review-sub">
          勾选考点自由组卷：可选只刷未掌握的题（新题＋错题）、限制每考点题数、随机打乱顺序。
          组好的题进真实练习流程，判分、错题本、SRS 复习照常生效。
        </div>
        {options}
      </div>

      {sections}
      {bar}
    </>
  )
}
