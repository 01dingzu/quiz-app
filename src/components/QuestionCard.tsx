import { useState } from 'react'
import type { AnswerKey, Question } from '../types'
import { KEYS } from '../types'

interface Props {
  question: Question
  picked: AnswerKey | null
  flagged: boolean
  /** 该题被跳过（待优先作答） */
  skipped?: boolean
  tags?: string[]
  /** 该题题干引用了图/表但题库无图（缺图提示） */
  missingImg?: boolean
  /** 是否已上报缺图 */
  imgReported?: boolean
  onPick: (key: AnswerKey) => void
  onToggleFlag: () => void
  onAddTag?: (tag: string) => void
  onRemoveTag?: (tag: string) => void
  onReportImg?: () => void
}

/** 题目卡片：题干 + 四选项 + 判题/解析 + 标签管理 */
export default function QuestionCard({
  question,
  picked,
  flagged,
  skipped = false,
  tags = [],
  missingImg = false,
  imgReported = false,
  onPick,
  onToggleFlag,
  onAddTag,
  onRemoveTag,
  onReportImg,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const answered = picked !== null
  const correct = answered && picked === question.answer

  const commit = () => {
    const t = newTag.trim()
    if (t && onAddTag) onAddTag(t)
    setNewTag('')
    setAdding(false)
  }

  return (
    <div className="card">
      <div className="q-head">
        <span className="q-meta">{question.year} 年</span>
        <span className="q-meta">{question.subject}</span>
        <span className="q-no">第 {question.no} 题</span>
        {skipped && <span className="skip-badge">⏭ 已跳过</span>}
        {missingImg && (
          <button
            className={'img-report' + (imgReported ? ' on' : '')}
            onClick={onReportImg}
            title="题目提到了图/表但题库暂未收录图片。点击上报，方便后续统一补图。"
          >
            {imgReported ? '✓ 已上报缺图' : '⚠ 缺图 · 上报'}
          </button>
        )}
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

      {/* 标签管理区：始终显示，方便加自定义标签 */}
      {(onAddTag || tags.length > 0) && (
        <div className="tag-bar">
          <span className="tag-bar-label">标签：</span>
          {tags.map((t) => (
            <span key={t} className="tag custom" onClick={() => onRemoveTag?.(t)} title="点击删除">
              {t} ×
            </span>
          ))}
          {adding ? (
            <>
              <input
                className="tag-input"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setNewTag('')
                  }
                }}
                placeholder="输入标签名"
                autoFocus
                maxLength={12}
              />
              <button className="tag-add-btn" onClick={commit} disabled={!newTag.trim()}>
                添加
              </button>
              <button className="tag-add-btn" onClick={() => { setAdding(false); setNewTag('') }}>
                取消
              </button>
            </>
          ) : (
            onAddTag && (
              <button className="tag-add-btn" onClick={() => setAdding(true)}>
                + 加标签
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
