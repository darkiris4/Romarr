import client from './client'

export interface ListSource {
  id: number
  name: string
  plugin: string
  enabled: boolean
  config: string
  last_sync: string | null
}

export const listSourcesApi = {
  list: (): Promise<ListSource[]> => client.get('/list-sources').then((r) => r.data),

  create: (payload: Omit<ListSource, 'id' | 'last_sync'>): Promise<ListSource> =>
    client.post('/list-sources', payload).then((r) => r.data),

  update: (id: number, payload: Omit<ListSource, 'id' | 'last_sync'>): Promise<ListSource> =>
    client.put(`/list-sources/${id}`, payload).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    client.delete(`/list-sources/${id}`).then(() => undefined),

  sync: (id: number): Promise<{ added: number }> =>
    client.post(`/list-sources/${id}/sync`).then((r) => r.data),
}
