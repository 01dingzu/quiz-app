import type { AnswerKey, Question } from '../types'
import { KEYS } from '../types'

interface Props {
  question: Question
  picked: AnswerKey | null
  flagged: boolean
  onPick: (key: AnswerKey) => void
  onToggleFlag: () => void
}

/** 题目卡片：题干 + 四选项 + 判题/解析（答后展示） */
export default function QuestionCard({ question, picked, flagged, onPick, onToggleFlag }: Props) {
  const answered = picked !== null
  const correct = answered && picked === question.answer

  return (
    <div className="card">
      <div className="q-head">
        <span className="q-meta">{question.year} 年</span>
        <span className="q-meta">{question.subject}</span>
        <span className="q-no">第 {question.no} 题</span>
        <button
          className={'flag-btn' + (flagged ? ' on' : '')}
          onClick={onToggleFlag}
          title={flagged ? '取消标记' : '标记为存疑/收藏'}
        >
          {flagged ? '★ 已标记' : '☆ 标记'}
        </button>
      </div>

      <p className="q-stem">{question.stem}</p>

      <div className="opts">
        {KEYS.map((k) => {
          const isPicked = picked === k
          const isAnswer = question.answer === k
          let cls = 'opt'
          if (answered) {
            if (isAnswer) cls += ' correct'
            else if (isPicked) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <button key={k} className={cls} disabled={answered} onClick={() => onPick(k)}>
              <span className="key">{k}</span>
              <span>{question.options[k]}</span>
            </button>
          )
        })}
      </div>

      {answered && (
        <div className={'verdict ' + (correct ? 'ok' : 'bad')}>
          {correct ? '✓ 回答正确' : `✗ 回答错误（正确答案 ${question.answer}）`}
          {question.explanation && (
            <div className="expl">
              <span className="expl-tag">解析：</span>
              {question.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
