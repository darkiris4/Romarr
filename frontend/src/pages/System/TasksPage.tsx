import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { systemApi } from '../../api/system'

const TASK_META: Record<string, { label: string }> = {
  poll_downloads: { label: 'Refresh Monitored Downloads' },
  search_wanted: { label: 'Wanted Search' },
  scrape_metadata: { label: 'Scrape Metadata' },
  deduplicate: { label: 'Deduplicate Library' },
  check_health: { label: 'Check Health' },
  backup: { label: 'Backup' },
  housekeeping: { label: 'Housekeeping' },
}

function formatInterval(seconds: number | null): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds} seconds`
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`
  return `${Math.round(seconds / 86400)} days`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

export default function TasksPage() {
  const qc = useQueryClient()

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: systemApi.tasks,
    refetchInterval: 10_000,
  })

  const { data: queue = [] } = useQuery({
    queryKey: ['taskQueue'],
    queryFn: systemApi.taskQueue,
    refetchInterval: 5_000,
  })

  const triggerMutation = useMutation({
    mutationFn: systemApi.triggerTask,
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['taskQueue'] })
      }, 1500)
    },
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <div className="settings-section-title" style={{ marginBottom: 16 }}>
          Scheduled
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Interval</th>
                  <th>Last Execution</th>
                  <th>Last Duration</th>
                  <th>Next Execution</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--text-white)', fontWeight: 500 }}>
                      {TASK_META[t.id]?.label ?? t.name}
                    </td>
                    <td className="text-muted">{formatInterval(t.interval ?? null)}</td>
                    <td className="text-muted">{formatRelative(t.lastExecution ?? null)}</td>
                    <td className="text-muted">{formatDuration(t.lastDuration ?? null)}</td>
                    <td className="text-muted">{formatRelative(t.nextExecution ?? null)}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          className="btn-icon"
                          title="Run now"
                          onClick={() => triggerMutation.mutate(t.id)}
                          disabled={triggerMutation.isPending}
                        >
                          <Play size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <div className="settings-section-title" style={{ marginBottom: 16 }}>
          Queue
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Queued</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {queue.slice(0, 10).length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}
                    >
                      No tasks have run yet
                    </td>
                  </tr>
                ) : (
                  queue.slice(0, 10).map((entry, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-white)', fontWeight: 500 }}>
                        {TASK_META[entry.id]?.label ?? entry.id}
                        {entry.status === 'running' && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>
                            running
                          </span>
                        )}
                        {entry.status === 'failed' && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--danger)' }}>
                            failed
                          </span>
                        )}
                      </td>
                      <td className="text-muted">{formatRelative(entry.queued)}</td>
                      <td className="text-muted">{formatRelative(entry.started)}</td>
                      <td className="text-muted">{formatRelative(entry.ended)}</td>
                      <td className="text-muted">{formatDuration(entry.duration)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
