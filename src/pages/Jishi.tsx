import { useEffect, useMemo, useRef, useState } from 'react'
import {
  JISHI_DRILLS,
  JISHI_ERRORS,
  JISHI_IRON_RULES,
  JISHI_LAYER_INFO,
  JISHI_PHASES,
  JISHI_PREFLIGHT,
  JISHI_SCHOOLS,
  JISHI_TEMPLATES,
  JISHI_WEEKS,
} from '../data/jishi'
import { fmtSec, useJishi, type JishiAttempt } from '../store/jishiStore'

// ============================================================
// P2 · 复试机试模块
//
// 定位（与 data/jishi.ts 一致）：不做在线判题 —— 纯前端 PWA 无法安全
// 执行任意代码。这里做三件真正影响考场得分的事：
//   1. 模板「盲默写」计时（开始后参考代码隐藏），达标与否写入 localStorage
//   2. 考前反复看的素材：高频错误表 + 180 分钟手册 + 各校形态
//   3. 专题题单勾选（外链牛客 / PAT / 洛谷，不抓取内容）
// ============================================================

/** 掌握状态 → 展示样式 */
function masteryOf(a: JishiAttempt | undefined, targetMin: number) {
  if (!a) return { cls: 'idle', text: '未默写' }
  if (a.lastPass) {
    const best = a.bestSec == null ? a.lastSec : a.bestSec
    return { cls: 'ok', text: `✓ 已达标 · 最好 ${fmtSec(best)}（目标 ${targetMin} 分）` }
  }
  return { cls: 'bad', text: `△ 超时 · 最近 ${fmtSec(a.lastSec)}（目标 ${targetMin} 分）` }
}

