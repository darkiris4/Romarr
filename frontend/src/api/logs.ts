import client from './client'

export interface LogFileInfo {
  filename: string
  size: number
  last_modified: number   // Unix timestamp (seconds)
  log_type: 'standard' | 'debug' | 'trace'
}

export interface LogFilesResponse {
  log_dir: string
  files: LogFileInfo[]
}

export const logsApi = {
  files: () =>
    client.get<LogFilesResponse>('/logs/files').then(r => r.data),

  clear: (): Promise<void> =>
    client.delete('/logs/files').then(() => undefined),

  level: () =>
    client.get<{ level: string }>('/logs/level').then(r => r.data),

  setLevel: (level: string) =>
    client.put<{ level: string }>('/logs/level', { level }).then(r => r.data),

  downloadUrl: (filename: string) =>
    `/api/v1/logs/download/${encodeURIComponent(filename)}`,
}
