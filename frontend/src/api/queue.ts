import client from './client'
import type { QueueItem } from '../types'

export const queueApi = {
  list: () => client.get<QueueItem[]>('/queue').then((r) => r.data),
  remove: (id: number, removeFromClient = false) =>
    client.delete(`/queue/${id}`, { params: { remove_from_client: removeFromClient } }),
}
