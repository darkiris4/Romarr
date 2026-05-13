import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Gamepad2, Plus, FolderInput,
  Clock, List, Ban,
  BookX,
  HardDrive, Wifi, Server, FileInput, Plug, Database, Tag, Settings, Monitor,
  Activity, CheckSquare, Archive, RefreshCw, Bell, FileText,
} from 'lucide-react'

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
    key: 'games', to: '/games', icon: <Gamepad2 size={16} />, label: 'Games', prefix: '/games',
    children: [
      { to: '/games/add',    icon: <Plus size={14} />,        label: 'Add New' },
      { to: '/games/import', icon: <FolderInput size={14} />, label: 'Library Import' },
    ],
  },
  {
    key: 'activity', to: '/activity', icon: <Clock size={16} />, label: 'Activity', prefix: '/activity',
    children: [
      { to: '/activity/queue',     icon: <Clock size={14} />,    label: 'Queue' },
      { to: '/activity/history',   icon: <List size={14} />,     label: 'History' },
      { to: '/activity/blocklist', icon: <Ban size={14} />,      label: 'Blocklist' },
    ],
  },
  {
    key: 'wanted', to: '/wanted', icon: <BookX size={16} />, label: 'Wanted', prefix: '/wanted',
    children: [
      { to: '/wanted/missing', icon: <BookX size={14} />, label: 'Missing' },
    ],
  },
  {
    key: 'settings', to: '/settings', icon: <Settings size={16} />, label: 'Settings', prefix: '/settings',
    children: [
      { to: '/settings/mediamanagement', icon: <HardDrive size={14} />,  label: 'Media Management' },
      { to: '/settings/indexers',         icon: <Wifi size={14} />,       label: 'Indexers' },
      { to: '/settings/downloadclients',  icon: <Server size={14} />,     label: 'Download Clients' },
      { to: '/settings/lists',            icon: <FileInput size={14} />,  label: 'Import Lists' },
      { to: '/settings/connect',          icon: <Plug size={14} />,       label: 'Connect' },
      { to: '/settings/metadata',         icon: <Database size={14} />,   label: 'Metadata' },
      { to: '/settings/tags',             icon: <Tag size={14} />,        label: 'Tags' },
      { to: '/settings/general',          icon: <Settings size={14} />,   label: 'General' },
      { to: '/settings/ui',               icon: <Monitor size={14} />,    label: 'UI' },
    ],
  },
  {
    key: 'system', to: '/system', icon: <Activity size={16} />, label: 'System', prefix: '/system',
    children: [
      { to: '/system/status',  icon: <Activity size={14} />,    label: 'Status' },
      { to: '/system/tasks',   icon: <CheckSquare size={14} />, label: 'Tasks' },
      { to: '/system/backup',  icon: <Archive size={14} />,     label: 'Backup' },
      { to: '/system/updates', icon: <RefreshCw size={14} />,   label: 'Updates' },
      { to: '/system/events',  icon: <Bell size={14} />,        label: 'Events' },
      { to: '/system/logs',    icon: <FileText size={14} />,    label: 'Log Files' },
    ],
  },
]

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

  // Auto-expand when navigating into a section
  useEffect(() => {
    for (const s of SECTIONS) {
      if (location.pathname.startsWith(s.prefix)) {
        setOpen(prev => prev.has(s.key) ? prev : new Set([...prev, s.key]))
      }
    }
  }, [location.pathname])

  function handleParent(s: Section) {
    navigate(s.to)
    setOpen(prev => {
      const next = new Set(prev)
      next.has(s.key) ? next.delete(s.key) : next.add(s.key)
      return next
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/favicon.png" alt="Romarr" style={{ width: 36, height: 36 }} />
        Romarr
      </div>

      <nav className="sidebar-nav">
        {SECTIONS.map(s => {
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

              {isOpen && s.children.map(c => (
                <NavLink
                  key={c.to}
                  to={c.to}
                  className={({ isActive }) => `nav-item nav-item--sub${isActive ? ' active' : ''}`}
                >
                  <span className="nav-icon">{c.icon}</span>
                  {c.label}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
