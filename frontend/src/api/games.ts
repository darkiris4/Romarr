import client from './client'
import type { Game, GameStatus } from '../types'

export const gamesApi = {
  list: (params?: { status?: GameStatus; platform_id?: number; search?: string }) =>
    client.get<Game[]>('/games', { params }).then(r => r.data),

  get: (id: number) =>
    client.get<Game>(`/games/${id}`).then(r => r.data),

  create: (data: { title: string; platform_id: number; region?: string; igdb_id?: number; cover_url?: string; release_year?: number }) =>
    client.post<Game>('/games', data).then(r => r.data),

  update: (id: number, data: Partial<Game>) =>
    client.put<Game>(`/games/${id}`, data).then(r => r.data),

  delete: (id: number) =>
    client.delete(`/games/${id}`),

  search: (id: number) =>
    client.post<{ results: Array<{ title: string; indexer: string; size: number; seeders?: number; protocol: string; link: string }> }>(
      `/games/${id}/search`
    ).then(r => r.data),
}
