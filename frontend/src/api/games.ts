import client from './client'
import type { Game, GameStatus, ReleaseResult } from '../types'

export const gamesApi = {
  list: (params?: { status?: GameStatus; platform_id?: number; search?: string }) =>
    client.get<Game[]>('/games', { params }).then((r) => r.data),

  get: (id: number) => client.get<Game>(`/games/${id}`).then((r) => r.data),

  create: (data: {
    title: string
    platform_id: number
    region?: string
    igdb_id?: number
    cover_url?: string
    release_year?: number
    monitored?: boolean
  }) => client.post<Game>('/games', data).then((r) => r.data),

  update: (id: number, data: Partial<Game>) =>
    client.put<Game>(`/games/${id}`, data).then((r) => r.data),

  delete: (id: number) => client.delete(`/games/${id}`),

  search: (id: number, q?: string) =>
    client
      .get<{
        results: ReleaseResult[]
        errors: { indexer: string; error: string }[]
        query: string
      }>(`/games/${id}/search`, { params: q ? { q } : undefined })
      .then((r) => r.data),

  grab: (
    id: number,
    payload: {
      link: string
      title: string
      size: number
      protocol: string
      indexer: string
      indexer_id?: number
      seeders?: number
      info_hash?: string
    }
  ) =>
    client
      .post<{
        success: boolean
        download_id: string
        queue_item_id: number
      }>(`/games/${id}/grab`, payload)
      .then((r) => r.data),

  bulkDelete: (ids: number[]) => client.post('/games/bulk-delete', { ids }),

  bulkTag: (ids: number[], tags: string) => client.patch('/games/bulk-tag', { ids, tags }),

  bulkMonitor: (ids: number[], monitored: boolean) =>
    client.patch('/games/bulk-monitor', { ids, monitored }),

  bulkPlatform: (ids: number[], platform_id: number) =>
    client.patch('/games/bulk-platform', { ids, platform_id }),

  bulkSearch: (ids: number[]) => client.post('/games/bulk-search', { ids }),

  bulkProfile: (ids: number[], release_profile_id: number | null) =>
    client.patch('/games/bulk-profile', { ids, release_profile_id }),

  refresh: (id: number) => client.post(`/games/${id}/refresh`).then((r) => r.data),

  relinkIgdb: (id: number, igdb_id: number) =>
    client.post<Game>(`/games/${id}/igdb-link`, { igdb_id }).then((r) => r.data),

  linkMetadata: (id: number, provider: string, external_id: number) =>
    client.post<Game>(`/games/${id}/metadata-link`, { provider, external_id }).then((r) => r.data),

  deleteFile: (id: number) => client.delete(`/games/${id}/file`).then((r) => r.data),
}
