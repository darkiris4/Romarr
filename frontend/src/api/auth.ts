import client from './client'

export type AuthMode = 'forms' | 'basic' | 'none'
export type AuthRequired = 'enabled' | 'disabled_for_local'

export interface AuthStatus {
  setup_required: boolean
  authenticated: boolean
  mode: AuthMode
  username: string | null
}

export interface AuthSettings {
  mode: AuthMode
  required: AuthRequired
  username: string
  api_key: string
  trusted_proxies: string
}

export interface AuthSettingsUpdate {
  mode: AuthMode
  required: AuthRequired
  username: string
  trusted_proxies: string
}

export const getAuthStatus = () => client.get<AuthStatus>('/auth/status').then((r) => r.data)

export const setupAuth = (username: string, password: string) =>
  client.post<AuthStatus>('/auth/setup', { username, password }).then((r) => r.data)

export const login = (username: string, password: string, remember: boolean) =>
  client.post<AuthStatus>('/auth/login', { username, password, remember }).then((r) => r.data)

export const logout = () => client.post('/auth/logout').then(() => undefined)

export const getAuthSettings = () => client.get<AuthSettings>('/auth/settings').then((r) => r.data)

export const updateAuthSettings = (body: AuthSettingsUpdate) =>
  client.put<AuthSettings>('/auth/settings', body).then((r) => r.data)

export const changePassword = (current_password: string, new_password: string) =>
  client.post('/auth/password', { current_password, new_password }).then(() => undefined)

export const resetApiKey = () =>
  client.post<{ api_key: string }>('/auth/apikey/reset').then((r) => r.data.api_key)
