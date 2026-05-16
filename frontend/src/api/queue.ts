import client from './client'
import type { QueueItem } from '../types'

export const queueApi = {
  list: () => client.get<QueueItem[]>('/queue').then((r) => r.data),
  poll: () => client.post('/queue/poll'),
  importItem: (id: number) =>
    client.post<{
      success: boolean
      destination: string
      filename: string
      crc32: string | null
      game_id: number
    }>(`/queue/${id}/import`),
  remove: (id: number, removeFromClient = false) =>
    client.delete(`/queue/${id}`, { params: { remove_from_client: removeFromClient } }),
}
