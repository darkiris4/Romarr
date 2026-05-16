const LABEL: Record<string, string> = {
  wanted: 'Wanted',
  grabbed: 'Grabbed',
  downloading: 'Downloading',
  imported: 'Imported',
  failed: 'Failed',
  queued: 'Queued',
  paused: 'Paused',
  importPending: 'Import Pending',
  completed: 'Completed',
  downloadComplete: 'Complete',
  importFailed: 'Import Failed',
  deleted: 'Deleted',
  ignored: 'Ignored',
}

export default function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{LABEL[status] ?? status}</span>
}
