import client from './client'
import type { DelayProfile, ReleaseProfile } from '../types'

export const releaseProfilesApi = {
  list: () => client.get<ReleaseProfile[]>('/profiles/release').then((r) => r.data),
  create: (payload: Omit<ReleaseProfile, 'id' | 'is_default' | 'created_at' | 'updated_at'>) =>
    client.post<ReleaseProfile>('/profiles/release', payload).then((r) => r.data),
  update: (id: number, payload: Partial<Omit<ReleaseProfile, 'id' | 'created_at' | 'updated_at'>>) =>
    client.put<ReleaseProfile>(`/profiles/release/${id}`, payload).then((r) => r.data),
  delete: (id: number) => client.delete(`/profiles/release/${id}`),
}

export const delayProfilesApi = {
  list: () => client.get<DelayProfile[]>('/profiles/delay').then((r) => r.data),
  create: (payload: Omit<DelayProfile, 'id' | 'is_default' | 'created_at' | 'updated_at'>) =>
    client.post<DelayProfile>('/profiles/delay', payload).then((r) => r.data),
  update: (id: number, payload: Partial<Omit<DelayProfile, 'id' | 'created_at' | 'updated_at'>>) =>
    client.put<DelayProfile>(`/profiles/delay/${id}`, payload).then((r) => r.data),
  delete: (id: number) => client.delete(`/profiles/delay/${id}`),
}
