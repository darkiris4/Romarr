export type GameStatus = 'wanted' | 'grabbed' | 'downloading' | 'imported' | 'failed'

export interface ReleaseProfile {
  id: number
  name: string
  is_default: boolean
  region_priority: string[]
  prefer_no_intro: boolean
  accept_hacks: boolean
  accept_unlicensed: boolean
  preferred_formats: string[]
  created_at: string
  updated_at: string
}

export interface DelayProfile {
  id: number
  name: string
  is_default: boolean
  preferred_protocol: 'usenet' | 'torrent' | 'any'
  usenet_delay: number
  torrent_delay: number
  bypass_if_only_one: boolean
  tags: string
  created_at: string
  updated_at: string
}

export interface RevisionUnmetEntry {
  id: number
  title: string
  platform: string | null
  platform_id: number
  region: string
  cover_url: string | null
  current_revision: string
  latest_revision: string
  added_at: string
}

export interface Platform {
  id: number
  name: string
  no_intro_name: string
  folder_name: string
  extensions: string
  short_name?: string | null
  enabled: boolean
  igdb_platform_id?: number | null
  release_profile_id?: number | null
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
  collection_id?: number | null
  collection_name?: string | null
  tags?: string | null
  last_searched_at?: string | null
  release_profile_id?: number | null
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
  platform_ids: number[]
  regions?: number[]
  rating?: number
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
  grabbed_at?: string
  rejections: string[]
}

export interface BlocklistItem {
  id: number
  game_id: number
  game?: { id: number; title: string }
  source_title: string
  indexer: string
  protocol: string
  reason: string
  added_at: string
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
  tags: string
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
  remove_completed: boolean
  remove_failed: boolean
  tags: string
  created_at: string
  updated_at: string
}

export type QueueStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'importPending'

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
  download_client_name?: string
  indexer_id?: number
  indexer_name?: string
  protocol: string
  added_at: string
  estimated_completion?: string
  error_message?: string
}

export type HistoryEventType =
  | 'grabbed'
  | 'downloadComplete'
  | 'downloadFailed'
  | 'importFailed'
  | 'imported'
  | 'deleted'
  | 'ignored'

export interface HistoryItem {
  id: number
  game_id: number
  game?: Game
  event_type: HistoryEventType
  source_title: string
  indexer: string
  download_client: string
  data: Record<string, unknown>
  date: string
}

export interface SystemStatus {
  health: string[]
  disk: Array<{ path: string; free: number | null; total: number | null }>
  about: {
    version: string
    python: string
    docker: boolean
    sqliteVersion: string
    appDataDirectory: string
    startupDirectory: string
    startupTime: string
    uptimeSeconds: number
    branch: string
    os: string
  }
}

export interface RemotePathMapping {
  id: number
  host: string
  remote_path: string
  local_path: string
}

export interface TestResult {
  success: boolean
  message: string
}

export interface Connection {
  id: number
  name: string
  type: string
  config: Record<string, string>
  tags: string
  on_grab: boolean
  on_import: boolean
  on_upgrade: boolean
  on_rename: boolean
  on_delete: boolean
  on_health_issue: boolean
  on_download_failure: boolean
  enabled: boolean
  created_at: string
  updated_at: string
}
