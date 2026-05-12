import { NavLink } from 'react-router-dom'
import {
  Gamepad2, Calendar, Clock, BookX, Settings,
  Server, List, Wifi, HardDrive, MonitorPlay, FileText,
} from 'lucide-react'

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Gamepad2 size={22} />
        Romarr
      </div>

      <nav className="sidebar-nav">
        <NavItem to="/games" icon={<Gamepad2 size={16} />} label="Games" />
        <NavItem to="/calendar" icon={<Calendar size={16} />} label="Calendar" />

        <div className="nav-section-label">Activity</div>
        <NavItem to="/activity/queue" icon={<Clock size={16} />} label="Queue" />
        <NavItem to="/activity/history" icon={<List size={16} />} label="History" />

        <div className="nav-section-label">Wanted</div>
        <NavItem to="/wanted/missing" icon={<BookX size={16} />} label="Missing" />

        <div className="nav-section-label">Settings</div>
        <NavItem to="/settings/mediamanagement" icon={<HardDrive size={16} />} label="Media Management" />
        <NavItem to="/settings/platforms" icon={<MonitorPlay size={16} />} label="Platforms" />
        <NavItem to="/settings/indexers" icon={<Wifi size={16} />} label="Indexers" />
        <NavItem to="/settings/downloadclients" icon={<Server size={16} />} label="Download Clients" />
        <NavItem to="/settings/lists" icon={<List size={16} />} label="Lists" />
        <NavItem to="/settings/general" icon={<Settings size={16} />} label="General" />
      </nav>

      <div className="sidebar-footer">
        <div className="nav-section-label">System</div>
        <NavItem to="/system/status" icon={<Server size={16} />} label="Status" />
        <NavItem to="/system/tasks" icon={<Clock size={16} />} label="Tasks" />
        <NavItem to="/system/logs" icon={<FileText size={16} />} label="Logs" />
      </div>
    </aside>
  )
}
