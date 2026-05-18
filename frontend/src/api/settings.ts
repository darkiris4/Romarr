import client from './client'
import type { RemotePathMapping } from '../types'

export interface RootFolder {
  id: number
  path: string
  free_space: string
  unmapped_folders: number
}

export interface RegionItem {
  code: string
  label: string
  enabled: boolean
}

export interface FormatItem {
  label: string
  enabled: boolean
}

export interface Profile {
  regions: RegionItem[]
  formats: FormatItem[]
  prefer_no_intro: boolean
  prefer_verified: boolean
  skip_hacks: boolean
  skip_unlicensed: boolean
}

export interface GeneralSettings {
  curated_library_path: string
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

  updateRemotePathMapping: (
    id: number,
    payload: Omit<RemotePathMapping, 'id'>
  ): Promise<RemotePathMapping> =>
    client.put(`/settings/remote-path-mappings/${id}`, payload).then((r) => r.data),

  deleteRemotePathMapping: (id: number): Promise<void> =>
    client.delete(`/settings/remote-path-mappings/${id}`).then(() => undefined),

  getProfile: (): Promise<Profile> => client.get('/settings/profile').then((r) => r.data),

  saveProfile: (profile: Profile): Promise<Profile> =>
    client.put('/settings/profile', profile).then((r) => r.data),

  getGeneral: (): Promise<GeneralSettings> => client.get('/settings/general').then((r) => r.data),

  saveGeneral: (payload: GeneralSettings): Promise<GeneralSettings> =>
    client.put('/settings/general', payload).then((r) => r.data),
}
