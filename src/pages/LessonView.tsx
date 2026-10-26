import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuiz } from '../store/quizStore'
import { LESSONS, lessonPracticeIds, type LessonExample } from '../lessons'
import { Tex } from '../lib/tex'
import { PAPER_GLYPH, PAPER_LABEL, paperClass } from '../lib/paper'

/** 例题精讲块：题干 + 可选错误做法 + 可折叠解法 */
function Example({ ex }: { ex: LessonExample }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ex-block">
      <div className="ex-title">{ex.title}</div>
      <div className="ex-stem">
        <Tex text={ex.stem} />
      </div>
      {ex.wrong && (
        <div className="ex-wrong">
          <b>✗ 错误做法：</b>
          <Tex text={ex.wrong} />
        </div>
      )}
      <button className="btn sol-btn" onClick={() => setOpen(!open)}>
        {open ? '收起解法' : '先自己写，再看解法 →'}
      </button>
      {open && (
        <div className="ex-sol">
          {ex.steps.map((s, i) => (
            <div key={i} className="ex-step">
              <span className="ex-stepno">{i + 1}</span>
              <Tex text={s} />
            </div>
          ))}
          <div className="ex-result">
            <Tex text={ex.result} />
          </div>
          {ex.note && <div className="ex-note">要点：{ex.note}</div>}
        </div>
      )}
    </div>
  )
}

/** 考点详情页：讲解 → 公式表 → 易错红线 → 例题精讲 → 练习题入口 */
export default function LessonView() {
  const { id } = useParams()
  const nav = useNavigate()
  const { attempts, startSessionWithIds } = useQuiz()

  const lesson = LESSONS.find((l) => l.id === id)
  const stats = useMemo(() => {
    if (!lesson) return null
    const done = lesson.practice.filter((q) => attempts[q.id]).length
    const correct = lesson.practice.filter((q) => attempts[q.id]?.correct).length
    return { done, correct, total: lesson.practice.length }
  }, [lesson, attempts])

  if (!lesson || !stats) {
    return (
      <div className="card">
        <div className="sec-title">考点不存在</div>
        <button className="btn sol-btn" onClick={() => nav('/learn')}>
          ← 返回考点列表
        </button>
      </div>
    )
  }

  const startPractice = () => {
    startSessionWithIds(lessonPracticeIds(lesson.id))
    nav('/practice')
  }

  return (
    <>
      <button className="btn sol-btn back-btn" onClick={() => nav('/learn')}>
        ← 考点列表
      </button>

      <div className={'card lesson-hero ' + paperClass(lesson.paper)}>
        <div className="lesson-hero-tag">
          <span className="lesson-hero-glyph">{PAPER_GLYPH[lesson.paper]}</span>
          {PAPER_LABEL[lesson.paper]}
          <span className="lesson-hero-sep">·</span>
          {lesson.subject}
        </div>
        <div className="lesson-top">
          <span className="lesson-title">{lesson.title}</span>
          <span className={'lesson-level lv-' + (lesson.level === '高频大题' ? 'hot' : lesson.level === '低频了解' ? 'low' : 'mid')}>
            {lesson.level}
          </span>
        </div>
        <div className="lesson-sub">
          练习 {stats.total} 题 · 已做 {stats.done} / 正确 {stats.correct}
        </div>
        <div className="lesson-goal">掌握标准：{lesson.goal}</div>
      </div>

      <div className="card">
        <div className="sec-title">核心思路</div>
        {lesson.intro.map((p, i) => (
          <div key={i} className="lesson-para">
            <Tex text={p} />
          </div>
        ))}
      </div>

      {lesson.formulaTable && (
        <div className="card">
          {/* 政治的「公式表」装的是背诵条款，标签要跟着换 */}
          <div className="sec-title">{lesson.paper === '政治' ? '必背条款' : '必背公式'}</div>
          <Tex text={lesson.formulaTable} />
        </div>
      )}

      {lesson.pitfall && (
        <div className="card pitfall-card">
          <div className="sec-title">⚠ 易错红线</div>
          <div className="pitfall-body">
            <Tex text={lesson.pitfall} />
          </div>
        </div>
      )}

      {lesson.examples.length > 0 && (
        <div className="card">
          <div className="sec-title">例题精讲（{lesson.examples.length} 道）</div>
          {lesson.examples.map((ex, i) => (
            <Example key={i} ex={ex} />
          ))}
        </div>
      )}

      <div className="card">
        <div className="sec-title">练习题（{stats.total} 道 · 走真实做题流程）</div>
        <div className="review-sub">
          错题自动进错题本与 SRS 复习队列；作答记录计入统计页的科目正确率。
        </div>
        <ol className="prac-list">
          {lesson.practice.map((q) => {
            const a = attempts[q.id]
            return (
              <li key={q.id} className={'prac-item' + (a ? (a.correct ? ' ok' : ' bad') : '')}>
                <Tex text={q.stem} />
                {a && <span className="prac-tag">{a.correct ? '✓ 做对' : '✗ 做错'}</span>}
              </li>
            )
          })}
        </ol>
        <button className="start-btn" onClick={startPractice}>
          {stats.done === 0
            ? `开始练习 · 共 ${stats.total} 题`
            : stats.done === stats.total && stats.correct === stats.total
              ? `全部做对 · 重刷一遍 →`
              : `继续练习 · 已做 ${stats.done}/${stats.total}`}
        </button>
        <div className="exam-hint">答错的题会立即进入错题本，并在 SRS 队列里按 1 / 3 / 7 天节奏召回。</div>
      </div>
    </>
  )
}
