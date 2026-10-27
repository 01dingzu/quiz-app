import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz } from '../store/quizStore'
import { LESSONS } from '../lessons'
import {
  PAPER_ORDER,
  PAPER_KEY,
  PAPER_LABEL,
  PAPER_GLYPH,
  PAPER_HINT,
  paperClass,
} from '../lib/paper'
import type { Paper } from '../types'

/**
 * 考点列表页：每个考点一张卡，进度由该考点练习题的真实作答记录算出
 * （不手动打卡 —— 做对几题、正确率多少，全来自 attempts）。
 *
 * 层级：试卷（数学一 / 408 / 政治）→ 学科（高数 / 数据结构 / 马原 …）→ 考点卡。
 * 每套试卷一套配色（左侧色条 + 标签），一眼能分清「数学」和「计算机」，
 * 顶部胶囊可按试卷过滤。
 */

export default function Learn() {
  const nav = useNavigate()
  const attempts = useQuiz((s) => s.attempts)
  const [only, setOnly] = useState<Paper | 'all'>('all')

  const { papers, totalQ, doneQ, totalLessons } = useMemo(() => {
    const rows = LESSONS.map((l) => {
      const done = l.practice.filter((q) => attempts[q.id]).length
      const correct = l.practice.filter((q) => attempts[q.id]?.correct).length
      return { lesson: l, done, correct, total: l.practice.length }
    })

    // 试卷分组（固定顺序，仅展示存在的试卷）
    const byPaper = new Map<Paper, typeof rows>()
    for (const r of rows) {
      const k = r.lesson.paper
      if (!byPaper.has(k)) byPaper.set(k, [])
      byPaper.get(k)!.push(r)
    }

    const papers = PAPER_ORDER.filter((p) => byPaper.has(p)).map((p) => {
      const items = byPaper.get(p)!
      // 试卷内按学科分组（保持首次出现顺序）
      const order: string[] = []
      const by = new Map<string, typeof rows>()
      for (const r of items) {
        const k = r.lesson.subject
        if (!by.has(k)) {
          by.set(k, [])
          order.push(k)
        }
        by.get(k)!.push(r)
      }
      return {
        paper: p,
        items,
        subjects: order.map((k) => ({ subject: k, items: by.get(k)! })),
        total: items.reduce((s, r) => s + r.total, 0),
        done: items.reduce((s, r) => s + r.done, 0),
        correct: items.reduce((s, r) => s + r.correct, 0),
      }
    })

    return {
      papers,
      totalLessons: rows.length,
      totalQ: rows.reduce((s, r) => s + r.total, 0),
      doneQ: rows.reduce((s, r) => s + r.done, 0),
    }
  }, [attempts])

  const shown = only === 'all' ? papers : papers.filter((p) => p.paper === only)

  return (
    <>
      <div className="card learn-head">
        <div className="sec-title" style={{ marginTop: 0 }}>
          考点卡片（讲解 → 例题精讲 → 练习题）
        </div>
        <div className="review-sub">
          共 {totalLessons} 个考点 · {totalQ} 道原创练习 · 已做 {doneQ} 道。
          每个考点 = 核心思路 + 必背公式 + 易错红线 + 例题精讲 + 配套练习；
          练习走真实做题流程，错题自动进错题本与 SRS 队列，掌握度由正确率算出，不打卡。
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn sol-btn" onClick={() => nav('/learn/compose')}>
            按考点组题 →
          </button>
        </div>
      </div>

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
            className={
              'pf-chip paper-' + PAPER_KEY[p.paper] + (only === p.paper ? ' on' : '')
            }
            onClick={() => setOnly(p.paper)}
          >
            <span className="pf-glyph">{PAPER_GLYPH[p.paper]}</span>
            {PAPER_LABEL[p.paper]}
            <span className="pf-n">{p.items.length}</span>
          </button>
        ))}
      </div>

      {shown.map((p) => {
        const pct = p.total > 0 ? Math.round((p.correct / p.total) * 100) : 0
        return (
          <section key={p.paper} className={'paper-block paper-' + PAPER_KEY[p.paper]}>
            <div className="paper-head">
              <span className="paper-glyph">{PAPER_GLYPH[p.paper]}</span>
              <div className="paper-meta">
                <div className="paper-name">
                  {PAPER_LABEL[p.paper]}
                  <span className="paper-count">
                    {p.items.length} 个考点 · {p.total} 题
                  </span>
                </div>
                <div className="paper-hint">{PAPER_HINT[p.paper]}</div>
              </div>
            </div>
            <div className="paper-bar-row">
              <div className="paper-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <span className="paper-bar-t">
                {p.done === 0 ? '未开始' : `已做 ${p.done}/${p.total} · 正确率 ${pct}%`}
              </span>
            </div>

            {p.subjects.map((g) => (
              <Fragment key={g.subject}>
                <div className="learn-group">
                  <span className="learn-group-t">
                    <i className="learn-group-dot" />
                    {g.subject}
                  </span>
                  <span className="learn-group-n">
                    {g.items.length} 个考点 · {g.items.reduce((s, r) => s + r.total, 0)} 题
                  </span>
                </div>
                {g.items.map(({ lesson: l, done, correct, total }) => {
                  const qPct = total > 0 ? Math.round((correct / total) * 100) : 0
                  return (
                    <div
                      key={l.id}
                      className={
                        'card lesson-card paper-' + PAPER_KEY[l.paper] +
                        (done === total && total > 0 ? ' done' : '')
                      }
                      onClick={() => nav(`/learn/${l.id}`)}
                    >
                      <div className="lesson-top">
                        <span className="lesson-title">{l.title}</span>
                        <span
                          className={
                            'lesson-level lv-' +
                            (l.level === '高频大题'
                              ? 'hot'
                              : l.level === '低频了解'
                                ? 'low'
                                : 'mid')
                          }
                        >
                          {l.level}
                        </span>
                      </div>
                      <div className="lesson-sub">
                        <span className="lesson-paper-tag">{l.subject}</span>
                        {total} 道练习
                      </div>
                      <div className="lesson-goal">掌握标准：{l.goal}</div>
                      <div className="bar">
                        <i style={{ width: `${qPct}%` }} />
                      </div>
                      <div className="lesson-prog">
                        {done === 0
                          ? '未开始'
                          : `已做 ${done}/${total} · 正确 ${correct} · 正确率 ${qPct}%`}
                        <span className="lesson-go">
                          {done === total && total > 0 ? '已全部完成 · 复习 →' : '进入 →'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </section>
        )
      })}
    </>
  )
}
