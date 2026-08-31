import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz, getQuestion } from '../store/quizStore'
import QuestionCard from '../components/QuestionCard'

/** 练习会话页：逐题作答 → 即时判题 → 本卷小结 */
export default function Practice() {
  const { session, index, picked, go, pick, toggleFlag, flagged, clearSession } = useQuiz()
  const nav = useNavigate()

  const q = session ? getQuestion(session[index]) : undefined

  const doneCount = useMemo(() => {
    if (!session) return 0
    return session.filter((id) => picked[id]).length
  }, [session, picked])

  if (!session || !q) {
    return (
      <div className="card empty">
        还没有进行中的练习。
        <br />
        <br />
        <button className="nav-btn primary" onClick={() => nav('/')}>
          去选择范围
        </button>
      </div>
    )
  }

  const total = session.length
  const isLast = index === total - 1
  const finished = doneCount === total
  const correctCount = session.filter((id) => {
    const p = picked[id]
    const qq = getQuestion(id)
    return p && qq && p === qq.answer
  }).length

  // 本卷小结
  if (finished) {
    const pct = Math.round((correctCount / total) * 100)
    return (
      <div className="card done-box">
        <div className="done-score">{pct}%</div>
        <div className="done-sub">
          共 {total} 题 · 答对 {correctCount} · 答错 {total - correctCount}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="nav-btn" onClick={() => nav('/wrong')}>
            查看错题本
          </button>
          <button
            className="nav-btn primary"
            onClick={() => {
              clearSession()
              nav('/')
            }}
          >
            返回设置
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="progress-row">
        <span>
          第 {index + 1} / {total} 题 · 已答 {doneCount}
        </span>
        <span>
          本卷 {correctCount} 对 / {doneCount - correctCount} 错
        </span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <QuestionCard
        question={q}
        picked={picked[q.id] ?? null}
        flagged={!!flagged[q.id]}
        onPick={(k) => pick(q.id, k)}
        onToggleFlag={() => toggleFlag(q.id)}
      />

      <div className="nav-row">
        <button className="nav-btn" disabled={index === 0} onClick={() => go(-1)}>
          ← 上一题
        </button>
        {!isLast && (
          <button className="nav-btn primary" disabled={!picked[q.id]} onClick={() => go(1)}>
            {picked[q.id] ? '下一题 →' : '请先作答'}
          </button>
        )}
      </div>
    </>
  )
}
