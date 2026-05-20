import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import HealthBanner from './HealthBanner'

export default function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header />
        <HealthBanner />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
