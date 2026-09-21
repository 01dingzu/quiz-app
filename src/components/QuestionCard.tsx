import { useState } from 'react'
import type { Answer, Question } from '../types'
import { gradeAnswer, typeLabel } from '../lib/grade'
import { Tex } from '../lib/tex'
import { MATERIALS } from '../store/quizStore'
import AnswerArea from './AnswerArea'

/**
 * 共享长文（英语一）。
 * - 阅读理解：一篇长文对应其后的 5 道题，题目各自带同一个 materialId，长文只存一份。
 * - 完形填空：20 个空共用一篇长文，正文里以 `{{N}}` 标记第 N 空；
 *   渲染时把**当前题**对应的那个空高亮出来，否则考生在一屏里找不到自己要做哪一空。
 */
function MaterialPassage({
  text,
  activeNo,
  open,
}: {
  text: string
  activeNo?: number
  open?: boolean
}) {
  return (
    <details className="material" open={open}>
      <summary className="material-summary">原文阅读</summary>
      <div className="material-body">
        {text.split(/\n{2,}/).map((para, pi) => (
          <p key={pi} className="material-p">
            {para.split(/\{\{(\d+)\}\}/).map((seg, si) =>
              si % 2 === 1 ? (
                <span
                  key={si}
                  className={'material-blank' + (Number(seg) === activeNo ? ' active' : '')}
                >
                  {seg}
                </span>
              ) : (
                <span key={si}>{seg}</span>
              ),
            )}
          </p>
        ))}
      </div>
    </details>
  )
}

interface Props {
  question: Question
  picked: Answer | null
  flagged: boolean
  /** 该题被跳过（待优先作答） */
  skipped?: boolean
  tags?: string[]
  /** 该题题干引用了图/表但题库无图（缺图提示） */
  missingImg?: boolean
  /** 是否已上报缺图 */
  imgReported?: boolean
  /** 是否展示共享长文（英语一）；错题本等长列表传 false 以免刷屏 */
  showMaterial?: boolean
  /** 共享长文默认是否展开（练习页展开，列表页折叠） */
  materialOpen?: boolean
  onAnswer: (a: Answer) => void
  onToggleFlag: () => void
  onAddTag?: (tag: string) => void
  onRemoveTag?: (tag: string) => void
  onReportImg?: () => void
}

/** 题目卡片：题干 + 按题型作答 + 判题/解析 + 标签管理 */
export default function QuestionCard({
  question,
  picked,
  flagged,
  skipped = false,
  tags = [],
  missingImg = false,
  imgReported = false,
  showMaterial = true,
  materialOpen = false,
  onAnswer,
  onToggleFlag,
  onAddTag,
  onRemoveTag,
  onReportImg,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')

  const grade = gradeAnswer(question, picked)
  const material = question.materialId ? MATERIALS[question.materialId] : undefined

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
        <span className="q-type">{typeLabel(question)}</span>
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

      {showMaterial && material && (
        <MaterialPassage
          text={material}
          activeNo={question.subject === '完形填空' ? question.no : undefined}
          open={materialOpen}
        />
      )}

      <p className="q-stem">
        <Tex text={question.stem} />
      </p>

      <AnswerArea
        key={question.id}
        question={question}
        picked={picked}
        onAnswer={onAnswer}
      />

      {grade.answered && (
        <div className={'verdict ' + (grade.correct ? 'ok' : 'bad')}>
          {grade.correct ? '✓ ' : '✗ '}
          {grade.label}
          {question.explanation && (
            <div className="expl">
              <span className="expl-tag">解析：</span>
              <Tex text={question.explanation} />
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
