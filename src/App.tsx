import { useMemo } from 'react'
import { NavLink, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Practice from './pages/Practice'
import WrongBook from './pages/WrongBook'
import Stats from './pages/Stats'
import MissingImg from './pages/MissingImg'
import Archived from './pages/Archived'
import { BANK, archivedCount, useQuiz } from './store/quizStore'

export default function App() {
  const reported = useQuiz((s) => s.imgReports.length)
  const attempts = useQuiz((s) => s.attempts)
  const unarchived = useQuiz((s) => s.unarchived)
  const archN = useMemo(() => archivedCount(), [attempts, unarchived])
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          408 刷题<small>{BANK.length} 题可用 · 2009-2024</small>
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
        <Route path="/wrong" element={<WrongBook />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/missing" element={<MissingImg />} />
        <Route path="/archived" element={<Archived />} />
      </Routes>
    </div>
  )
}
