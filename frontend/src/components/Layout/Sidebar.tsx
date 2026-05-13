import { NavLink } from 'react-router-dom'
import {
  Gamepad2, Plus, FolderInput,
  Clock, List, Ban,
  BookX,
  HardDrive, Wifi, Server, FileInput, Plug, Database, Tag, Settings, Monitor,
  Activity, CheckSquare, Archive, RefreshCw, Bell, FileText,
} from 'lucide-react'

function NavItem({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      <span className="nav-icon">{icon}</span>
      {label}
    </NavLink>
  )
}

function NavSubItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item nav-item--sub${isActive ? ' active' : ''}`}
    >
      <span className="nav-icon">{icon}</span>
      {label}
    </NavLink>
  )
}

function SectionLabel({ label }: { label: string }) {
  return <div className="nav-section-label">{label}</div>
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/favicon.png" alt="Romarr" style={{ width: 36, height: 36 }} />
        Romarr
      </div>

      <nav className="sidebar-nav">
        <NavItem to="/games" icon={<Gamepad2 size={16} />} label="Games" end />
        <NavSubItem to="/games/add"    icon={<Plus size={14} />}        label="Add New" />
        <NavSubItem to="/games/import" icon={<FolderInput size={14} />} label="Library Import" />

        <SectionLabel label="Activity" />
        <NavItem to="/activity/queue"     icon={<Clock size={16} />}    label="Queue" />
        <NavItem to="/activity/history"   icon={<List size={16} />}     label="History" />
        <NavItem to="/activity/blocklist" icon={<Ban size={16} />}      label="Blocklist" />

        <SectionLabel label="Wanted" />
        <NavItem to="/wanted/missing" icon={<BookX size={16} />} label="Missing" />

        <SectionLabel label="Settings" />
        <NavItem to="/settings/mediamanagement" icon={<HardDrive size={16} />}  label="Media Management" />
        <NavItem to="/settings/indexers"         icon={<Wifi size={16} />}       label="Indexers" />
        <NavItem to="/settings/downloadclients"  icon={<Server size={16} />}     label="Download Clients" />
        <NavItem to="/settings/lists"            icon={<FileInput size={16} />}  label="Import Lists" />
        <NavItem to="/settings/connect"          icon={<Plug size={16} />}       label="Connect" />
        <NavItem to="/settings/metadata"         icon={<Database size={16} />}   label="Metadata" />
        <NavItem to="/settings/tags"             icon={<Tag size={16} />}        label="Tags" />
        <NavItem to="/settings/general"          icon={<Settings size={16} />}   label="General" />
        <NavItem to="/settings/ui"               icon={<Monitor size={16} />}    label="UI" />

        <SectionLabel label="System" />
        <NavItem to="/system/status"  icon={<Activity size={16} />}     label="Status" />
        <NavItem to="/system/tasks"   icon={<CheckSquare size={16} />}  label="Tasks" />
        <NavItem to="/system/backup"  icon={<Archive size={16} />}      label="Backup" />
        <NavItem to="/system/updates" icon={<RefreshCw size={16} />}    label="Updates" />
        <NavItem to="/system/events"  icon={<Bell size={16} />}         label="Events" />
        <NavItem to="/system/logs"    icon={<FileText size={16} />}     label="Log Files" />
      </nav>
    </aside>
  )
}
