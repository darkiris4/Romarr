import client from './client'
import type { SystemStatus } from '../types'

export interface AppEvent {
  id: number
  component: string
  message: string
  created_at: string
}

export interface EventsResponse {
  total: number
  page: number
  per_page: number
  events: AppEvent[]
}

export const systemApi = {
  status: () => client.get<SystemStatus>('/system/status').then(r => r.data),
  tasks: () => client.get<Array<{
    id: string
    name: string
    interval: number | null
    lastExecution: string | null
    lastDuration: number | null
    nextExecution: string | null
  }>>('/system/tasks').then(r => r.data),
  triggerTask: (id: string) => client.post(`/system/tasks/${id}/trigger`),
  taskQueue: () => client.get<Array<{
    id: string
    queued: string
    started: string
    ended: string | null
    duration: number | null
    status: 'running' | 'completed' | 'failed'
  }>>('/system/tasks/queue').then(r => r.data),
  scrape: () => client.post('/system/scrape').then(r => r.data),
  scrapeStatus: () => client.get<{
    running: boolean; phase: string; done: boolean; total: number
    processed: number; updated: number; failed: number; error: string | null
  }>('/system/scrape/status').then(r => r.data),
  events: (page = 1, perPage = 50) =>
    client.get<EventsResponse>('/system/events', { params: { page, per_page: perPage } }).then(r => r.data),
  clearEvents: (): Promise<void> =>
    client.delete('/system/events').then(() => undefined),
}
