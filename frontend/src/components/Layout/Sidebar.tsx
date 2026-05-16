import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Gamepad2,
  Plus,
  FolderInput,
  Clock,
  List,
  Ban,
  BookX,
  HardDrive,
  Wifi,
  Server,
  FileInput,
  Plug,
  Database,
  Tag,
  Settings,
  Monitor,
  Star,
  Activity,
  CheckSquare,
  Archive,
  RefreshCw,
  Bell,
  FileText,
} from 'lucide-react'
import { systemApi } from '../../api/system'

interface Child {
  to: string
  icon: React.ReactNode
  label: string
}

interface Section {
  key: string
  to: string
  icon: React.ReactNode
  label: string
  prefix: string
  children: Child[]
}

const SECTIONS: Section[] = [
  {
    key: 'games',
    to: '/games',
    icon: <Gamepad2 size={16} />,
    label: 'Games',
    prefix: '/games',
    children: [
      { to: '/games/add', icon: <Plus size={14} />, label: 'Add New' },
      { to: '/games/import', icon: <FolderInput size={14} />, label: 'Library Import' },
    ],
  },
  {
    key: 'activity',
    to: '/activity',
    icon: <Clock size={16} />,
    label: 'Activity',
    prefix: '/activity',
    children: [
      { to: '/activity/queue', icon: <Clock size={14} />, label: 'Queue' },
      { to: '/activity/history', icon: <List size={14} />, label: 'History' },
      { to: '/activity/blocklist', icon: <Ban size={14} />, label: 'Blocklist' },
    ],
  },
  {
    key: 'wanted',
    to: '/wanted',
    icon: <BookX size={16} />,
    label: 'Wanted',
    prefix: '/wanted',
    children: [{ to: '/wanted/missing', icon: <BookX size={14} />, label: 'Missing' }],
  },
  {
    key: 'settings',
    to: '/settings',
    icon: <Settings size={16} />,
    label: 'Settings',
    prefix: '/settings',
    children: [
      { to: '/settings/mediamanagement', icon: <HardDrive size={14} />, label: 'Media Management' },
      { to: '/settings/profiles', icon: <Star size={14} />, label: 'Profiles' },
      { to: '/settings/indexers', icon: <Wifi size={14} />, label: 'Indexers' },
      { to: '/settings/downloadclients', icon: <Server size={14} />, label: 'Download Clients' },
      { to: '/settings/lists', icon: <FileInput size={14} />, label: 'Import Lists' },
      { to: '/settings/connect', icon: <Plug size={14} />, label: 'Connect' },
      { to: '/settings/metadata', icon: <Database size={14} />, label: 'Metadata' },
      { to: '/settings/tags', icon: <Tag size={14} />, label: 'Tags' },
      { to: '/settings/general', icon: <Settings size={14} />, label: 'General' },
      { to: '/settings/ui', icon: <Monitor size={14} />, label: 'UI' },
    ],
  },
  {
    key: 'system',
    to: '/system',
    icon: <Activity size={16} />,
    label: 'System',
    prefix: '/system',
    children: [
      { to: '/system/status', icon: <Activity size={14} />, label: 'Status' },
      { to: '/system/tasks', icon: <CheckSquare size={14} />, label: 'Tasks' },
      { to: '/system/backup', icon: <Archive size={14} />, label: 'Backup' },
      { to: '/system/updates', icon: <RefreshCw size={14} />, label: 'Updates' },
      { to: '/system/events', icon: <Bell size={14} />, label: 'Events' },
      { to: '/system/logs', icon: <FileText size={14} />, label: 'Log Files' },
    ],
  },
]

function ScrapeIndicator() {
  const { data } = useQuery({
    queryKey: ['scrape-status-sidebar'],
    queryFn: systemApi.scrapeStatus,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 15000),
  })

  if (!data?.running) return null

  const pct = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0
  const isEnriching = data.phase === 'enriching'
  const heading = isEnriching ? 'Enriching metadata' : 'Updating metadata'
  const sub = isEnriching
    ? `${data.processed.toLocaleString()} / ${data.total.toLocaleString()} enriched`
    : `${data.processed.toLocaleString()} / ${data.total.toLocaleString()} · ${data.updated} matched · ${data.failed} skipped`

  return (
    <div
      className="sidebar-scrape-indicator"
      onClick={() => (window.location.href = '/system/tasks')}
      title="Go to Tasks"
    >
      <div className="sidebar-scrape-header">
        <RefreshCw size={11} className="sidebar-scrape-spin" />
        <span>{heading}</span>
        <span className="sidebar-scrape-pct">{pct}%</span>
      </div>
      <div className="sidebar-scrape-bar">
        <div
          className="sidebar-scrape-fill"
          style={{
            width: data.total > 0 ? `${pct}%` : '100%',
            animation: data.total > 0 ? 'none' : 'progress-indeterminate 1.4s ease infinite',
          }}
        />
      </div>
      <div className="sidebar-scrape-sub">{sub}</div>
    </div>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const s of SECTIONS) {
      if (location.pathname.startsWith(s.prefix)) initial.add(s.key)
    }
    return initial
  })

  // Auto-expand only the active section, collapse all others
  useEffect(() => {
    for (const s of SECTIONS) {
      if (location.pathname.startsWith(s.prefix)) {
        setOpen(new Set([s.key]))
        break
      }
    }
  }, [location.pathname])

  function handleParent(s: Section) {
    navigate(s.to)
    setOpen((prev) => (prev.has(s.key) ? new Set() : new Set([s.key])))
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/favicon.png" alt="Romarr" style={{ width: 36, height: 36 }} />
        Romarr
      </div>

      <nav className="sidebar-nav" style={{ flex: 1 }}>
        {SECTIONS.map((s) => {
          const isOpen = open.has(s.key)
          const isActive = location.pathname.startsWith(s.prefix)
          return (
            <div key={s.key}>
              <div
                className={`nav-item nav-item--parent${isActive ? ' active' : ''}`}
                onClick={() => handleParent(s)}
              >
                <span className="nav-icon">{s.icon}</span>
                {s.label}
                <span className="nav-chevron">
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
              </div>

              {isOpen &&
                s.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    className={({ isActive }) =>
                      `nav-item nav-item--sub${isActive ? ' active' : ''}`
                    }
                  >
                    <span className="nav-icon">{c.icon}</span>
                    {c.label}
                  </NavLink>
                ))}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <ScrapeIndicator />
      </div>
    </aside>
  )
}
