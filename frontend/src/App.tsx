import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import GamesPage from './pages/Games/GamesPage'
import CalendarPage from './pages/Calendar/CalendarPage'
import QueuePage from './pages/Activity/QueuePage'
import HistoryPage from './pages/Activity/HistoryPage'
import WantedPage from './pages/Wanted/WantedPage'
import SettingsLayout from './pages/Settings/SettingsLayout'
import MediaManagement from './pages/Settings/MediaManagement'
import PlatformsPage from './pages/Settings/PlatformsPage'
import IndexersPage from './pages/Settings/IndexersPage'
import DownloadClientsPage from './pages/Settings/DownloadClientsPage'
import ListsPage from './pages/Settings/ListsPage'
import GeneralPage from './pages/Settings/GeneralPage'
import SystemStatus from './pages/System/SystemStatus'
import TasksPage from './pages/System/TasksPage'
import LogsPage from './pages/System/LogsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/games" replace />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/activity/queue" element={<QueuePage />} />
          <Route path="/activity/history" element={<HistoryPage />} />
          <Route path="/wanted/missing" element={<WantedPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/mediamanagement" replace />} />
            <Route path="mediamanagement" element={<MediaManagement />} />
            <Route path="platforms" element={<PlatformsPage />} />
            <Route path="indexers" element={<IndexersPage />} />
            <Route path="downloadclients" element={<DownloadClientsPage />} />
            <Route path="lists" element={<ListsPage />} />
            <Route path="general" element={<GeneralPage />} />
          </Route>
          <Route path="/system/status" element={<SystemStatus />} />
          <Route path="/system/tasks" element={<TasksPage />} />
          <Route path="/system/logs" element={<LogsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
