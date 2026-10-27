import { useMemo } from 'react'
import { NavLink, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Learn from './pages/Learn'
import LessonView from './pages/LessonView'
import LessonCompose from './pages/LessonCompose'
import Practice from './pages/Practice'
import WrongBook from './pages/WrongBook'
import Stats from './pages/Stats'
import MissingImg from './pages/MissingImg'
import Archived from './pages/Archived'
import Jishi from './pages/Jishi'
import { REAL_BANK, archivedCount, availablePapers, useQuiz } from './store/quizStore'

export default function App() {
  const reported = useQuiz((s) => s.imgReports.length)
  const attempts = useQuiz((s) => s.attempts)
  const unarchived = useQuiz((s) => s.unarchived)
  const archN = useMemo(() => archivedCount(), [attempts, unarchived])
  // 副标题从题库实际覆盖的试卷推导，避免新增试卷后这里忘记改（英语一就是这么漏的）
  const paperList = useMemo(() => availablePapers().join(' / '), [])
  const tab = ({ isActive }: { isActive: boolean }) => 'tab' + (isActive ? ' active' : '')
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          考研刷题<small>{REAL_BANK.length} 题 · {paperList}</small>
        </div>
        {/* 主入口：按使用频率排。考点在前（学习路径的起点），练习是执行 */}
        <nav className="tabs">
          <NavLink to="/learn" className={tab}>
            考点
          </NavLink>
          <NavLink to="/" end className={tab}>
            练习
          </NavLink>
          <NavLink to="/jishi" className={tab}>
            机试
          </NavLink>
          <NavLink to="/wrong" className={tab}>
            错题本
          </NavLink>
          <NavLink to="/stats" className={tab}>
            统计
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/compose" element={<LessonCompose />} />
        <Route path="/learn/:id" element={<LessonView />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/jishi" element={<Jishi />} />
        <Route path="/wrong" element={<WrongBook />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/missing" element={<MissingImg />} />
        <Route path="/archived" element={<Archived />} />
      </Routes>

      {/* 题库维护类页面：低频，放页脚做次级入口，不和主 tab 争位 */}
      <footer className="app-foot">
        <NavLink to="/missing" className="foot-link">
          缺图反馈{reported > 0 ? ` ${reported}` : ''}
        </NavLink>
        <span className="foot-sep">·</span>
        <NavLink to="/archived" className="foot-link">
          已归档{archN > 0 ? ` ${archN}` : ''}
        </NavLink>
      </footer>
    </div>
  )
}
