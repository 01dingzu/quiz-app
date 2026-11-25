import { useEffect, useState } from 'react'
import type { Question } from '../types'
import { loadGuideFor, type GuideView, type DiagItem } from '../lib/guide'

/**
 * AI 指引面板
 * ============================================================
 * 内容是构建期预生成、且经逐字引用校验的。信息披露的时机：
 *
 *   · 前置知识链  —— 随时可看（details 折叠），讲别的基础知识点，不泄露答案。
 *   · 知识点      —— 默认展开，可用按钮自己收起/展开，选择会记住。
 *   · 母题 + 解题骨架 —— 默认「作答前折叠、作答后自动展开」，避免提前把题目
 *                       变成填空题；但随时可以用按钮自己切换显隐，**手动选过
 *                       之后就不再随作答状态自动变化**。
 *   · 干扰项诊断   —— **只在作答后出现**，逐条说明每个错误选项错在哪。
 *
 * 显隐偏好存 localStorage（quiz-app:guide-pref），跨题、跨会话保持 ——
 * 否则每换一道题都要重新点一次，移动端尤其烦。
 *
 * 每条诊断都带来源徽标（引用原文 > 依判据推得 > 请你自查），
 * 三档可信度对学生可见，可展开逐字原文核对，而不是盲信一段黑箱文字。
 */

interface Props {
  question: Question
  /** 是否已作答 —— 决定干扰项诊断可否展示、以及母题骨架的自动展开时机 */
  revealed: boolean
}

/** 用户自己选的显隐状态（跨题保持） */
type GuidePref = {
  /** 知识点区块是否展开 */
  topic: boolean
  /** 母题骨架：'auto' = 跟随作答时机；true / false = 用户手动固定 */
  mother: boolean | 'auto'
}

const PREF_KEY = 'quiz-app:guide-pref'
const DEFAULT_PREF: GuidePref = { topic: true, mother: 'auto' }

function loadPref(): GuidePref {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (!raw) return DEFAULT_PREF
    const v = JSON.parse(raw) as Partial<GuidePref>
    return {
      topic: typeof v.topic === 'boolean' ? v.topic : true,
      mother: typeof v.mother === 'boolean' ? v.mother : 'auto',
    }
  } catch {
    return DEFAULT_PREF
  }
}

function savePref(p: GuidePref): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    // 隐私模式 / 存储被禁用：不影响做题，本次会话内 state 仍然生效
  }
}

const KIND_LABEL: Record<'conclusion' | 'criterion', { text: string; title: string }> = {
  conclusion: {
    text: '引用原文',
    title: '题库解析里直接说明了这条错误路径，指引只是把它搬过来。可展开「原文」逐字核对。',
  },
  criterion: {
    text: '依判据推得',
    title: '题库解析只给出了定义或判定标准，指引是据此比对推出的。引用真实，但从判据到诊断的推理由模型完成 —— 这类条目需要你多留一分怀疑，可展开「原文」自行核对。',
  },
}

function Badge({ item }: { item: DiagItem }) {
  const [open, setOpen] = useState(false)
  if (!item.grounded) {
    return <span className="g-badge g-probe" title="本题没有可信的解析，因此只给自查问题，不给结论。">请你自查</span>
  }
  const k = item.evidence?.kind === 'criterion' ? 'criterion' : 'conclusion'
  const label = KIND_LABEL[k]
  return (
    <span className="g-badge-wrap">
      <span className={'g-badge ' + (k === 'conclusion' ? 'g-conc' : 'g-crit')} title={label.title}>
        {label.text}
      </span>
      {item.evidence?.quote && (
        <button className="g-quote-toggle" onClick={() => setOpen((v) => !v)} title="展开题库解析原文片段">
          {open ? '收起源文' : '原文'}
        </button>
      )}
      {open && item.evidence?.quote && <span className="g-quote">「{item.evidence.quote}」</span>}
    </span>
  )
}

/**
 * 一条诊断。文本原样呈现，不做任何改写 ——
 * 指引的可信度来自「可逐字核对」，二次加工会破坏这个前提。
 */
function DiagLine({ k, item, traps }: { k: string; item: DiagItem; traps?: Record<string, { label: string }> }) {
  const body = item.grounded ? item.why : item.probe
  if (!body) return null
  const trap = item.trap && traps?.[item.trap]
  return (
    <li className="g-item">
      <span className="g-key">{k}</span>
      <span className="g-body">{body}</span>
      <Badge item={item} />
      {trap && <span className="g-trap" title={trap.label}>母题陷阱：{trap.label}</span>}
    </li>
  )
}

