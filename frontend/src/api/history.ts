import client from './client'
import type { HistoryItem, HistoryEventType } from '../types'

export const historyApi = {
  list: (params?: {
    event_type?: HistoryEventType
    game_id?: number
    skip?: number
    limit?: number
  }) => client.get<HistoryItem[]>('/history', { params }).then((r) => r.data),
}
