import type { GameStatus, QueueStatus, HistoryEventType } from '../types'

type AnyStatus = GameStatus | QueueStatus | HistoryEventType | string

const LABEL_MAP: Record<string, string> = {
  wanted: 'Wanted',
  grabbed: 'Grabbed',
  downloading: 'Downloading',
  imported: 'Imported',
  failed: 'Failed',
  queued: 'Queued',
  paused: 'Paused',
  importPending: 'Import Pending',
  downloadComplete: 'Complete',
  importFailed: 'Import Failed',
}

export default function StatusBadge({ status }: { status: AnyStatus }) {
  const label = LABEL_MAP[status] ?? status
  return <span className={`badge badge-${status}`}>{label}</span>
}
