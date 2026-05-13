import client from './client'
import type { Platform } from '../types'

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
  scan: (path: string, platform_hint_id?: number) =>
    client.post<ScanPreview>('/library/scan', { path, platform_hint_id }).then(r => r.data),

  import: (
    path: string,
    opts: { platform_hint_id?: number; platform_overrides?: Record<string, number>; skip_existing?: boolean }
  ) =>
    client.post<{
      scanned: number; created: number; updated: number
      skipped_existing: number; skipped_ambiguous: number
      dat_matches: number; filename_matches: number
    }>('/library/import', {
      path,
      platform_hint_id: opts.platform_hint_id,
      platform_overrides: opts.platform_overrides ?? {},
      skip_existing: opts.skip_existing ?? true,
    }).then(r => r.data),

  datStatus: () =>
    client.get<{
      dat_dir: string
      platforms: {
        platform_id: number
        platform_name: string
        dat_file: string | null
        loaded: boolean
        entries: number
      }[]
    }>('/library/dat/status').then(r => r.data),

  reloadDats: () =>
    client.post<{ dat_dir: string; loaded: unknown[]; unmatched: unknown[] }>('/library/dat/reload').then(r => r.data),

  uploadDat: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.post<{ filename: string; size: number; matched_platform: string | null; status: string }>(
      '/library/dat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then(r => r.data)
  },
}
