import client from './client'
import type { Platform } from '../types'

export const platformsApi = {
  list: () => client.get<Platform[]>('/platforms').then(r => r.data),
  builtin: () => client.get<Omit<Platform, 'id' | 'enabled' | 'created_at' | 'updated_at'>[]>('/platforms/builtin').then(r => r.data),
  create: (data: Omit<Platform, 'id' | 'created_at' | 'updated_at'>) =>
    client.post<Platform>('/platforms', data).then(r => r.data),
  update: (id: number, data: Partial<Platform>) =>
    client.put<Platform>(`/platforms/${id}`, data).then(r => r.data),
  delete: (id: number) => client.delete(`/platforms/${id}`),
}
