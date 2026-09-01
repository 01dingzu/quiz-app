import { useMemo, useState } from 'react'
import { allTags, flaggedList, useQuiz, wrongList, getQuestion } from '../store/quizStore'
import QuestionCard from '../components/QuestionCard'
import { reviewLabel, type AttemptRecord, type Subject, SUBJECTS } from '../types'

type Tab = 'wrong' | 'flag' | 'tag'
type GroupBy = 'time' | 'year' | 'subject' | 'review'

function ItemRow({
  rec,
  onOpen,
  onRemoveTag,
}: {
  rec: AttemptRecord
  onOpen: () => void
  onRemoveTag?: (t: string) => void
}) {
  const q = getQuestion(rec.qid)
  if (!q) return null
  const review = rec.srs ? reviewLabel(rec.srs) : null
  return (
    <div className="list-item" onClick={onOpen}>
      <span className={'tag ' + (rec.correct ? 'ok' : 'bad')}>{rec.correct ? '对' : '错'}</span>
      {rec.flagged && <span className="tag flag">★</span>}
      <span className="txt">
        <b>
          {rec.year}-Q{rec.no.toString().padStart(2, '0')}
        </b>{' '}
        {rec.subject} · {q.stem.slice(0, 36)}
        {q.stem.length > 36 ? '…' : ''}
      </span>
      {review && <span className="tag review">{review}</span>}
      {(rec.tags ?? []).map((t) => (
        <span
          key={t}
          className="tag custom"
          onClick={(e) => {
            e.stopPropagation()
            onRemoveTag?.(t)
          }}
        >
          {t} ×
        </span>
      ))}
    </div>
  )
}