export default function Jishi() {
  const { templates, todos, recordDrill, clearTemplate, toggleTodo, resetAll } = useJishi()

  const [layer, setLayer] = useState<0 | 1 | 2 | 3>(0)
  const [openCode, setOpenCode] = useState<string | null>(null)
  /** 正在默写的模板 id；非空时该卡片的参考代码被隐藏 */
  const [drillId, setDrillId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!drillId) return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
    return () => clearInterval(t)
  }, [drillId])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1600)
    return () => clearTimeout(t)
  }, [copied])

  const shown = useMemo(
    () => (layer === 0 ? JISHI_TEMPLATES : JISHI_TEMPLATES.filter((t) => t.layer === layer)),
    [layer],
  )

  const overall = useMemo(() => {
    let tried = 0
    let passed = 0
    for (const t of JISHI_TEMPLATES) {
      const a = templates[t.id]
      if (!a) continue
      tried++
      if (a.lastPass) passed++
    }
    return { tried, passed, total: JISHI_TEMPLATES.length }
  }, [templates])

  const layerStats = useMemo(() => {
    const out: Record<1 | 2 | 3, { tried: number; passed: number; total: number }> = {
      1: { tried: 0, passed: 0, total: 0 },
      2: { tried: 0, passed: 0, total: 0 },
      3: { tried: 0, passed: 0, total: 0 },
    }
    for (const t of JISHI_TEMPLATES) {
      const st = out[t.layer]
      st.total++
      const a = templates[t.id]
      if (a) {
        st.tried++
        if (a.lastPass) st.passed++
      }
    }
    return out
  }, [templates])

  const drillTodoCount = todos.length

  const startDrill = (id: string) => {
    setOpenCode(null)
    startedAt.current = Date.now()
    setElapsed(0)
    setDrillId(id)
  }

  const finishDrill = (id: string, limitMin: number) => {
    recordDrill(id, Math.max(1, elapsed), limitMin)
    setDrillId(null)
  }

  const copyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(id)
    } catch {
      setCopied(null)
    }
  }

  /** 各校机试形态按档分组（顺序即严重程度） */
  const schoolTiers = useMemo(() => {
    const order = ['一票否决', '高权重计分', '不量化但可见'] as const
    return order
      .map((tier) => ({ tier, list: JISHI_SCHOOLS.filter((s) => s.tier === tier) }))
      .filter((g) => g.list.length > 0)
  }, [])

  return (
    <>
      <div className="card jishi-hero">
        <div className="sec-title" style={{ marginTop: 0 }}>
          复试机试 · 独立赛道
        </div>
        <div className="jishi-hero-sub">
          机试与初试是两套完全不同的考核。这里不判题（纯前端无法安全执行代码），
          只解决真正决定分数的三件事：<b>模板能不能凭记忆默写</b>、
          <b>翻车点记不记得住</b>、<b>题有没有刷够</b>。
        </div>

        <div className="jishi-preflight">
          <div className="jishi-preflight-title">动手之前，先确认这三件事</div>
          {JISHI_PREFLIGHT.map((p, i) => (
            <div key={i} className="jishi-preflight-item">
              <div className="jishi-preflight-item-name">
                {i + 1}. {p.item}
              </div>
              <div className="jishi-preflight-item-where">去哪查：{p.where}</div>
              <div className="jishi-preflight-item-why">为什么：{p.why}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          通关闭环 · {overall.passed} / {overall.total} 达标（已默写 {overall.tried} 个）
        </div>
        {([1, 2, 3] as const).map((l) => {
          const st = layerStats[l]
          const pct = st.total === 0 ? 0 : Math.round((st.passed / st.total) * 100)
          return (
            <div className="stat-row" key={l}>
              <span className="name">第{l === 1 ? '一' : l === 2 ? '二' : '三'}层</span>
              <div className="bar-wrap">
                <div className="bar" style={{ width: `${pct}%` }} />
              </div>
              <span className="pct">
                {st.passed}/{st.total}
              </span>
            </div>
          )
        })}
        <div className="jishi-layer-info">
          {([1, 2, 3] as const).map((l) => (
            <div key={l} className="jishi-layer-info-row">
              <b>{JISHI_LAYER_INFO[l].name}</b>
              <span className="jishi-share">{JISHI_LAYER_INFO[l].share}</span>
              <span className="jishi-desc">{JISHI_LAYER_INFO[l].desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          14 个必默写模板 · 开始后参考代码隐藏，凭记忆写
        </div>
        <div className="chips">
          <button className={'chip' + (layer === 0 ? ' on' : '')} onClick={() => setLayer(0)}>
            全部 {JISHI_TEMPLATES.length}
          </button>
          {([1, 2, 3] as const).map((l) => (
            <button key={l} className={'chip' + (layer === l ? ' on' : '')} onClick={() => setLayer(l)}>
              {JISHI_LAYER_INFO[l].name}
            </button>
          ))}
        </div>

        <div className="jishi-tpl-list">
          {shown.map((t) => {
            const a = templates[t.id]
            const m = masteryOf(a, t.minutes)
            const drilling = drillId === t.id
            const passed = a?.lastPass ?? false
            const over = elapsed > t.minutes * 60

            return (
              <div key={t.id} className={'jishi-tpl' + (passed ? ' ok' : '')}>
                <div className="jishi-tpl-head">
                  <span className="jishi-tpl-no">{t.no}</span>
                  <span className="jishi-tpl-name">{t.name}</span>
                  <span className={'jishi-tpl-state ' + m.cls}>{m.text}</span>
                </div>
                <div className="jishi-tpl-note">
                  ⚠ {t.note} · 目标 {t.minutes} 分钟 · 已练 {a?.rounds ?? 0} 次
                </div>

                {drilling ? (
                  <div className="jishi-timer">
                    <div className="jishi-timer-clock" data-over={over ? '1' : '0'}>
                      ⏱ {fmtSec(elapsed)}
                    </div>
                    <div className="jishi-timer-hint">
                      目标 {t.minutes} 分内默写完；{over ? '已超时，写完也算未达标' : '继续，别偷看'}
                    </div>
                    <div className="jishi-timer-actions">
                      <button
                        className="nav-btn primary"
                        onClick={() => finishDrill(t.id, t.minutes)}
                      >
                        我写完了 · 记录用时
                      </button>
                      <button className="nav-btn" onClick={() => setDrillId(null)}>
                        放弃本次
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="jishi-tpl-actions">
                    <button className="nav-btn primary" onClick={() => startDrill(t.id)}>
                      ▶ 开始默写计时
                    </button>
                    <button
                      className="link-btn"
                      onClick={() => setOpenCode(openCode === t.id ? null : t.id)}
                    >
                      {openCode === t.id ? '▾ 收起参考代码' : '▸ 看参考代码'}
                    </button>
                    <button className="link-btn" onClick={() => copyCode(t.id, t.code)}>
                      {copied === t.id ? '✓ 已复制' : '复制'}
                    </button>
                    {a && (
                      <button className="link-btn danger" onClick={() => clearTemplate(t.id)}>
                        清除记录
                      </button>
                    )}
                  </div>
                )}

                {openCode === t.id && !drilling && (
                  <pre className="jishi-code">{t.code}</pre>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          考场 180 分钟操作手册
        </div>
        <div className="jishi-phases">
          {JISHI_PHASES.map((p, i) => (
            <div key={i} className="jishi-phase">
              <div className="jishi-phase-left">
                <div className="jishi-phase-stage">{p.stage}</div>
                <div className="jishi-phase-time">{p.time}</div>
              </div>
              <div className="jishi-phase-what">{p.what}</div>
            </div>
          ))}
        </div>
        <div className="jishi-rules">
          {JISHI_IRON_RULES.map((r, i) => (
            <div key={i} className="jishi-rule">
              🔒 {r}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          高频错误速查表（出问题时先看这张表）
        </div>
        <div className="jishi-err-head">
          <span>现象</span>
          <span>原因</span>
          <span>处理</span>
        </div>
        {JISHI_ERRORS.map((e, i) => (
          <div key={i} className="jishi-err-row">
            <span className="jishi-err-symptom">{e.symptom}</span>
            <span className="jishi-err-cause">{e.cause}</span>
            <span className="jishi-err-action">{e.action}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          专题题单 · 已勾选 {drillTodoCount} / {JISHI_DRILLS.length} 组
        </div>
        <div className="jishi-drill-list">
          {JISHI_DRILLS.map((d) => {
            const on = todos.includes(d.id)
            return (
              <div key={d.id} className={'jishi-drill' + (on ? ' on' : '')}>
                <button
                  className={'jishi-check' + (on ? ' on' : '')}
                  onClick={() => toggleTodo(d.id)}
                  aria-label={on ? '取消勾选' : '勾选完成'}
                >
                  {on ? '✓' : ''}
                </button>
                <div className="jishi-drill-main">
                  <div className="jishi-drill-name">
                    {d.name}
                    <span className="jishi-drill-week">{d.week}</span>
                    <span className="jishi-drill-target">目标 {d.target} 题</span>
                  </div>
                  <div className="jishi-drill-links">
                    {d.links.map((l) => (
                      <a
                        key={l.url}
                        className="jishi-link"
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {l.name} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="exam-hint">
          只做跳转，不抓取平台内容 —— 版权与稳定性都不在自己手里，链接过去练更实在。
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          12 周节奏
        </div>
        <div className="jishi-weeks">
          <div className="jishi-week-head">
            <span>周</span>
            <span>专题</span>
            <span>题量</span>
            <span>重点</span>
          </div>
          {JISHI_WEEKS.map((w) => (
            <div key={w.week} className="jishi-week-row">
              <span className="jishi-week-w">{w.week}</span>
              <span className="jishi-week-topic">{w.topic}</span>
              <span className="jishi-week-target">{w.target}</span>
              <span className="jishi-week-focus">{w.focus}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="sec-title" style={{ marginTop: 0 }}>
          各校机试形态（决定 P2 该投入多少）
        </div>
        {schoolTiers.map((g) => (
          <div key={g.tier} className="jishi-school-group">
            <div className={'jishi-tier' + (g.tier === '一票否决' ? ' veto' : g.tier === '高权重计分' ? ' heavy' : '')}>
              {g.tier}（{g.list.length} 所）
            </div>
            {g.list.map((s) => (
              <div key={s.school} className="jishi-school">
                <span className="jishi-school-name">{s.school}</span>
                <span className="jishi-school-detail">{s.detail}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="exam-hint" style={{ textAlign: 'left' }}>
          一票否决型（北大 0 题不进面试、厦大 &lt;60 淘汰、矿大 &lt;50 淘汰）与「不量化但可见」型的
          投入完全不同量级 —— 所以上面那三次确认一定要先做完。
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <button
          className="danger-btn"
          onClick={() => {
            if (confirm('清空机试模块的全部默写记录与题单勾选？此操作不可撤销。')) resetAll()
          }}
        >
          清空机试记录
        </button>
      </div>
    </>
  )
}
