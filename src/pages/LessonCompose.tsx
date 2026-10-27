import { useNavigate } from 'react-router-dom'
import LessonComposer from '../components/LessonComposer'

/**
 * /learn/compose：按考点组题独立页。
 * 逻辑全部在 components/LessonComposer（与首页练习卡共用同一实现），
 * 这里只提供返回入口与独立模式开关。
 */
export default function LessonCompose() {
  const nav = useNavigate()
  return (
    <>
      <button className="btn sol-btn back-btn" onClick={() => nav('/learn')}>
        ← 返回考点列表
      </button>
      <LessonComposer standalone />
    </>
  )
}
