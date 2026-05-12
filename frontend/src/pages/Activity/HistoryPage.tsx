import { useQuery } from '@tanstack/react-query'
import { List } from 'lucide-react'
import { format } from 'date-fns'
import { historyApi } from '../../api/history'
import StatusBadge from '../../components/StatusBadge'

const EVENT_LABELS: Record<string, string> = {
  grabbed: 'Grabbed',
  downloadComplete: 'Download Complete',
  importFailed: 'Import Failed',
  imported: 'Imported',
  deleted: 'Deleted',
  ignored: 'Ignored',
}

export default function HistoryPage() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => historyApi.list({ limit: 100 }),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <List size={48} />
        <p>No history yet</p>
        <small>Grab events, imports, and failures appear here.</small>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Source</th>
              <th>Indexer</th>
              <th>Client</th>
              <th>Event</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>
                  {item.game?.title ?? `Game #${item.game_id}`}
                </td>
                <td
                  className="text-muted"
                  style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={item.source_title}
                >
                  {item.source_title || '—'}
                </td>
                <td className="text-muted">{item.indexer || '—'}</td>
                <td className="text-muted">{item.download_client || '—'}</td>
                <td><StatusBadge status={item.event_type} /></td>
                <td className="text-muted text-sm">
                  {format(new Date(item.date), 'MMM d, yyyy HH:mm')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
