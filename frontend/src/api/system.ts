import client from './client'
import type { SystemStatus } from '../types'

export const systemApi = {
  status: () => client.get<SystemStatus>('/system/status').then(r => r.data),
  tasks: () => client.get<Array<{ id: string; name: string; nextExecution: string | null }>>('/system/tasks').then(r => r.data),
  triggerTask: (id: string) => client.post(`/system/tasks/${id}/trigger`),
scrape: () => client.post('/system/scrape').then(r => r.data),
  scrapeStatus: () => client.get<{
    running: boolean; phase: string; done: boolean; total: number
    processed: number; updated: number; failed: number; error: string | null
  }>('/system/scrape/status').then(r => r.data),
}
