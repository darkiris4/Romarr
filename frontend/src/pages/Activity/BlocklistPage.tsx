import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Trash2 } from 'lucide-react'
import client from '../../api/client'
import type { BlocklistItem } from '../../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function BlocklistPage() {
  const qc = useQueryClient()

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['blocklist'],
    queryFn: () => client.get<BlocklistItem[]>('/blocklist').then((r) => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => client.delete(`/blocklist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocklist'] }),
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  return (
    <div className="activity-page">
      <div className="activity-toolbar">
        <span className="activity-title">Blocklist</span>
        <span className="activity-count">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 0 }}>
          <Ban size={48} />
          <p>Blocklist is empty</p>
          <small>Releases marked as failed or unwanted will appear here.</small>
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
                <th>Reason</th>
                <th>Date Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500 }}>{item.game?.title ?? '—'}</td>
                  <td className="text-muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.source_title}>
                    {item.source_title}
                  </td>
                  <td className="text-muted">{item.indexer || '—'}</td>
                  <td>
                    {item.protocol && (
                      <span className={`protocol-badge protocol-badge--${item.protocol}`}>
                        {item.protocol === 'torznab' ? 'TOR' : 'NZB'}
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{item.reason}</td>
                  <td className="text-muted">{formatDate(item.added_at)}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-icon"
                        title="Remove from blocklist"
                        onClick={() => deleteMutation.mutate(item.id)}
                        disabled={deleteMutation.isPending}
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
      )}
    </div>
  )
}
