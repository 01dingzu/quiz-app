import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz, BANK, buildExam, dueCount, resumeInfo } from '../store/quizStore'
import { EXAM_PER_Q_SCORE, EXAM_RATIO, SUBJECTS, YEARS, type Subject } from '../types'

/** 练习设置页：年份 / 科目筛选 + 顺序/随机 + 自由练习 / 模拟考试 */
export default function Home() {
  const { filter, setFilter, startSession, startExam, startReview, attempts, flagged } = useQuiz()
  const nav = useNavigate()
  const [duration, setDuration] = useState<0 | 30 | 60 | 90 | 180>(0)
  const due = useMemo(() => dueCount(attempts, flagged), [attempts, flagged])
  const resume = useMemo(() => resumeInfo(), [attempts]) // attempts 变化即重算（答完题会更新）

  const allYears = filter.years.length === 0
  const allSubjects = filter.subjects.length === 0

  const count = useMemo(
    () =>
      BANK.filter(
        (q) =>
          (allYears || filter.years.includes(q.year)) &&
          (allSubjects || filter.subjects.includes(q.subject)),
      ).length,
    [allYears, allSubjects, filter],
  )

  const toggleYear = (y: number) => {
    const cur = allYears ? YEARS : filter.years
    const next = cur.includes(y) ? cur.filter((v) => v !== y) : [...cur, y].sort((a, b) => a - b)
    setFilter({ years: next.length === YEARS.length ? [] : next })
  }

  const toggleSubject = (s: Subject) => {
    const cur = allSubjects ? SUBJECTS : filter.subjects
    const next = cur.includes(s) ? cur.filter((v) => v !== s) : [...cur, s]
    setFilter({ subjects: next.length === SUBJECTS.length ? [] : next })
  }

  const startPractice = () => {
    startSession()
    nav('/practice')
  }

  const startExamNow = () => {
    startExam({ counts: EXAM_RATIO, durationMin: duration })
    nav('/practice')
  }

  const startReviewNow = () => {
    startReview()
    nav('/practice')
  }

  const resumeNow = () => nav('/practice') // Practice 页直接从持久化的 session/index 恢复

  // 考试组卷预估：当前筛选下每科可用题数 vs 目标
  const examAvail = useMemo(() => {
    const result: Record<Subject, { need: number; have: number; ok: boolean }> = {} as never
    for (const s of SUBJECTS) {
      const have = BANK.filter(
        (q) =>
          q.subject === s &&
          (allYears || filter.years.includes(q.year)) &&
          (allSubjects || filter.subjects.includes(s)),
      ).length
      result[s] = { need: EXAM_RATIO[s], have, ok: have >= EXAM_RATIO[s] }
    }
    return result
  }, [allYears, allSubjects, filter])
  const examCanStart = Object.values(examAvail).every((v) => v.ok)
  const examTotal = Object.values(EXAM_RATIO).reduce((a, b) => a + b, 0)

  return (
    <>
      {resume && (
        <div className="card resume-card">
          <div className="sec-title">⏸ 继续上次练习（进度已自动保存，刷新/关闭页面不丢失）</div>
          <div className="review-info">
            <div className="review-lbl">
              <b>{resume.label}</b> · 上次做到第 {resume.index + 1} / {resume.total} 题 · 已答 {resume.done} 题
              <div className="review-sub">继续后从上次的题目接着做，作答记录全部保留。</div>
            </div>
          </div>
          <button className="start-btn review" onClick={resumeNow}>
            继续练习 →
          </button>
        </div>
      )}

      <div className="card">
        <div className="sec-title">年份（当前：{allYears ? '全部 16 年' : `${filter.years.length} 年`}）</div>
        <div className="chips">
          <button className={'chip' + (allYears ? ' on' : '')} onClick={() => setFilter({ years: [] })}>
            全部
          </button>
          {YEARS.map((y) => (
            <button
              key={y}
              className={'chip' + (allYears || filter.years.includes(y) ? ' on' : '')}
              onClick={() => toggleYear(y)}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="sec-title">科目（当前：{allSubjects ? '全部 4 科' : `${filter.subjects.length} 科`}）</div>
        <div className="chips">
          <button className={'chip' + (allSubjects ? ' on' : '')} onClick={() => setFilter({ subjects: [] })}>
            全部
          </button>
          {SUBJECTS.map((s) => (
            <button
              key={s}
              className={'chip' + (allSubjects || filter.subjects.includes(s) ? ' on' : '')}
              onClick={() => toggleSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="sec-title">出题方式</div>
        <div className="toggle-row">
          <button
            className={'switch' + (filter.shuffle ? ' on' : '')}
            onClick={() => setFilter({ shuffle: !filter.shuffle })}
            aria-label="随机出题"
          />
          <span>{filter.shuffle ? '随机顺序（每次不同）' : '按题号顺序'}</span>
        </div>

        <div className="sec-title">自由练习</div>
        <button className="start-btn" disabled={count === 0} onClick={startPractice}>
          开始练习 · 共 {count} 题
        </button>
      </div>

      <div className="card review-card">
        <div className="sec-title">今日复习（SRS 间隔重复 · 错题自动消化）</div>
        <div className="review-info">
          <div className="review-num">{due}</div>
          <div className="review-lbl">
            {due === 0 ? '题待复习' : '题待复习'}
            <div className="review-sub">
              {due === 0
                ? '当前没有需要复习的题目。做完练习或考试后，错题会自动加入复习队列。'
                : '基于 SM-2 算法：答对延后复习，答错立即重排'}
            </div>
          </div>
        </div>
        <button className="start-btn review" disabled={due === 0} onClick={startReviewNow}>
          {due === 0 ? '暂无待复习' : `开始复习 · ${due} 题`}
        </button>
      </div>

      <div className="card exam-card">
        <div className="sec-title">模拟考试（408 真实比例 11/11/10/8 = 40 题 · 满分 80）</div>
        <div className="ratio-grid">
          {SUBJECTS.map((s) => (
            <div key={s} className={'ratio-cell' + (examAvail[s].ok ? '' : ' warn')}>
              <div className="ratio-sub">{s}</div>
              <div className="ratio-need">
                {EXAM_RATIO[s]} 题 <span className="ratio-have">/ 可用 {examAvail[s].have}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="sec-title">时长（0 = 不计时）</div>
        <div className="chips">
          {[0, 30, 60, 90, 180].map((m) => (
            <button
              key={m}
              className={'chip' + (duration === m ? ' on' : '')}
              onClick={() => setDuration(m as 0 | 30 | 60 | 90 | 180)}
            >
              {m === 0 ? '不限时' : `${m} 分钟`}
            </button>
          ))}
        </div>

        <button className="start-btn exam" disabled={!examCanStart} onClick={startExamNow}>
          {examCanStart
            ? `开始考试 · ${examTotal} 题 · ${duration === 0 ? '不限时' : `${duration} 分钟`}`
            : '当前筛选题量不足组卷'}
        </button>
        <div className="exam-hint">
          计分：每题 {EXAM_PER_Q_SCORE} 分 · 满分 {EXAM_PER_Q_SCORE * examTotal} ·
          完成后展示分数与分科正确率
        </div>
      </div>

      <div className="card" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
        <b style={{ color: 'var(--ink)' }}>说明</b>
        <br />
        · 题库为 2009-2024 年 408 统考单选真题，共 {BANK.length} 题可用（图片题 44 道暂未收录，二期支持）。
        <br />
        · 自由练习：可任意选择年份 / 科目 / 顺序，答错自动入错题本，每题可手动「☆ 标记」。
        <br />
        · 模拟考试：按 408 真实比例组 40 题（1-11 数据结构 / 12-22 计组 / 23-32 操作系统 / 33-40 计网），可选计时。
        <br />
        · 今日复习：基于 SM-2 算法自动安排复习时间（答对 1→3→7→14→30+ 天，答错立即重排 1 天）。
        <br />
        · 数据保存在本机浏览器（localStorage），换设备不迁移。
      </div>
    </>
  )
}
