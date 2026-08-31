import { useMemo } from 'react'
import { useQuiz } from '../store/quizStore'
import { SUBJECTS } from '../types'

/** 统计页：作答量 / 正确率 / 分科目表现 / 最近错题 */
export default function Stats() {
  const { history, attempts, clearHistory } = useQuiz()

  const total = history.length
  const correct = history.filter((h) => h.correct).length
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  const wrongCount = Object.values(attempts).filter((a) => !a.correct).length

  const bySubject = useMemo(() => {
    return SUBJECTS.map((s) => {
      const rows = history.filter((h) => h.subject === s)
      const ok = rows.filter((r) => r.correct).length
      return {
        subject: s,
        n: rows.length,
        ok,
        pct: rows.length > 0 ? Math.round((ok / rows.length) * 100) : 0,
      }
    })
  }, [history])

  const recentWrong = useMemo(
    () =>
      history
        .filter((h) => !h.correct)
        .slice(-8)
        .reverse(),
    [history],
  )

  return (
    <>
      <div className="stat-grid">
        <div className="stat-box">
          <div className="num">{total}</div>
          <div className="lbl">累计作答</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: total > 0 && pct < 60 ? 'var(--bad)' : 'var(--ok)' }}>
            {pct}%
          </div>
          <div className="lbl">总正确率（{correct} 对 / {total} 题）</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: wrongCount > 0 ? 'var(--bad)' : 'var(--muted)' }}>
            {wrongCount}
          </div>
          <div className="lbl">当前错题</div>
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          分科目表现
        </div>
        {bySubject.map((r) => (
          <div className="stat-row" key={r.subject}>
            <span className="name">{r.subject}</span>
            <div className="bar-wrap">
              <div className="bar" style={{ width: `${r.pct}%` }} />
            </div>
            <span className="pct">{r.n > 0 ? `${r.pct}%` : '-'}</span>
          </div>
        ))}
        {total === 0 && <div className="empty" style={{ padding: 16 }}>先做几题，这里会出现科目分布。</div>}
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <div className="sec-title" style={{ margin: 0 }}>
            最近答错
          </div>
          {history.length > 0 && (
            <button
              className="danger-btn"
              onClick={() => {
                if (confirm('清空全部作答历史与错题本？此操作不可撤销。')) clearHistory()
              }}
            >
              清空历史
            </button>
          )}
        </div>
        {recentWrong.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>没有答错的题 🎉</div>
        ) : (
          recentWrong.map((h) => (
            <div className="list-item" key={h.ts + h.qid}>
              <span className="tag bad">错</span>
              <span className="txt">
                <b>
                  {h.year}-Q{h.no}
                </b>{' '}
                {h.subject} · 你选 {h.picked}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
