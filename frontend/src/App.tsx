import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import GamesPage from './pages/Games/GamesPage'
import GameDetailPage from './pages/Games/GameDetailPage'
import QueuePage from './pages/Activity/QueuePage'
import HistoryPage from './pages/Activity/HistoryPage'
import BlocklistPage from './pages/Activity/BlocklistPage'
import WantedPage from './pages/Wanted/WantedPage'
import SettingsLayout from './pages/Settings/SettingsLayout'
import MediaManagement from './pages/Settings/MediaManagement'
import PlatformsPage from './pages/Settings/PlatformsPage'
import IndexersPage from './pages/Settings/IndexersPage'
import DownloadClientsPage from './pages/Settings/DownloadClientsPage'
import ListsPage from './pages/Settings/ListsPage'
import ConnectPage from './pages/Settings/ConnectPage'
import MetadataPage from './pages/Settings/MetadataPage'
import TagsPage from './pages/Settings/TagsPage'
import GeneralPage from './pages/Settings/GeneralPage'
import UISettingsPage from './pages/Settings/UISettingsPage'
import SystemStatus from './pages/System/SystemStatus'
import TasksPage from './pages/System/TasksPage'
import BackupPage from './pages/System/BackupPage'
import UpdatesPage from './pages/System/UpdatesPage'
import EventsPage from './pages/System/EventsPage'
import LogsPage from './pages/System/LogsPage'
import AddNewPage from './pages/Games/AddNewPage'
import StubPage from './components/StubPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/games" replace />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/add" element={<AddNewPage />} />
          <Route path="/games/import" element={<StubPage title="Library Import" />} />
          <Route path="/games/:id" element={<GameDetailPage />} />
          <Route path="/activity" element={<Navigate to="/activity/queue" replace />} />
          <Route path="/activity/queue" element={<QueuePage />} />
          <Route path="/activity/history" element={<HistoryPage />} />
          <Route path="/activity/blocklist" element={<BlocklistPage />} />
          <Route path="/wanted" element={<Navigate to="/wanted/missing" replace />} />
          <Route path="/wanted/missing" element={<WantedPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/mediamanagement" replace />} />
            <Route path="mediamanagement" element={<MediaManagement />} />
            <Route path="platforms" element={<PlatformsPage />} />
            <Route path="indexers" element={<IndexersPage />} />
            <Route path="downloadclients" element={<DownloadClientsPage />} />
            <Route path="lists" element={<ListsPage />} />
            <Route path="connect" element={<ConnectPage />} />
            <Route path="metadata" element={<MetadataPage />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="general" element={<GeneralPage />} />
            <Route path="ui" element={<UISettingsPage />} />
          </Route>
          <Route path="/system" element={<Navigate to="/system/status" replace />} />
          <Route path="/system/status" element={<SystemStatus />} />
          <Route path="/system/tasks" element={<TasksPage />} />
          <Route path="/system/backup" element={<BackupPage />} />
          <Route path="/system/updates" element={<UpdatesPage />} />
          <Route path="/system/events" element={<EventsPage />} />
          <Route path="/system/logs" element={<LogsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
