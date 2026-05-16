import client from './client'
import type { DownloadClient, TestResult } from '../types'

export const downloadClientsApi = {
  list: () => client.get<DownloadClient[]>('/downloadclients').then((r) => r.data),
  create: (data: Omit<DownloadClient, 'id' | 'created_at' | 'updated_at'>) =>
    client.post<DownloadClient>('/downloadclients', data).then((r) => r.data),
  update: (id: number, data: Partial<DownloadClient>) =>
    client.put<DownloadClient>(`/downloadclients/${id}`, data).then((r) => r.data),
  delete: (id: number) => client.delete(`/downloadclients/${id}`),
  test: (id: number) => client.post<TestResult>(`/downloadclients/${id}/test`).then((r) => r.data),
  testInline: (data: {
    implementation: string
    host: string
    port: number
    use_ssl: boolean
    url_base: string
    username: string
    password: string
    api_key: string
  }) => client.post<TestResult>('/downloadclients/test', data).then((r) => r.data),
}
