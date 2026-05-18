import client from './client'
import type { Connection, TestResult } from '../types'

export const connectApi = {
  list: () => client.get<Connection[]>('/connect').then((r) => r.data),

  create: (payload: Omit<Connection, 'id' | 'created_at' | 'updated_at'>) =>
    client.post<Connection>('/connect', payload).then((r) => r.data),

  update: (id: number, payload: Omit<Connection, 'id' | 'created_at' | 'updated_at'>) =>
    client.put<Connection>(`/connect/${id}`, payload).then((r) => r.data),

  delete: (id: number) => client.delete(`/connect/${id}`),

  test: (id: number) => client.post<TestResult>(`/connect/${id}/test`).then((r) => r.data),
}
