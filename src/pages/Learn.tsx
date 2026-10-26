import { Fragment, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz } from '../store/quizStore'
import { LESSONS } from '../lessons'

/**
 * 考点列表页：每个考点一张卡，进度由该考点练习题的真实作答记录算出
 * （不手动打卡 —— 做对几题、正确率多少，全来自 attempts）。
 * 卡片按学科分组，保持 LESSONS 里的顺序。
 */
export default function Learn() {
  const nav = useNavigate()
  const attempts = useQuiz((s) => s.attempts)

  const { rows, groups, totalQ, doneQ } = useMemo(() => {
    const rows = LESSONS.map((l) => {
      const done = l.practice.filter((q) => attempts[q.id]).length
      const correct = l.practice.filter((q) => attempts[q.id]?.correct).length
      return { lesson: l, done, correct, total: l.practice.length }
    })
    // 按学科分组（保持首次出现顺序）
    const order: string[] = []
    const by = new Map<string, typeof rows>()
    for (const r of rows) {
      const k = r.lesson.subject
      if (!by.has(k)) {
        by.set(k, [])
        order.push(k)
      }
      by.get(k)!.push(r)
    }
    return {
      rows,
      groups: order.map((k) => ({ subject: k, items: by.get(k)! })),
      totalQ: rows.reduce((s, r) => s + r.total, 0),
      doneQ: rows.reduce((s, r) => s + r.done, 0),
    }
  }, [attempts])

  return (
    <>
      <div className="card learn-head">
        <div className="sec-title" style={{ marginTop: 0 }}>
          考点卡片（讲解 → 例题精讲 → 练习题）
        </div>
        <div className="review-sub">
          共 {rows.length} 个考点 · {totalQ} 道原创练习 · 已做 {doneQ} 道。
          每个考点 = 核心思路 + 必背公式 + 易错红线 + 例题精讲 + 配套练习；
          练习走真实做题流程，错题自动进错题本与 SRS 队列，掌握度由正确率算出，不打卡。
        </div>
      </div>

      {groups.map((g) => (
        <Fragment key={g.subject}>
          <div className="learn-group">
            {g.subject}
            <span className="learn-group-n">
              {g.items.length} 个考点 · {g.items.reduce((s, r) => s + r.total, 0)} 题
            </span>
          </div>
          {g.items.map(({ lesson: l, done, correct, total }) => {
            const pct = total > 0 ? Math.round((correct / total) * 100) : 0
            return (
              <div
                key={l.id}
                className={'card lesson-card' + (done === total && total > 0 ? ' done' : '')}
                onClick={() => nav(`/learn/${l.id}`)}
              >
                <div className="lesson-top">
                  <span className="lesson-title">{l.title}</span>
                  <span
                    className={
                      'lesson-level lv-' +
                      (l.level === '高频大题' ? 'hot' : l.level === '低频了解' ? 'low' : 'mid')
                    }
                  >
                    {l.level}
                  </span>
                </div>
                <div className="lesson-sub">
                  {l.paper} · {l.subject} · {total} 道练习
                </div>
                <div className="lesson-goal">掌握标准：{l.goal}</div>
                <div className="bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="lesson-prog">
                  {done === 0 ? '未开始' : `已做 ${done}/${total} · 正确 ${correct} · 正确率 ${pct}%`}
                  <span className="lesson-go">
                    {done === total && total > 0 ? '已全部完成 · 复习 →' : '进入 →'}
                  </span>
                </div>
              </div>
            )
          })}
        </Fragment>
      ))}
    </>
  )
}
