import client from './client'

export interface ScannedROM {
  path: string
  filename: string
  title: string
  region: string
  crc32: string
  match_source: 'dat' | 'filename' | 'unmatched'
  confidence: number
  platform_id: number | null
  platform_name: string | null
  candidate_platforms: { id: number; name: string }[]
  already_exists: boolean
  existing_game_id: number | null
}

export interface ScanPreview {
  folder: string
  total_files_seen: number
  dat_matches: number
  filename_matches: number
  ambiguous: number
  already_imported: number
  to_import: number
  roms: ScannedROM[]
}

export const libraryApi = {
  scanStart: (path: string, platform_hint_id?: number) =>
    client
      .post<{
        started?: boolean
        already_running?: boolean
        error?: string
      }>('/library/scan', { path, platform_hint_id })
      .then((r) => r.data),

  scanStatus: () =>
    client
      .get<{
        running: boolean
        folder: string | null
        total: number
        processed: number
        done: boolean
        error: string | null
        result: ScanPreview | null
      }>('/library/scan/status')
      .then((r) => r.data),

  recentFolders: () => client.get<{ path: string }[]>('/library/scan/recent').then((r) => r.data),

  deleteRecentFolder: (path: string): Promise<void> =>
    client.delete('/library/scan/recent', { params: { path } }).then(() => undefined),

  importStart: (
    path: string,
    opts: {
      platform_hint_id?: number
      platform_overrides?: Record<string, number>
      skip_existing?: boolean
      selected_keys?: string[]
    }
  ) =>
    client
      .post<{ started?: boolean; already_running?: boolean }>('/library/import', {
        path,
        platform_hint_id: opts.platform_hint_id,
        platform_overrides: opts.platform_overrides ?? {},
        skip_existing: opts.skip_existing ?? true,
        selected_keys: opts.selected_keys ?? null,
      })
      .then((r) => r.data),

  importStatus: () =>
    client
      .get<{
        running: boolean
        done: boolean
        error: string | null
        result: {
          scanned: number
          created: number
          updated: number
          skipped_existing: number
          skipped_ambiguous: number
          dat_matches: number
          filename_matches: number
        } | null
      }>('/library/import/status')
      .then((r) => r.data),

  datStatus: () =>
    client
      .get<{
        dat_dir: string
        platforms: {
          platform_id: number
          platform_name: string
          dat_file: string | null
          dat_version: string | null
          dat_date: string | null
          loaded: boolean
          entries: number
        }[]
      }>('/library/dat/status')
      .then((r) => r.data),

  deleteDat: (filename: string): Promise<void> =>
    client.delete(`/library/dat/${encodeURIComponent(filename)}`).then(() => undefined),

  reloadDats: () =>
    client
      .post<{ dat_dir: string; loaded: unknown[]; unmatched: unknown[] }>('/library/dat/reload')
      .then((r) => r.data),

  deduplicate: () =>
    client
      .post<{ duplicate_groups: number; removed: number }>('/library/deduplicate')
      .then((r) => r.data),

  uploadDat: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client
      .post<{
        filename: string
        size: number
        matched_platform: string | null
        status: string
        platform_created: boolean
      }>('/library/dat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },
}
