import client from './client'
import type { RemotePathMapping } from '../types'

export interface RootFolder {
  id: number
  path: string
  free_space: string
  unmapped_folders: number
}

export const settingsApi = {
  listRootFolders: (): Promise<RootFolder[]> =>
    client.get('/settings/root-folders').then((r) => r.data),

  addRootFolder: (path: string): Promise<RootFolder> =>
    client.post('/settings/root-folders', { path }).then((r) => r.data),

  deleteRootFolder: (id: number): Promise<void> =>
    client.delete(`/settings/root-folders/${id}`).then(() => undefined),

  listRemotePathMappings: (): Promise<RemotePathMapping[]> =>
    client.get('/settings/remote-path-mappings').then((r) => r.data),

  addRemotePathMapping: (payload: Omit<RemotePathMapping, 'id'>): Promise<RemotePathMapping> =>
    client.post('/settings/remote-path-mappings', payload).then((r) => r.data),

  updateRemotePathMapping: (id: number, payload: Omit<RemotePathMapping, 'id'>): Promise<RemotePathMapping> =>
    client.put(`/settings/remote-path-mappings/${id}`, payload).then((r) => r.data),

  deleteRemotePathMapping: (id: number): Promise<void> =>
    client.delete(`/settings/remote-path-mappings/${id}`).then(() => undefined),
}
