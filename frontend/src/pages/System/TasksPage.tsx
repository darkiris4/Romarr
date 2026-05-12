import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { systemApi } from '../../api/system'
import { format } from 'date-fns'

export default function TasksPage() {
  const qc = useQueryClient()
  const { data: tasks = [], isLoading } = useQuery({ queryKey: ['tasks'], queryFn: systemApi.tasks })

  const triggerMutation = useMutation({
    mutationFn: systemApi.triggerTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>

  const TASK_LABELS: Record<string, string> = {
    poll_downloads: 'Refresh Downloads',
    search_wanted: 'Search Wanted',
  }

  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 16 }}>Scheduled Tasks</div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Next Execution</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--text-white)', fontWeight: 500 }}>{TASK_LABELS[t.id] ?? t.name}</td>
                  <td className="text-muted">
                    {t.nextExecution ? format(new Date(t.nextExecution), 'MMM d, HH:mm:ss') : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-icon"
                        title="Run now"
                        onClick={() => triggerMutation.mutate(t.id)}
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
  )
}