/** 分组：把列表按维度分桶 */
function groupList(
  list: AttemptRecord[],
  by: GroupBy,
): { title: string; items: AttemptRecord[] }[] {
  if (by === 'time') {
    return [{ title: `共 ${list.length} 题`, items: list }]
  }
  if (by === 'year') {
    const m = new Map<number, AttemptRecord[]>()
    for (const r of list) {
      const k = r.year
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return Array.from(m.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([y, items]) => ({ title: `${y} 年（${items.length}）`, items }))
  }
  if (by === 'subject') {
    const m = new Map<Subject, AttemptRecord[]>()
    for (const r of list) {
      if (!m.has(r.subject)) m.set(r.subject, [])
      m.get(r.subject)!.push(r)
    }
    return SUBJECTS.filter((s) => m.has(s)).map((s) => ({
      title: `${s}（${m.get(s)!.length}）`,
      items: m.get(s)!,
    }))
  }
  // review: 今天/逾期/未来 N 天/已毕业
  const now = Date.now()
  const ONE_DAY = 24 * 60 * 60 * 1000
  const overdue: AttemptRecord[] = []
  const today: AttemptRecord[] = []
  const soon: AttemptRecord[] = []
  const later: AttemptRecord[] = []
  const grad: AttemptRecord[] = []
  for (const r of list) {
    if (!r.srs) {
      today.push(r)
      continue
    }
    if (r.srs.graduated) {
      grad.push(r)
      continue
    }
    const diff = r.srs.nextReview - now
    if (diff < 0) overdue.push(r)
    else if (diff < ONE_DAY) today.push(r)
    else if (diff < 7 * ONE_DAY) soon.push(r)
    else later.push(r)
  }
  const out: { title: string; items: AttemptRecord[] }[] = []
  if (overdue.length) out.push({ title: `⏰ 逾期（${overdue.length}）`, items: overdue })
  if (today.length) out.push({ title: `📅 今天复习（${today.length}）`, items: today })
  if (soon.length) out.push({ title: `📆 本周（${soon.length}）`, items: soon })
  if (later.length) out.push({ title: `🗓 7 天后（${later.length}）`, items: later })
  if (grad.length) out.push({ title: `🎓 已毕业（${grad.length}）`, items: grad })
  return out
}

/** 错题本：错题/收藏/标签三 tab + 分组切换 */
export default function WrongBook() {
  const [tab, setTab] = useState<Tab>('wrong')
  const [groupBy, setGroupBy] = useState<GroupBy>('review')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { flagged, toggleFlag, removeTag, clearWrong, attempts, startReview } = useQuiz()

  const wrong = useMemo(() => wrongList(), [attempts])
  const flags = useMemo(() => flaggedList(), [attempts])
  const tags = useMemo(() => allTags(attempts), [attempts])

  // 标签过滤：仅显示带此标签的题
  const baseList = tab === 'wrong' ? wrong : tab === 'flag' ? flags : wrong
  const list = useMemo(() => {
    if (tab !== 'tag' || !tagFilter) return baseList
    return baseList.filter((r) => (r.tags ?? []).includes(tagFilter))
  }, [baseList, tab, tagFilter])

  const grouped = useMemo(() => groupList(list, groupBy), [list, groupBy])
  const openQ = openId ? getQuestion(openId) : undefined

  // 复习模式：当前打开的题如果不在错题本
  const isInWrong = openId ? wrong.some((r) => r.qid === openId) : false

  return (
    <>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <button
          className={'tab' + (tab === 'wrong' ? ' active' : '')}
          onClick={() => {
            setTab('wrong')
            setOpenId(null)
            setTagFilter(null)
          }}
        >
          错题（{wrong.length}）
        </button>
        <button
          className={'tab' + (tab === 'flag' ? ' active' : '')}
          onClick={() => {
            setTab('flag')
            setOpenId(null)
            setTagFilter(null)
          }}
        >
          收藏（{flags.length}）
        </button>
        <button
          className={'tab' + (tab === 'tag' ? ' active' : '')}
          onClick={() => {
            setTab('tag')
            setOpenId(null)
          }}
        >
          标签（{tags.length}）
        </button>
        {wrong.length > 0 && tab === 'wrong' && (
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

      {/* 标签过滤条 */}
      {tab === 'tag' && tags.length > 0 && (
        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <span style={{ marginRight: 6, color: 'var(--muted)' }}>筛选：</span>
          {tags.map((t) => (
            <button
              key={t.tag}
              className={'chip' + (tagFilter === t.tag ? ' active' : '')}
              onClick={() => setTagFilter(tagFilter === t.tag ? null : t.tag)}
            >
              {t.tag} ({t.count})
            </button>
          ))}
        </div>
      )}

      {/* 分组切换（错题 tab 才显示） */}
      {tab === 'wrong' && wrong.length > 0 && (
        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <span style={{ marginRight: 6, color: 'var(--muted)' }}>分组：</span>
          {(['review', 'year', 'subject', 'time'] as GroupBy[]).map((g) => (
            <button
              key={g}
              className={'chip' + (groupBy === g ? ' active' : '')}
              onClick={() => setGroupBy(g)}
            >
              {g === 'review' ? '按复习' : g === 'year' ? '按年份' : g === 'subject' ? '按科目' : '按时间'}
            </button>
          ))}
          <button
            className="chip"
            style={{ marginLeft: 'auto' }}
            onClick={() => startReview()}
          >
            ▶ 进入复习模式
          </button>
        </div>
      )}

      {openQ && (
        <>
          <QuestionCard
            question={openQ}
            picked={null}
            flagged={!!flagged[openQ.id]}
            onPick={() => {
              /* 错题本内不直接答题，提示"重做"流程 */
            }}
            onToggleFlag={() => toggleFlag(openQ.id)}
          />
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button className="nav-btn primary" onClick={() => setOpenId(null)}>
              ← 返回列表
            </button>
            {isInWrong && (
              <span style={{ marginLeft: 12, color: 'var(--muted)', fontSize: 13 }}>
                提示：进入首页"自由练习"并按年份/题号筛选，可重做并自动更新 SRS
              </span>
            )}
          </div>
        </>
      )}

      {!openQ && list.length === 0 && (
        <div className="card empty">
          {tab === 'wrong'
            ? '暂无错题，继续保持 🎉'
            : tab === 'flag'
            ? '还没有手动标记的题目'
            : tagFilter
            ? `没有标签为「${tagFilter}」的题`
            : '还没有打过标签的题（答完一题后用底部"加标签"按钮添加）'}
        </div>
      )}

      {!openQ &&
        grouped.map((g) => (
          <div key={g.title} className="card" style={{ padding: '6px 16px', marginBottom: 10 }}>
            <div className="group-title">{g.title}</div>
            {g.items.map((rec) => (
              <ItemRow
                key={rec.qid}
                rec={rec}
                onOpen={() => setOpenId(rec.qid)}
                onRemoveTag={(t) => removeTag(rec.qid, t)}
              />
            ))}
          </div>
        ))}
    </>
  )
}
