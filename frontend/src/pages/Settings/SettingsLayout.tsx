import { NavLink, Outlet } from 'react-router-dom'
import { HardDrive, MonitorPlay, Wifi, Server, List, Settings } from 'lucide-react'

const NAV = [
  { to: '/settings/mediamanagement', icon: <HardDrive size={14} />, label: 'Media Management' },
  { to: '/settings/platforms',       icon: <MonitorPlay size={14} />, label: 'Platforms' },
  { to: '/settings/indexers',        icon: <Wifi size={14} />,        label: 'Indexers' },
  { to: '/settings/downloadclients', icon: <Server size={14} />,      label: 'Download Clients' },
  { to: '/settings/lists',           icon: <List size={14} />,        label: 'Lists' },
  { to: '/settings/general',         icon: <Settings size={14} />,    label: 'General' },
]

export default function SettingsLayout() {
  return (
    <div className="settings-layout" style={{ margin: '-20px -24px' }}>
      <nav className="settings-nav">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `settings-nav-item${isActive ? ' active' : ''}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  )
}
