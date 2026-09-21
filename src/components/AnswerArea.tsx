import { useState } from 'react'
import type {
  Answer,
  AnswerKey,
  AppliedQ,
  BlankQ,
  MultiChoiceQ,
  Question,
  SingleChoiceQ,
} from '../types'
import { KEYS } from '../types'
import { Tex } from '../lib/tex'

// ============================================================
// 作答区：按题型分发
//
// 统一约定：作答值一旦提交（onAnswer），组件转为「只读回顾」态。
// 父级需带 key={question.id}，切题时自动重置局部输入状态。
// ============================================================

interface Common {
  picked: Answer | null
  onAnswer: (a: Answer) => void
}

export default function AnswerArea({ question, picked, onAnswer }: Common & { question: Question }) {
  switch (question.type) {
    case 'single':
      return <SingleView q={question} picked={picked} onAnswer={onAnswer} />
    case 'multi':
      return <MultiView q={question} picked={picked} onAnswer={onAnswer} />
    case 'blank':
      return <BlankView q={question} picked={picked} onAnswer={onAnswer} />
    case 'applied':
      return <AppliedView q={question} picked={picked} onAnswer={onAnswer} />
  }
}

// ---------------- 单选 ----------------

function SingleView({ q, picked, onAnswer }: Common & { q: SingleChoiceQ }) {
  const pk = picked?.t === 'single' ? picked.k : null
  const answered = pk !== null

  return (
    <div className="opts">
      {KEYS.map((k) => {
        const isPicked = pk === k
        const isAnswer = q.answer === k
        let cls = 'opt'
        if (answered) {
          if (isAnswer) cls += ' correct'
          else if (isPicked) cls += ' wrong'
          else cls += ' dim'
        }
        return (
          <button key={k} className={cls} disabled={answered} onClick={() => onAnswer({ t: 'single', k })}>
            <span className="key">{k}</span>
            <span className="opt-text">
              <Tex text={q.options[k]} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------- 多选 ----------------

function MultiView({ q, picked, onAnswer }: Common & { q: MultiChoiceQ }) {
  const committed = picked?.t === 'multi' ? picked.ks : null
  const [sel, setSel] = useState<AnswerKey[]>(committed ?? [])
  const answered = committed !== null

  const shown = answered ? committed! : sel

  const toggle = (k: AnswerKey) => {
    if (answered) return
    setSel((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k].sort()))
  }

  return (
    <>
      <div className="opts">
        {KEYS.map((k) => {
          const isPicked = shown.includes(k)
          const isAnswer = q.answer.includes(k)
          let cls = 'opt multi'
          if (answered) {
            if (isAnswer) cls += ' correct'
            else if (isPicked) cls += ' wrong'
            else cls += ' dim'
          } else if (isPicked) {
            cls += ' sel'
          }
          return (
            <button key={k} className={cls} disabled={answered} onClick={() => toggle(k)}>
              <span className="key">{isPicked ? '✓' : k}</span>
              <span className="opt-text">
                <Tex text={q.options[k]} />
              </span>
            </button>
          )
        })}
      </div>
      {!answered && (
        <div className="submit-row">
          <span className="submit-hint">多选题：少选 / 错选 / 多选均不得分</span>
          <button
            className="nav-btn primary"
            disabled={sel.length === 0}
            onClick={() => onAnswer({ t: 'multi', ks: [...sel].sort() })}
          >
            确认作答（已选 {sel.length} 项）
          </button>
        </div>
      )}
    </>
  )
}

// ---------------- 填空 ----------------

function BlankView({ q, picked, onAnswer }: Common & { q: BlankQ }) {
  const committed = picked?.t === 'blank' ? picked.vs : null
  const [vals, setVals] = useState<string[]>(committed ?? q.blanks.map(() => ''))
  const answered = committed !== null
  const shown = answered ? committed! : vals
  const anyFilled = shown.some((v) => v?.trim())

  const setAt = (i: number, v: string) => {
    setVals((prev) => {
      const next = [...prev]
      next[i] = v
      return next
    })
  }

  return (
    <>
      <div className="blanks">
        {q.blanks.map((b, i) => (
          <div key={i} className="blank-row">
            <span className="blank-no">{i + 1}</span>
            <input
              className="blank-input"
              value={shown[i] ?? ''}
              disabled={answered}
              placeholder={b.unit ? `填写答案（单位：${b.unit}）` : '填写答案'}
              onChange={(e) => setAt(i, e.target.value)}
            />
            {answered && (
              <span className="blank-answer">
                正确：<Tex text={b.answer} />
                {b.unit ? ` ${b.unit}` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
      {!answered && (
        <div className="submit-row">
          <span className="submit-hint">支持分数 / 小数等等价写法</span>
          <button
            className="nav-btn primary"
            disabled={!anyFilled}
            onClick={() => onAnswer({ t: 'blank', vs: q.blanks.map((_, i) => vals[i] ?? '') })}
          >
            确认作答
          </button>
        </div>
      )}
    </>
  )
}

// ---------------- 综合应用题（自评） ----------------

/** 自评档位 */
const LEVELS: { v: number; label: string }[] = [
  { v: 0, label: '✗ 没答对' },
  { v: 0.5, label: '△ 部分对' },
  { v: 1, label: '✓ 基本对' },
]

function AppliedView({ q, picked, onAnswer }: Common & { q: AppliedQ }) {
  const committed = picked?.t === 'applied' ? picked.scores : null
  const answered = committed !== null
  const [scores, setScores] = useState<(number | null)[]>(
    committed ?? q.parts.map(() => null),
  )
  const [open, setOpen] = useState<boolean[]>(q.parts.map(() => false))

  const shown = answered ? committed! : scores
  const doneCount = shown.filter((s) => s !== null && s !== undefined).length
  const allDone = doneCount === q.parts.length

  const pickLevel = (i: number, v: number) => {
    if (answered) return
    setScores((prev) => {
      const next = [...prev]
      next[i] = v
      return next
    })
  }

  const toggleOpen = (i: number) =>
    setOpen((prev) => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })

  return (
    <>
      <div className="applied-hint">
        本题满分 <b>{q.totalScore} 分</b> · 共 {q.parts.length} 问 —— 按小问作答（线下手写），
        先展开参考要点自评，再给出得分档位。自评结果会计入错题本与复习节奏。
        {q.parts.every((p) => !p.score) && '（原始真题未给出小问分值，故不逐问标注）'}
      </div>

      {q.parts.map((p, i) => (
        <div key={i} className="applied-part">
          <div className="applied-stem">
            <span className="applied-no">{p.no}）</span>
            <Tex text={p.stem} />
            {p.score ? <span className="applied-score">{p.score} 分</span> : null}
          </div>

          <div className="applied-tools">
            <button className="link-btn" onClick={() => toggleOpen(i)}>
              {open[i] ? '▾ 收起参考要点' : '▸ 展开参考要点'}
            </button>
            {!answered && (
              <span className="applied-levels">
                {LEVELS.map((lv) => (
                  <button
                    key={lv.v}
                    className={'level-btn' + (scores[i] === lv.v ? ' on' : '')}
                    onClick={() => pickLevel(i, lv.v)}
                  >
                    {lv.label}
                  </button>
                ))}
              </span>
            )}
            {answered && (
              <span className={'applied-self' + (committed![i] >= 1 ? ' ok' : committed![i] > 0 ? ' half' : ' bad')}>
                自评：{LEVELS.find((l) => l.v === committed![i])?.label ?? '—'}
              </span>
            )}
          </div>

          {open[i] && (
            <div className="applied-answer">
              <div className="applied-answer-label">参考答案</div>
              <Tex text={p.answer} />
              {p.points && p.points.length > 0 && (
                <ul className="applied-points">
                  {p.points.map((pt, j) => (
                    <li key={j}>
                      <Tex text={pt} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}

      {!answered && (
        <div className="submit-row">
          <span className="submit-hint">
            已自评 {doneCount} / {q.parts.length} 问
          </span>
          <button
            className="nav-btn primary"
            disabled={!allDone}
            onClick={() =>
              onAnswer({
                t: 'applied',
                scores: q.parts.map((_, i) => scores[i] ?? 0),
              })
            }
          >
            {allDone ? '提交自评' : `还差 ${q.parts.length - doneCount} 问`}
          </button>
        </div>
      )}
    </>
  )
}
