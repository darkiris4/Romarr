import client from './client'

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
}
