export type GameStatus = 'wanted' | 'grabbed' | 'downloading' | 'imported' | 'failed'

export interface Platform {
  id: number
  name: string
  no_intro_name: string
  folder_name: string
  extensions: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface Game {
  id: number
  title: string
  platform_id: number
  platform?: Platform
  status: GameStatus
  igdb_id?: number
  cover_url?: string
  release_year?: number
  region: string
  monitored: boolean
  rom_path?: string
  relative_rom_path?: string
  checksum_sha1?: string
  checksum_md5?: string
  checksum_crc32?: string
  file_size?: number
  summary?: string
  rating?: number
  game_modes?: string
  themes?: string
  similar_games?: string
  added_at: string
  updated_at: string
}

export interface IgdbSearchResult {
  igdb_id: number
  name: string
  cover_url?: string
  release_year?: number
  summary?: string
  platforms: string[]
}

export interface ReleaseResult {
  title: string
  indexer: string
  indexer_id?: number
  size: number
  seeders?: number
  leechers?: number
  protocol: string
  link: string
  publish_date?: string
}

export type IndexerProtocol = 'newznab' | 'torznab'

export interface Indexer {
  id: number
  name: string
  protocol: IndexerProtocol
  url: string
  api_key: string
  categories: string
  priority: number
  enabled: boolean
  prowlarr_id?: number
  created_at: string
  updated_at: string
}

export type DownloadClientType = 'sabnzbd' | 'qbittorrent' | 'deluge' | 'transmission'

export interface DownloadClient {
  id: number
  name: string
  implementation: DownloadClientType
  host: string
  port: number
  use_ssl: boolean
  url_base: string
  username: string
  password: string
  api_key: string
  category: string
  priority: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export type QueueStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'paused' | 'importPending'

export interface QueueItem {
  id: number
  game_id: number
  game?: Game
  title: string
  status: QueueStatus
  size: number
  size_downloaded: number
  progress: number
  download_id?: string
  download_client_id?: number
  indexer_id?: number
  protocol: string
  added_at: string
  estimated_completion?: string
  error_message?: string
}

export type HistoryEventType = 'grabbed' | 'downloadComplete' | 'importFailed' | 'imported' | 'deleted' | 'ignored'

export interface HistoryItem {
  id: number
  game_id: number
  game?: Game
  event_type: HistoryEventType
  source_title: string
  indexer: string
  download_client: string
  data: string
  date: string
}

export interface SystemStatus {
  appName: string
  version: string
  startupTime: string
  runtimeVersion: string
  osName: string
  osVersion: string
  sqliteVersion: string
}

export interface TestResult {
  success: boolean
  message: string
}
