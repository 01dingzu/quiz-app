import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz, getQuestion } from '../store/quizStore'
import QuestionCard from '../components/QuestionCard'
import { isMissingImg } from '../lib/missingImg'
import { EXAM_PER_Q_SCORE, SUBJECTS, type Subject } from '../types'

function formatRemain(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/** 练习会话页：逐题作答 → 即时判题 → 本卷小结（自由练习 / 模拟考试共享） */
export default function Practice() {
  const {
    session,
    index,
    picked,
    go,
    pick,
    toggleFlag,
    flagged,
    clearSession,
    mode,
    examRemainSec,
    tickExam,
    reconcileExam,
    attempts,
    addTag,
    removeTag,
    skipped,
    skipCurrent,
    resumeSession,
    imgReports,
    reportMissingImg,
    unreportMissingImg,
  } = useQuiz()
  const nav = useNavigate()
  const [quitArmed, setQuitArmed] = useState(false)

  const toggleReport = (qid: string) => {
    if (imgReports.includes(qid)) unreportMissingImg(qid)
    else reportMissingImg(qid)
  }

  // 二次确认：3 秒内未再点则自动还原，避免误触
  useEffect(() => {
    if (!quitArmed) return
    const t = setTimeout(() => setQuitArmed(false), 3000)
    return () => clearTimeout(t)
  }, [quitArmed])

  // 考试模式计时（仅限时模式启动倒计时）
  useEffect(() => {
    if (mode !== 'exam' || examRemainSec <= 0) return
    const t = setInterval(tickExam, 1000)
    return () => clearInterval(t)
  }, [mode, examRemainSec, tickExam])

  // 恢复会话（刷新/重开页面后）：先校准考试倒计时；若有跳过的题则重排到最前
  useEffect(() => {
    reconcileExam()
    resumeSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = session ? getQuestion(session[index]) : undefined

  const doneCount = useMemo(() => {
    if (!session) return 0
    return session.filter((id) => picked[id]).length
  }, [session, picked])

  // 会话中未答的跳过题数
  const skippedCount = useMemo(() => {
    if (!session) return 0
    const skipSet = new Set(skipped)
    return session.filter((id) => skipSet.has(id) && !picked[id]).length
  }, [session, picked, skipped])

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

  // 限时模式倒计时归零 → 强制交卷
  const examTimeUp = mode === 'exam' && examRemainSec === 0

  // 本卷小结（自由练习 / 考试通用；考试模式额外展示分数与分科正确率）
  if (finished || examTimeUp) {
    if (mode === 'exam') {
      // 分科正确率
      const subStats: Record<Subject, { right: number; total: number }> = {} as never
      for (const s of SUBJECTS) subStats[s] = { right: 0, total: 0 }
      for (const id of session) {
        const qq = getQuestion(id)
        if (!qq) continue
        subStats[qq.subject].total++
        if (picked[id] === qq.answer) subStats[qq.subject].right++
      }
      const score = correctCount * EXAM_PER_Q_SCORE
      const fullScore = total * EXAM_PER_Q_SCORE
      const passed = score >= fullScore * 0.6 // 60% 视为及格
      return (
        <div className="card done-box">
          <div className="done-tag">模拟考试结果</div>
          <div className="done-score">{score} / {fullScore}</div>
          <div className="done-sub">
            答对 {correctCount} / {total} 题 · {passed ? '✓ 及格' : '✗ 未及格'}
          </div>
          <div className="sub-stats">
            {SUBJECTS.map((s) => {
              const st = subStats[s]
              const pct = st.total === 0 ? 0 : Math.round((st.right / st.total) * 100)
              return (
                <div key={s} className="sub-stat-row">
                  <span className="sub-stat-name">{s}</span>
                  <div className="sub-stat-bar">
                    <div className="sub-stat-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="sub-stat-val">
                    {st.right}/{st.total} · {pct}%
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
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
      {mode === 'exam' && (
        <div className="exam-bar">
          <span className="exam-tag">模拟考试</span>
          <span className="exam-timer" data-warn={examRemainSec > 0 && examRemainSec < 300 ? '1' : '0'}>
            ⏱ {examRemainSec < 0 ? '不限时' : formatRemain(examRemainSec)}
          </span>
        </div>
      )}
      {mode === 'review' && (
        <div className="exam-bar" style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}>
          <span className="exam-tag">今日复习</span>
          <span className="exam-timer">已答 {doneCount} / {total}</span>
        </div>
      )}
      <div className="progress-row">
        <span>
          第 {index + 1} / {total} 题 · 已答 {doneCount}
          {skippedCount > 0 && <span className="skip-count"> · 跳过 {skippedCount}</span>}
        </span>
        <span>
          本卷 {correctCount} 对 / {doneCount - correctCount} 错
          {mode === 'exam' && ` · 计分 ${correctCount * EXAM_PER_Q_SCORE}`}
          {mode === 'review' && ' · 答对自动延后复习'}
        </span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <QuestionCard
        question={q}
        picked={picked[q.id] ?? null}
        flagged={!!flagged[q.id]}
        skipped={skipped.includes(q.id)}
        missingImg={isMissingImg(q)}
        imgReported={imgReports.includes(q.id)}
        tags={attempts[q.id]?.tags}
        onPick={(k) => pick(q.id, k)}
        onToggleFlag={() => toggleFlag(q.id)}
        onAddTag={(t) => addTag(q.id, t)}
        onRemoveTag={(t) => removeTag(q.id, t)}
        onReportImg={() => toggleReport(q.id)}
      />

      <div className="nav-row">
        <button className="nav-btn" disabled={index === 0} onClick={() => go(-1)}>
          ← 上一题
        </button>
        {!picked[q.id] && (
          <button className="skip-btn" onClick={skipCurrent} title="标记为跳过，下次打开时优先展示">
            ⏭ 跳过
          </button>
        )}
        {!isLast && (
          <button className="nav-btn primary" disabled={!picked[q.id]} onClick={() => go(1)}>
            {picked[q.id] ? '下一题 →' : '请先作答'}
          </button>
        )}
      </div>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button
          className={`quit-btn${quitArmed ? ' armed' : ''}`}
          onClick={() => {
            if (quitArmed) {
              clearSession()
              nav('/')
            } else {
              setQuitArmed(true)
            }
          }}
        >
          {quitArmed ? '⚠ 再点一次确认结束' : '✕ 结束练习'}
        </button>
        {quitArmed && (
          <p className="quit-hint">再次点击将结束本次练习并返回首页（已答记录保留在错题本）</p>
        )}
      </div>
    </>
  )
}
