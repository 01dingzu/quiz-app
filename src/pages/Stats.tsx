import { useMemo } from 'react'
import { paperStats, useQuiz } from '../store/quizStore'
import { formatAnswer } from '../lib/grade'
import { PAPER_INFO, SUBJECTS, type Subject408 } from '../types'

/** 统计页：作答量 / 正确率 / 分试卷 KPI / 分科目表现 / 最近错题 */
export default function Stats() {
  const { history, attempts, clearHistory } = useQuiz()

  const total = history.length
  const correct = history.filter((h) => h.correct).length
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  const wrongCount = Object.values(attempts).filter((a) => !a.correct).length

  // 分试卷客观题正确率（每题最近一次）—— 这才是「365 分」能追踪的那个 KPI
  const papers = useMemo(() => paperStats(), [history, attempts])

  const bySubject = useMemo(() => {
    // 先按 408 四科固定顺序，再补其他试卷的科目（动态发现，避免新增科目不显示）
    const agg = new Map<string, { n: number; ok: number }>()
    for (const h of history) {
      const st = agg.get(h.subject) ?? { n: 0, ok: 0 }
      st.n++
      if (h.correct) st.ok++
      agg.set(h.subject, st)
    }
    const keys = [
      ...SUBJECTS.filter((s) => agg.has(s)),
      ...[...agg.keys()].filter((k) => !SUBJECTS.includes(k as Subject408)),
    ]
    return keys.map((s) => {
      const st = agg.get(s)!
      return {
        subject: s,
        n: st.n,
        ok: st.ok,
        pct: st.n > 0 ? Math.round((st.ok / st.n) * 100) : 0,
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
          分试卷客观题正确率（KPI 口径：每题最近一次作答）
        </div>
        {papers.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>
            先做几题，这里会出现各试卷正确率对照。
          </div>
        ) : (
          papers.map((r) => {
            const p = Math.round(r.pct * 100)
            const kpi = Math.round(r.kpi * 100)
            const ok = r.pct >= r.kpi
            return (
              <div key={r.paper} className="kpi-row">
                <div className="stat-row" style={{ marginBottom: 4 }}>
                  <span className="name">{PAPER_INFO[r.paper].short}</span>
                  <div className="bar-wrap">
                    <div
                      className="bar"
                      style={{
                        width: `${p}%`,
                        background: ok ? 'var(--ok)' : 'var(--warn)',
                      }}
                    />
                  </div>
                  <span className="pct">{p}%</span>
                </div>
                <div className="kpi-sub">
                  目标 {kpi}% · 已答 {r.total} 题 · {ok ? `✓ 达标（+${p - kpi}）` : `还差 ${kpi - p} 个点`}
                </div>
              </div>
            )
          })
        )}
        <div className="exam-hint" style={{ textAlign: 'left' }}>
          目标线来自「365 分」反推（方案 §2.3）：408 需 88%，政治 / 数学一约 80%，英语一 77%。
          408 要求更高，因为它的 70 分综合应用题得分率只有 64%，必须在单选上补回来。
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
                {h.subject} · 你选 {formatAnswer(h.picked)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
