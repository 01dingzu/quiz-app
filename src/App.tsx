import { useMemo } from 'react'
import { NavLink, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Practice from './pages/Practice'
import WrongBook from './pages/WrongBook'
import Stats from './pages/Stats'
import MissingImg from './pages/MissingImg'
import Archived from './pages/Archived'
import Jishi from './pages/Jishi'
import { BANK, archivedCount, availablePapers, useQuiz } from './store/quizStore'

export default function App() {
  const reported = useQuiz((s) => s.imgReports.length)
  const attempts = useQuiz((s) => s.attempts)
  const unarchived = useQuiz((s) => s.unarchived)
  const archN = useMemo(() => archivedCount(), [attempts, unarchived])
  // 副标题从题库实际覆盖的试卷推导，避免新增试卷后这里忘记改（英语一就是这么漏的）
  const paperList = useMemo(() => availablePapers().join(' / '), [])
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          考研刷题<small>{BANK.length} 题 · {paperList}</small>
        </div>
        <nav className="tabs">
          <NavLink
            to="/"
            end
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            练习
          </NavLink>
          <NavLink
            to="/jishi"
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            机试
          </NavLink>
          <NavLink
            to="/wrong"
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            错题本
          </NavLink>
          <NavLink
            to="/stats"
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            统计
          </NavLink>
          <NavLink
            to="/missing"
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            缺图{reported > 0 ? ` ${reported}` : ''}
          </NavLink>
          <NavLink
            to="/archived"
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            归档{archN > 0 ? ` ${archN}` : ''}
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/jishi" element={<Jishi />} />
        <Route path="/wrong" element={<WrongBook />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/missing" element={<MissingImg />} />
        <Route path="/archived" element={<Archived />} />
      </Routes>
    </div>
  )
}