export default function AiGuide({ question, revealed }: Props) {
  const [view, setView] = useState<GuideView | null>(null)
  const [loading, setLoading] = useState(true)
  const [pref, setPref] = useState<GuidePref>(loadPref)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setView(null)
    loadGuideFor(question)
      .then((v) => { if (alive) { setView(v); setLoading(false) } })
      .catch(() => { if (alive) { setView(null); setLoading(false) } })
    return () => { alive = false }
  }, [question.id, question.subject, question.mt, question.topics])

  // 静默降级：没有指引数据就不渲染任何东西（连标题都不留）
  if (loading || !view) return null

  const { topic, prereqs, mother, entry, expWarn, hasDiag } = view
  const hasAny = topic || mother || entry || expWarn
  if (!hasAny) return null

  const diags = entry ? Object.entries(entry.d) : []
  // 'auto' 时保留原来的「作答前折叠、作答后展开」时机；手动选过则以用户选择为准
  const topicOpen = pref.topic
  const motherOpen = pref.mother === 'auto' ? revealed : pref.mother
  const showDiag = revealed && diags.length > 0

  const toggleTopic = () => {
    const next = { ...pref, topic: !topicOpen }
    setPref(next)
    savePref(next)
  }
  const toggleMother = () => {
    const next = { ...pref, mother: !motherOpen }
    setPref(next)
    savePref(next)
  }

  return (
    <div className="guide">
      {expWarn && (
        <div className="guide-warn">
          <span className="guide-warn-tag">解析未通过校验</span>
          {expWarn.reason}
          <span className="guide-warn-hint">
            （本题的题库解析存在疑似错误，已不作为结论来源；上面的解析仅作参考，请以教材为准。）
          </span>
        </div>
      )}

      {topic && (
        <div className="guide-block">
          <div className="guide-h">
            <span className="guide-h-t">知识点</span>
            <span className="guide-chapter">{topic.chapter}</span>
            <button
              className={'guide-toggle' + (topicOpen ? ' on' : '')}
              onClick={toggleTopic}
              title="显示 / 隐藏知识点讲解；此选择会被记住，之后每道题都按此显示"
            >
              {topicOpen ? '隐藏 ▲' : '展开 ▼'}
            </button>
          </div>
          {topicOpen && (
            <>
              <div className="guide-topic-name">{topic.name}</div>
              <p className="guide-summary">{topic.summary}</p>
              {topic.keywords.length > 0 && (
                <div className="guide-kw">
                  {topic.keywords.map((k) => <span key={k} className="guide-kw-item">{k}</span>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {prereqs.length > 0 && (
        <details className="guide-block guide-fold">
          <summary className="guide-h">
            <span className="guide-h-t">前置知识</span>
            <span className="guide-h-sub">{prereqs.length} 项 · 按学习顺序</span>
          </summary>
          <ol className="guide-pre">
            {prereqs.map((p, i) => (
              <li key={p.id}>
                <span className="guide-pre-idx">{i + 1}</span>
                <span className="guide-pre-name">{p.name}</span>
                <span className="guide-pre-sum">{p.summary}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {mother && (
        <div className="guide-block">
          <div className="guide-h">
            <span className="guide-h-t">母题</span>
            <button
              className={'guide-toggle' + (motherOpen ? ' on' : '')}
              onClick={toggleMother}
              title="显示 / 隐藏解题骨架；此选择会被记住，手动选过后不再随作答自动展开"
            >
              {motherOpen ? '隐藏骨架 ▲' : revealed ? '显示骨架 ▼' : '想不出来？看骨架 ▼'}
            </button>
          </div>
          {motherOpen ? (
            <>
              <div className="guide-mt-name">{mother.name}</div>
              <ol className="guide-skel">
                {mother.skeleton.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </>
          ) : (
            <div className="guide-hidden">解题骨架已折叠 —— 先自己走一遍，再看它怎么走。</div>
          )}
        </div>
      )}

      {showDiag && (
        <div className="guide-block">
          <div className="guide-h">
            <span className="guide-h-t">干扰项诊断</span>
            <span className="guide-h-sub">
              {entry?.src === 'probe'
                ? '本题解析不可信，只给自查问题'
                : `已锚定 ${diags.filter(([, d]) => d.grounded).length} 条`}
            </span>
          </div>
          <ul className="guide-list">
            {diags.map(([k, item]) => (
              <DiagLine key={k} k={k} item={item} traps={mother?.traps} />
            ))}
          </ul>
        </div>
      )}

      {revealed && hasDiag && diags.length === 0 && (
        <div className="guide-block guide-empty">本题暂无逐项诊断；上方的前置知识链与解题骨架可照常使用。</div>
      )}
    </div>
  )
}
