import { useState } from 'react'
import { wrongList, flaggedList, useQuiz, getQuestion } from '../store/quizStore'
import QuestionCard from '../components/QuestionCard'
import type { AttemptRecord } from '../types'

type Tab = 'wrong' | 'flag'

function ItemRow({ rec, onOpen }: { rec: AttemptRecord; onOpen: () => void }) {
  const q = getQuestion(rec.qid)
  if (!q) return null
  return (
    <div className="list-item" onClick={onOpen}>
      <span className={'tag ' + (rec.correct ? 'ok' : 'bad')}>{rec.correct ? '对' : '错'}</span>
      {rec.flagged && <span className="tag flag">★</span>}
      <span className="txt">
        <b>
          {rec.year}-Q{rec.no}
        </b>{' '}
        {rec.subject} · {q.stem.slice(0, 40)}
        {q.stem.length > 40 ? '…' : ''}
      </span>
    </div>
  )
}

/** 错题本：答错自动收录 + 手动标记收藏；点开可重做 */
export default function WrongBook() {
  const [tab, setTab] = useState<Tab>('wrong')
  const [openId, setOpenId] = useState<string | null>(null)
  const [redoPicks, setRedoPicks] = useState<Record<string, string>>({})
  const { flagged, toggleFlag, clearWrong } = useQuiz()

  const wrong = wrongList()
  const flags = flaggedList()
  const list = tab === 'wrong' ? wrong : flags
  const openQ = openId ? getQuestion(openId) : undefined

  const redoPick = (qid: string, key: string) => {
    setRedoPicks((p) => ({ ...p, [qid]: key }))
  }

  return (
    <>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={'tab' + (tab === 'wrong' ? ' active' : '')} onClick={() => { setTab('wrong'); setOpenId(null) }}>
          错题（{wrong.length}）
        </button>
        <button className={'tab' + (tab === 'flag' ? ' active' : '')} onClick={() => { setTab('flag'); setOpenId(null) }}>
          标记收藏（{flags.length}）
        </button>
        {tab === 'wrong' && wrong.length > 0 && (
          <button
            className="danger-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              if (confirm('清空错题本？此操作不可撤销。')) clearWrong()
            }}
          >
            清空错题
          </button>
        )}
      </div>

      {openQ && (
        <QuestionCard
          question={openQ}
          picked={(redoPicks[openQ.id] as 'A' | 'B' | 'C' | 'D') ?? null}
          flagged={!!flagged[openQ.id]}
          onPick={(k) => redoPick(openQ.id, k)}
          onToggleFlag={() => toggleFlag(openQ.id)}
        />
      )}

      {list.length === 0 && !openQ && (
        <div className="card empty">
          {tab === 'wrong' ? '暂无错题，继续保持 🎉' : '还没有手动标记的题目'}
        </div>
      )}

      {list.length > 0 && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {list.map((rec) => (
            <ItemRow
              key={rec.qid}
              rec={rec}
              onOpen={() => {
                setOpenId(rec.qid)
                setRedoPicks((p) => {
                  const n = { ...p }
                  delete n[rec.qid]
                  return n
                })
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
