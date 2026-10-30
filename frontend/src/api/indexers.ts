import client from './client'
import type { Indexer, TestResult } from '../types'

type IndexerInput = Omit<Indexer, 'id' | 'created_at' | 'updated_at' | 'has_api_key'>

export const indexersApi = {
  list: () => client.get<Indexer[]>('/indexers').then((r) => r.data),
  create: (data: IndexerInput) => client.post<Indexer>('/indexers', data).then((r) => r.data),
  update: (id: number, data: Partial<IndexerInput>) =>
    client.put<Indexer>(`/indexers/${id}`, data).then((r) => r.data),
  delete: (id: number) => client.delete(`/indexers/${id}`),
  test: (id: number) => client.post<TestResult>(`/indexers/${id}/test`).then((r) => r.data),
  testConnection: (url: string, apiKey: string, id?: number) =>
    client.post<TestResult>('/indexers/test', { id, url, api_key: apiKey }).then((r) => r.data),
}
