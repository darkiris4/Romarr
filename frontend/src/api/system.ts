import client from './client'
import type { SystemStatus } from '../types'

export const systemApi = {
  status: () => client.get<SystemStatus>('/system/status').then(r => r.data),
  tasks: () => client.get<Array<{ id: string; name: string; nextExecution: string | null }>>('/system/tasks').then(r => r.data),
  triggerTask: (id: string) => client.post(`/system/tasks/${id}/trigger`),
  logs: (limit = 200) => client.get('/system/logs', { params: { limit } }).then(r => r.data),
}
