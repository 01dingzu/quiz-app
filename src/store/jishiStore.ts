import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============================================================
// 机试模块的独立持久化状态
//
// 刻意不复用 quizStore：机试是独立赛道（复试用，与初试题库无关），
// 混进主 store 会让它的 migrate / partialize 越来越难维护。
// 独立 key = 独立的失败半径。
// ============================================================

export interface JishiAttempt {
  /** 累计完成默写次数 */
  rounds: number
  /** 历史最好用时（秒） */
  bestSec: number | null
  /** 最近一次用时（秒） */
  lastSec: number
  /** 最近一次是否达标（在模板目标分钟内完成） */
  lastPass: boolean
  lastTs: number
}

interface JishiState {
  /** templateId -> 默写记录 */
  templates: Record<string, JishiAttempt>
  /** 已勾选的专题题单 id */
  todos: string[]
  /** 记录一次默写。seconds = 实际用时，limitMin = 目标分钟 */
  recordDrill: (id: string, seconds: number, limitMin: number) => void
  /** 清掉某个模板的记录 */
  clearTemplate: (id: string) => void
  /** 勾 / 取消勾专题题单 */
  toggleTodo: (id: string) => void
  resetAll: () => void
}

export const useJishi = create<JishiState>()(
  persist(
    (set, get) => ({
      templates: {},
      todos: [],

      recordDrill: (id, seconds, limitMin) => {
        const all = get().templates
        const prev = all[id]
        const pass = seconds <= limitMin * 60
        const best = prev?.bestSec == null ? seconds : Math.min(prev.bestSec, seconds)
        set({
          templates: {
            ...all,
            [id]: {
              rounds: (prev?.rounds ?? 0) + 1,
              bestSec: best,
              lastSec: seconds,
              lastPass: pass,
              lastTs: Date.now(),
            },
          },
        })
      },

      clearTemplate: (id) => {
        const next = { ...get().templates }
        delete next[id]
        set({ templates: next })
      },

      toggleTodo: (id) => {
        const cur = get().todos
        set({ todos: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
      },

      resetAll: () => set({ templates: {}, todos: [] }),
    }),
    { name: 'quiz-app:jishi:v1', version: 1 },
  ),
)

/** 秒 -> "3分12秒" */
export function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s} 秒`
  return `${m} 分 ${s} 秒`
}
