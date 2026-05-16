import client from './client'
import type { Indexer, TestResult } from '../types'

export const indexersApi = {
  list: () => client.get<Indexer[]>('/indexers').then((r) => r.data),
  create: (data: Omit<Indexer, 'id' | 'created_at' | 'updated_at'>) =>
    client.post<Indexer>('/indexers', data).then((r) => r.data),
  update: (id: number, data: Partial<Indexer>) =>
    client.put<Indexer>(`/indexers/${id}`, data).then((r) => r.data),
  delete: (id: number) => client.delete(`/indexers/${id}`),
  test: (id: number) => client.post<TestResult>(`/indexers/${id}/test`).then((r) => r.data),
  testConnection: (url: string, apiKey: string) =>
    client.post<TestResult>('/indexers/test', { url, api_key: apiKey }).then((r) => r.data),
}
