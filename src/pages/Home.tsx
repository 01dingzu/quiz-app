import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useQuiz,
  BANK,
  archivedCount,
  availablePapers,
  dueCount,
  examAvailability,
  examFullScore,
  examQuestionCount,
  missingImgQuestions,
  paperOfFilter,
  paperSubjects,
  paperYears,
  practiceCount,
  resumeInfo,
} from '../store/quizStore'
import {
  PAPER_EXAM,
  PAPER_INFO,
  PAPER_KPI,
  type Paper,
  type Subject,
} from '../types'
import { JISHI_DRILLS, JISHI_TEMPLATES } from '../data/jishi'

/** 试卷切换器上的副标题：题库覆盖 / 客观题分值 / 正确率 KPI */
function paperSubtitle(p: Paper): string {
  const n = BANK.filter((q) => (q.paper ?? '408') === p).length
  return `${n} 题 · 客观 ${PAPER_INFO[p].objective}/${PAPER_INFO[p].total} 分 · 目标正确率 ${Math.round(
    PAPER_KPI[p] * 100,
  )}%`
}

/** 练习设置页：试卷 / 年份 / 科目筛选 + 自由练习 / 模拟考试 / 机试入口 */
export default function Home() {
  const {
    filter,
    setFilter,
    setPaper,
    startSession,
    startExam,
    startReview,
    attempts,
    flagged,
    resumeSession,
    imgReports,
    unarchived,
  } = useQuiz()
  const nav = useNavigate()

  const paper = paperOfFilter(filter)
  const bp = PAPER_EXAM[paper]

  /** 时长：null = 用该试卷的默认时长；切换试卷时重置 */
  const [duration, setDuration] = useState<number | null>(null)
  useEffect(() => setDuration(null), [paper])
  const effDuration = duration ?? bp?.durationMin ?? 0

  const due = useMemo(() => dueCount(attempts, flagged), [attempts, flagged])

  const resume = useMemo(() => resumeInfo(), [attempts])
  const papers = useMemo(() => availablePapers(), [])
  const years = useMemo(() => paperYears(paper), [paper])
  const subs = useMemo(() => paperSubjects(paper), [paper])

  const allYears = filter.years.length === 0
  const allSubjects = filter.subjects.length === 0

  const count = useMemo(
    () =>
      BANK.filter(
        (q) =>
          (q.paper ?? '408') === paper &&
          (allYears || filter.years.includes(q.year)) &&
          (allSubjects || filter.subjects.includes(q.subject)),
      ).length,
    [paper, allYears, allSubjects, filter],
  )

  const available = useMemo(() => practiceCount(filter), [filter, attempts, unarchived])
  const missingCount = useMemo(() => missingImgQuestions(paper).length, [paper])
  const archN = useMemo(() => archivedCount(paper), [attempts, unarchived, paper])

  const slots = useMemo(() => examAvailability(filter), [filter])
  const examCanStart = slots.length > 0 && slots.every((s) => s.ok)
  const examQ = examQuestionCount(paper)
  const examScore = examFullScore(filter)

  const toggleYear = (y: number) => {
    const cur = allYears ? years : filter.years
    const next = cur.includes(y) ? cur.filter((v) => v !== y) : [...cur, y].sort((a, b) => a - b)
    setFilter({ years: next.length === years.length ? [] : next })
  }

  const toggleSubject = (s: string) => {
    const cur = allSubjects ? subs : filter.subjects
    const next = cur.includes(s) ? cur.filter((v) => v !== s) : [...cur, s]
    setFilter({ subjects: next.length === subs.length ? [] : (next as Subject[]) })
  }

  const startPractice = () => {
    startSession()
    nav('/practice')
  }

  const startExamNow = () => {
    startExam(effDuration)
    nav('/practice')
  }

  const startReviewNow = () => {
    startReview()
    nav('/practice')
  }

  const resumeNow = () => {
    resumeSession()
    nav('/practice')
  }

  const durationChoices = useMemo(() => {
    const s = new Set<number>([0, 60, 90, 180])
    if (bp) s.add(bp.durationMin)
    return [...s].sort((a, b) => a - b)
  }, [bp])

  return (
    <>
      {resume && (
        <div className="card resume-card">
          <div className="sec-title">⏸ 继续上次练习（进度已自动保存，刷新/关闭页面不丢失）</div>
          <div className="review-info">
            <div className="review-lbl">
              <b>{resume.label}</b> · 上次做到第 {resume.index + 1} / {resume.total} 题 · 已答{' '}
              {resume.done} 题
              <div className="review-sub">
                {resume.skipped > 0
                  ? `有 ${resume.skipped} 道跳过的题未答，继续后将优先展示。`
                  : '继续后从上次的题目接着做，作答记录全部保留。'}
              </div>
            </div>
          </div>
          <button className="start-btn review" onClick={resumeNow}>
            继续练习 →
          </button>
        </div>
      )}

      <div className="card paper-card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          试卷（切换会重置年份 / 科目筛选）
        </div>
        <div className="paper-row">
          {papers.map((p) => (
            <button
              key={p}
              className={'paper-btn' + (p === paper ? ' on' : '')}
              onClick={() => setPaper(p)}
            >
              <span className="paper-name">{PAPER_INFO[p].short}</span>
              <span className="paper-full">{PAPER_INFO[p].full}</span>
            </button>
          ))}
        </div>
        <div className="paper-sub">
          当前：{PAPER_INFO[paper].full} —— {paperSubtitle(paper)}
        </div>
      </div>

      <div className="card">
        <div className="sec-title">
          年份（当前：{allYears ? `全部 ${years.length} 年` : `${filter.years.length} 年`}）
        </div>
        <div className="chips">
          <button className={'chip' + (allYears ? ' on' : '')} onClick={() => setFilter({ years: [] })}>
            全部
          </button>
          {years.map((y) => (
            <button
              key={y}
              className={'chip' + (allYears || filter.years.includes(y) ? ' on' : '')}
              onClick={() => toggleYear(y)}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="sec-title">
          科目（当前：{allSubjects ? `全部 ${subs.length} 科` : `${filter.subjects.length} 科`}）
        </div>
        <div className="chips">
          <button
            className={'chip' + (allSubjects ? ' on' : '')}
            onClick={() => setFilter({ subjects: [] })}
          >
            全部
          </button>
          {subs.map((s) => (
            <button
              key={s}
              className={'chip' + (allSubjects || filter.subjects.includes(s as Subject) ? ' on' : '')}
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
        <button className="start-btn" disabled={available === 0} onClick={startPractice}>
          {available === 0 ? `当前筛选已全部归档（${archN} 题）` : `开始练习 · 共 ${available} 题`}
        </button>
        {available < count && (
          <div className="exam-hint">
            已自动隐藏 {count - available} 道答对归档的题；如需重做可到「归档」页移出。
          </div>
        )}
      </div>

      <div className="card review-card">
        <div className="sec-title">今日复习（SRS 间隔重复 · 错题自动消化）</div>
        <div className="review-info">
          <div className="review-num">{due}</div>
          <div className="review-lbl">
            题待复习
            <div className="review-sub">
              {due === 0
                ? '当前没有需要复习的题目。做完练习或考试后，错题会自动加入复习队列。'
                : '基于 SM-2 算法：答对延后复习，答错立即重排。队列跨试卷共用。'}
            </div>
          </div>
        </div>
        <button className="start-btn review" disabled={due === 0} onClick={startReviewNow}>
          {due === 0 ? '暂无待复习' : `开始复习 · ${due} 题`}
        </button>
      </div>

      {bp ? (
        <div className="card exam-card">
          <div className="sec-title" style={{ marginTop: 0 }}>
            模拟考试（{paper} · {bp.note}）
          </div>
          <div className={'ratio-grid' + (slots.length > 2 ? ' g3' : '')}>
            {slots.map((s) => (
              <div key={s.label} className={'ratio-cell' + (s.ok ? '' : ' warn')}>
                <div className="ratio-sub">{s.label}</div>
                <div className="ratio-need">
                  {s.need} 题 <span className="ratio-have">/ 可用 {s.have}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="sec-title">时长</div>
          <div className="chips">
            {durationChoices.map((m) => (
              <button
                key={m}
                className={'chip' + (effDuration === m ? ' on' : '')}
                onClick={() => setDuration(m)}
              >
                {m === 0 ? '不限时' : `${m} 分钟${bp.durationMin === m ? '（默认）' : ''}`}
              </button>
            ))}
          </div>

          <button className="start-btn exam" disabled={!examCanStart} onClick={startExamNow}>
            {examCanStart
              ? `开始考试 · ${examQ} 题 · ${effDuration === 0 ? '不限时' : `${effDuration} 分钟`}`
              : '当前筛选题量不足组卷'}
          </button>
          <div className="exam-hint">
            计分按题目自身分值累加 · 估算满分 {examScore} · 完成后展示分数与分科正确率
          </div>
        </div>
      ) : (
        <div className="card exam-card">
          <div className="sec-title" style={{ marginTop: 0 }}>
            模拟考试
          </div>
          <div className="exam-hint" style={{ textAlign: 'left' }}>
            {paper} 暂未配置组卷结构，请用「自由练习」按年份 / 科目刷题。
          </div>
        </div>
      )}

      <div className="card jishi-entry">
        <div className="sec-title" style={{ marginTop: 0 }}>
          复试机试模块（独立赛道 · 不做在线判题）
        </div>
        <div className="review-info">
          <div className="review-num">{JISHI_TEMPLATES.length}</div>
          <div className="review-lbl">
            个必默写模板 · 专题题单 {JISHI_DRILLS.length} 组
            <div className="review-sub">
              14 个模板的默写计时与掌握状态、高频错误速查表、180 分钟考场手册、
              专题题单勾选（跳转牛客 / PAT / 洛谷，不抓取内容）。
            </div>
          </div>
        </div>
        <button className="start-btn exam" onClick={() => nav('/jishi')}>
          进入机试模块 →
        </button>
      </div>

      <div className="card missing-card">
        <div className="sec-title">缺图反馈（当前试卷）</div>
        <div className="review-info">
          <div className="review-num">{missingCount}</div>
          <div className="review-lbl">
            道题引用了图/表但暂无图片
            <div className="review-sub">
              做题遇到「如图但没图」时，点题目卡片上的「⚠ 缺图 · 上报」即可收集；已上报{' '}
              {imgReports.length} 道，可一键复制清单统一补图。
            </div>
          </div>
        </div>
        <button className="start-btn review" onClick={() => nav('/missing')}>
          查看缺图反馈{imgReports.length > 0 ? ` · 已上报 ${imgReports.length} 道` : ''} →
        </button>
      </div>

      <div className="card arch-card">
        <div className="sec-title">答对题归档（当前试卷）</div>
        <div className="review-info">
          <div className="review-num">{archN}</div>
          <div className="review-lbl">
            道题已归档
            <div className="review-sub">
              做过且从没错过的题自动归档，自由练习不再重复出现；曾答错但已复习毕业的题也会归档。移出后可重新练习。
            </div>
          </div>
        </div>
        <button className="start-btn review" onClick={() => nav('/archived')}>
          查看归档{archN > 0 ? ` · ${archN} 道` : ''} →
        </button>
      </div>

      <div className="card" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
        <b style={{ color: 'var(--ink)' }}>说明</b>
        <br />
        · 题库共 {BANK.length} 题：408 单选 596 + 408 综合应用题 77（2009-2024）；
        政治客观题 495（2010-2024，240 单选 + 255 多选）；数学一客观题 199（2010-2025 除 2024，
        110 选择 + 89 填空）。
        <br />
        · 覆盖边界：只做客观题。政治分析题、数学解答题、英语、主观题批改按方案 §6 明确不做。
        <br />
        · 自由练习：可任意选择年份 / 科目 / 顺序，答错自动入错题本，每题可手动「☆ 标记」。做过且从没错过的题自动归档，不再重复出现（可在「归档」页查看/移出）。
        <br />
        · 模拟考试：按各试卷真实结构组卷（408 按 11/11/10/8 抽 40 单选；政治 16 单选 + 17 多选；数学一 10 选择 + 6 填空），可选计时；始终使用完整题库（含已归档题）。
        <br />
        · 填空题判定支持等价写法（分数 / 小数、π 与 pi、`x=1` 与 `1`、多解乱序），由受限求值器完成，不执行任何代码。
        <br />
        · 数据保存在本机浏览器（localStorage），换设备不迁移。
      </div>
    </>
  )
}
