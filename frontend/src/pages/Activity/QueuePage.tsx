import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Clock } from 'lucide-react'
import { queueApi } from '../../api/queue'
import StatusBadge from '../../components/StatusBadge'

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

export default function QueuePage() {
  const qc = useQueryClient()

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: queueApi.list,
    refetchInterval: 10_000,
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => queueApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <Clock size={48} />
        <p>Queue is empty</p>
        <small>Downloads will appear here when Romarr grabs a release.</small>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Game</th>
              <th>Protocol</th>
              <th>Size</th>
              <th>Progress</th>
              <th className="col-status">Status</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </td>
                <td className="text-muted">{item.game?.title ?? '—'}</td>
                <td className="text-muted" style={{ textTransform: 'uppercase', fontSize: 11 }}>{item.protocol}</td>
                <td className="text-muted">{formatBytes(item.size)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                    </div>
                    <span className="text-sm text-muted">{item.progress}%</span>
                  </div>
                </td>
                <td><StatusBadge status={item.status} /></td>
                <td>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-icon"
                      title="Remove from queue"
                      onClick={() => removeMutation.mutate(item.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
