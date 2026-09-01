import { useMemo, useState } from 'react'
import {
  getQuestion,
  missingImgQuestions,
  reportedMissingImgQuestions,
  useQuiz,
} from '../store/quizStore'
import QuestionCard from '../components/QuestionCard'
import type { Question } from '../types'

/** 缺图/缺表题清单行 */
function QRow({
  q,
  reported,
  onToggle,
  onOpen,
}: {
  q: Question
  reported: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  return (
    <div className="list-item" onClick={onOpen}>
      <span className={'img-report' + (reported ? ' on' : '')} style={{ cursor: 'default' }}>
        {reported ? '✓ 已上报' : '⚠ 缺图'}
      </span>
      <span className="txt">
        <b>
          {q.year}-Q{q.no.toString().padStart(2, '0')}
        </b>{' '}
        {q.subject} · {q.stem.replace(/\s+/g, ' ').slice(0, 36)}
        {q.stem.length > 36 ? '…' : ''}
      </span>
      <button
        className={'img-report' + (reported ? ' on' : '')}
        style={{ flexShrink: 0 }}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {reported ? '撤销' : '上报'}
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

/** 生成可复制的缺图清单文本 */
function buildListText(qs: Question[]): string {
  const lines = [
    `408 缺图/缺表题清单（${new Date().toISOString().slice(0, 10)}）`,
    `共 ${qs.length} 题`,
    '',
    ...qs.map(
      (q) =>
        `${q.year}-Q${q.no.toString().padStart(2, '0')} ${q.subject} · ${q.stem
          .replace(/\s+/g, ' ')
          .slice(0, 60)}`,
    ),
  ]
  return lines.join('\n')
}

/** 复制到剪贴板：优先 Clipboard API，失败回退 textarea + execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/** 缺图反馈收集页：自动检测缺图题 + 手动上报 + 一键复制清单 */
export default function MissingImg() {
  const { imgReports, reportMissingImg, unreportMissingImg, flagged, toggleFlag } = useQuiz()
  const [openId, setOpenId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFail, setCopyFail] = useState(false)
  const [armedClear, setArmedClear] = useState(false)

  const auto = useMemo(() => missingImgQuestions(), [])
  const reported = useMemo(() => reportedMissingImgQuestions(), [imgReports])
  const autoIds = useMemo(() => new Set(auto.map((q) => q.id)), [auto])
  /** 用户手动补充上报、不在自动检测列表里的题 */
  const extra = useMemo(() => reported.filter((q) => !autoIds.has(q.id)), [reported, autoIds])

  const openQ = openId ? getQuestion(openId) : undefined

  const toggleReport = (qid: string) => {
    if (imgReports.includes(qid)) unreportMissingImg(qid)
    else reportMissingImg(qid)
  }

  const reportAll = () => {
    for (const q of auto) reportMissingImg(q.id)
  }

  const copyList = async () => {
    const src = reported.length > 0 ? reported : auto
    if (src.length === 0) return
    const ok = await copyText(buildListText(src))
    if (ok) {
      setCopied(true)
      setCopyFail(false)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setCopyFail(true)
      setTimeout(() => setCopyFail(false), 2000)
    }
  }

  const clearAll = () => {
    if (!armedClear) {
      setArmedClear(true)
      setTimeout(() => setArmedClear(false), 3000)
      return
    }
    for (const id of imgReports) unreportMissingImg(id)
    setArmedClear(false)
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="sec-title">缺图反馈收集</div>
        <div className="review-sub" style={{ marginBottom: 12, lineHeight: 1.7 }}>
          题库有 <b>{auto.length}</b> 道题引用了图/表，但暂未收录对应图片。做题时点击题目卡片上的「⚠ 缺图 ·
          上报」即可收集；下面可一键上报全部、或复制清单用于统一补图。
        </div>
        <div className="btn-row">
          <button
            className="start-btn"
            style={{ flex: 1 }}
            disabled={imgReports.length >= auto.length}
            onClick={reportAll}
          >
            {imgReports.length >= auto.length ? '已全部上报' : `一键上报全部 ${auto.length} 道`}
          </button>
          <button className="nav-btn" onClick={copyList}>
            {copied ? '✓ 已复制' : copyFail ? '复制失败' : `复制清单（${reported.length || auto.length} 题）`}
          </button>
          {imgReports.length > 0 && (
            <button className={'danger-btn' + (armedClear ? ' armed' : '')} onClick={clearAll}>
              {armedClear ? '⚠ 再点一次确认' : '清空上报'}
            </button>
          )}
        </div>
        <div className="review-sub" style={{ marginTop: 10, lineHeight: 1.7 }}>
          已收集 <b>{imgReports.length}</b> 道（含手动补充 {extra.length} 道）。收集清单保存在本机
          localStorage。
        </div>
      </div>

      {openQ && (
        <>
          <QuestionCard
            question={openQ}
            picked={null}
            flagged={!!flagged[openQ.id]}
            missingImg
            imgReported={imgReports.includes(openQ.id)}
            onPick={() => {
              /* 清单内只查看不答题 */
            }}
            onToggleFlag={() => toggleFlag(openQ.id)}
            onReportImg={() => toggleReport(openQ.id)}
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
          {extra.length > 0 && (
            <div className="card" style={{ padding: '6px 16px', marginBottom: 10 }}>
              <div className="group-title">手动补充上报（{extra.length}）</div>
              {extra.map((q) => (
                <QRow
                  key={q.id}
                  q={q}
                  reported={imgReports.includes(q.id)}
                  onToggle={() => toggleReport(q.id)}
                  onOpen={() => setOpenId(q.id)}
                />
              ))}
            </div>
          )}

          {auto.length === 0 && <div className="card empty">题库没有缺图题 🎉</div>}

          {groupByYear(auto).map((g) => (
            <div key={g.title} className="card" style={{ padding: '6px 16px', marginBottom: 10 }}>
              <div className="group-title">{g.title}</div>
              {g.items.map((q) => (
                <QRow
                  key={q.id}
                  q={q}
                  reported={imgReports.includes(q.id)}
                  onToggle={() => toggleReport(q.id)}
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
