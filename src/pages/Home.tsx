import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuiz, BANK } from '../store/quizStore'
import { SUBJECTS, YEARS, type Subject } from '../types'

/** 练习设置页：年份 / 科目筛选 + 顺序/随机 + 开始 */
export default function Home() {
  const { filter, setFilter, startSession } = useQuiz()
  const nav = useNavigate()
  const [mode, setMode] = useState<'single' | 'all'>('single')

  const allYears = filter.years.length === 0
  const allSubjects = filter.subjects.length === 0
  const count = BANK.filter(
    (q) =>
      (allYears || filter.years.includes(q.year)) &&
      (allSubjects || filter.subjects.includes(q.subject)),
  ).length

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

  const start = () => {
    startSession()
    nav('/practice')
  }

  return (
    <>
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

        <div className="sec-title">练习模式</div>
        <div className="chips">
          <button className={'chip' + (mode === 'single' ? ' on' : '')} onClick={() => setMode('single')}>
            逐题练习
          </button>
          <button className={'chip' + (mode === 'all' ? ' on' : '')} onClick={() => setMode('all')}>
            整套模拟（{allYears ? 40 : '所选年'} 题）
          </button>
        </div>

        <button className="start-btn" disabled={count === 0} onClick={start}>
          开始练习 · 共 {count} 题
        </button>
      </div>

      <div className="card" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
        <b style={{ color: 'var(--ink)' }}>说明</b>
        <br />
        · 题库为 2009-2024 年 408 统考单选真题，共 {BANK.length} 题可用（图片题 44 道暂未收录，二期支持）。
        <br />
        · 答错自动记入错题本；每题可手动「☆ 标记」存疑/收藏。
        <br />
        · 错题本与统计保存在本机浏览器（localStorage），换设备不迁移。
      </div>
    </>
  )
}
