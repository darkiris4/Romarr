import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Trash2, Clock } from 'lucide-react'
import { queueApi } from '../../api/queue'
import type { QueueItem } from '../../types'

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'var(--text-muted)',
  downloading: 'var(--info)',
  completed: 'var(--success)',
  importPending: 'var(--warning)',
  failed: 'var(--danger)',
  paused: 'var(--text-muted)',
}

export default function QueuePage() {
  const navigate = useNavigate()
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

  return (
    <div className="activity-page">
      <div className="activity-toolbar">
        <span className="activity-title">Queue</span>
        <span className="activity-count">{items.length}</span>
      </div>

      {isLoading ? (
        <div className="loading-page">
          <div className="spinner" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Clock size={48} />
          <p>Queue is empty</p>
          <small>Downloads will appear here when Romarr grabs a release.</small>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Release</th>
                <th>Indexer</th>
                <th>Protocol</th>
                <th>Size</th>
                <th style={{ minWidth: 160 }}>Progress</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onRemove={() => removeMutation.mutate(item.id)}
                  onGameClick={() => item.game_id && navigate(`/games/${item.game_id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function QueueRow({
  item,
  onRemove,
  onGameClick,
}: {
  item: QueueItem
  onRemove: () => void
  onGameClick: () => void
}) {
  const color = STATUS_COLOR[item.status] ?? 'var(--text-muted)'
  return (
    <tr>
      <td>
        <span className="activity-game-link" onClick={onGameClick}>
          {item.game?.title ?? `Game #${item.game_id}`}
        </span>
      </td>
      <td className="activity-release-cell" title={item.title}>
        {item.title}
      </td>
      <td className="text-muted">{item.indexer_id ?? '—'}</td>
      <td>
        <span className={`protocol-badge protocol-badge--${item.protocol}`}>{item.protocol}</span>
      </td>
      <td className="text-muted">{formatBytes(item.size)}</td>
      <td>
        <div className="queue-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${item.progress}%` }} />
          </div>
          <span className="text-muted" style={{ fontSize: 11, width: 34, textAlign: 'right' }}>
            {item.progress}%
          </span>
        </div>
      </td>
      <td>
        <span style={{ color, fontSize: 12, fontWeight: 500 }}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </span>
      </td>
      <td className="col-action">
        <button className="btn-icon" title="Remove from queue" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}
