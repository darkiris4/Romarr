import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const PAGE_TITLES: Record<string, string> = {
  '/games': 'Games',
  '/calendar': 'Calendar',
  '/activity/queue': 'Queue',
  '/activity/history': 'History',
  '/wanted/missing': 'Wanted — Missing',
  '/settings/mediamanagement': 'Settings — Media Management',
  '/settings/platforms': 'Settings — Platforms',
  '/settings/indexers': 'Settings — Indexers',
  '/settings/downloadclients': 'Settings — Download Clients',
  '/settings/lists': 'Settings — Lists',
  '/settings/general': 'Settings — General',
  '/system/status': 'System — Status',
  '/system/tasks': 'System — Tasks',
  '/system/logs': 'System — Logs',
}

export default function Layout() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'Romarr'

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header title={title} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
