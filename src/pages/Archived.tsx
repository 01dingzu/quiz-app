import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { archivedCount, archivedQuestions, BANK, getQuestion, useQuiz } from '../store/quizStore'
import QuestionCard from '../components/QuestionCard'
import type { Question } from '../types'

/** 已归档题清单行 */
function QRow({
  q,
  onUnarchive,
  onOpen,
}: {
  q: Question
  onUnarchive: () => void
  onOpen: () => void
}) {
  return (
    <div className="list-item" onClick={onOpen}>
      <span className="arch-badge" style={{ cursor: 'default' }}>
        ✓ 已归档
      </span>
      <span className="txt">
        <b>
          {q.year}-Q{q.no.toString().padStart(2, '0')}
        </b>{' '}
        {q.subject} · {q.stem.replace(/\s+/g, ' ').slice(0, 36)}
        {q.stem.length > 36 ? '…' : ''}
      </span>
      <button
        className="arch-btn"
        style={{ flexShrink: 0 }}
        onClick={(e) => {
          e.stopPropagation()
          onUnarchive()
        }}
      >
        移出归档
      </button>
    </div>
  )
}

/** 按年份倒序分组 */
function groupByYear(qs: Question[]): { title: string; items: Question[] }[] {
  const m = new Map<number, Question[]>()
  for (const q of qs) {
    if (!m.has(q.year)) m.set(q.year, [])
    m.get(q.year)!.push(q)
  }
  return Array.from(m.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([y, items]) => ({ title: `${y} 年（${items.length}）`, items }))
}

/** 归档页：看过且从没错过的题自动归档，不再出现在自由练习中 */
export default function Archived() {
  const { attempts, flagged, toggleFlag, unarchived, unarchiveQuestion } = useQuiz()
  const nav = useNavigate()
  const [openId, setOpenId] = useState<string | null>(null)
  const [armedAll, setArmedAll] = useState(false)

  const list = useMemo(() => archivedQuestions(), [attempts, unarchived])
  const count = useMemo(() => archivedCount(), [attempts, unarchived])

  const openQ = openId ? getQuestion(openId) : undefined

  const unarchiveAll = () => {
    if (!armedAll) {
      setArmedAll(true)
      setTimeout(() => setArmedAll(false), 3000)
      return
    }
    for (const q of list) unarchiveQuestion(q.id)
    setArmedAll(false)
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="sec-title">答对题归档</div>
        <div className="review-sub" style={{ marginBottom: 12, lineHeight: 1.7 }}>
          做过且从没错过的题会自动归档，之后自由练习不再出现；曾答错但已复习毕业的题也会归档。归档不影响错题本、统计与模拟考试（考试始终使用完整题库）。
        </div>
        <div className="btn-row">
          <button
            className="start-btn"
            style={{ flex: 1 }}
            disabled={count === 0}
            onClick={() => nav('/')}
          >
            回自由练习（题库 {BANK.length} 题，未归档 {BANK.length - count} 题可用）
          </button>
          {count > 0 && (
            <button className={'danger-btn' + (armedAll ? ' armed' : '')} onClick={unarchiveAll}>
              {armedAll ? '⚠ 再点一次确认全部移出' : '全部移出归档'}
            </button>
          )}
        </div>
        <div className="review-sub" style={{ marginTop: 10, lineHeight: 1.7 }}>
          已归档 <b>{count}</b> 道 · 手动移出后重新出现在自由练习中（{unarchived.length} 道已移出）。
        </div>
      </div>

      {openQ && (
        <>
          <QuestionCard
            question={openQ}
            picked={null}
            flagged={!!flagged[openQ.id]}
            onPick={() => {
              /* 归档清单内只查看不答题 */
            }}
            onToggleFlag={() => toggleFlag(openQ.id)}
          />
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button className="nav-btn primary" onClick={() => setOpenId(null)}>
              ← 返回清单
            </button>
          </div>
        </>
      )}

      {!openQ && (
        <>
          {count === 0 && (
            <div className="card empty">
              还没有已归档的题。
              <br />
              <br />
              做过的题答对后会自动归档到这里，之后自由练习不再重复出现。
              <br />
              <br />
              <button className="nav-btn primary" onClick={() => nav('/')}>
                去练习 →
              </button>
            </div>
          )}

          {groupByYear(list).map((g) => (
            <div key={g.title} className="card" style={{ padding: '6px 16px', marginBottom: 10 }}>
              <div className="group-title">{g.title}</div>
              {g.items.map((q) => (
                <QRow
                  key={q.id}
                  q={q}
                  onUnarchive={() => unarchiveQuestion(q.id)}
                  onOpen={() => setOpenId(q.id)}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </>
  )
}
