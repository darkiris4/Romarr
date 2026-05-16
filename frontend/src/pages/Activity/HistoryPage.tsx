import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { List, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { historyApi } from '../../api/history'
import type { HistoryEventType } from '../../types'

const EVENT_META: Record<string, { label: string; color: string }> = {
  grabbed: { label: 'Grabbed', color: 'var(--accent-hover)' },
  downloadComplete: { label: 'Download Complete', color: 'var(--info)' },
  imported: { label: 'Imported', color: 'var(--success)' },
  importFailed: { label: 'Import Failed', color: 'var(--danger)' },
  deleted: { label: 'Deleted', color: 'var(--text-muted)' },
  ignored: { label: 'Ignored', color: 'var(--text-muted)' },
}

const FILTERS: { label: string; value: HistoryEventType | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Grabbed', value: 'grabbed' },
  { label: 'Imported', value: 'imported' },
  { label: 'Failed', value: 'importFailed' },
  { label: 'Deleted', value: 'deleted' },
]

export default function HistoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<HistoryEventType | ''>('')

  const { data: items = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['history', filter],
    queryFn: () => historyApi.list({ event_type: filter || undefined, limit: 250 }),
  })

  return (
    <div className="activity-page">
      <div className="activity-toolbar">
        <span className="activity-title">History</span>
        <span className="activity-count">{items.length}</span>
        <div className="activity-filters">
          <button className="btn-icon" title="Refresh" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'spin' : ''} />
          </button>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`activity-filter-btn${filter === f.value ? ' active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="loading-page">
          <div className="spinner" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <List size={48} />
          <p>No history yet</p>
          <small>Grab events, imports, and failures appear here.</small>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Event</th>
                <th>Release</th>
                <th>Indexer</th>
                <th>Client</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const meta = EVENT_META[item.event_type] ?? {
                  label: item.event_type,
                  color: 'var(--text-muted)',
                }
                return (
                  <tr key={item.id}>
                    <td>
                      <span
                        className="activity-game-link"
                        onClick={() => navigate(`/games/${item.game_id}`)}
                      >
                        {item.game?.title ?? `Game #${item.game_id}`}
                      </span>
                    </td>
                    <td>
                      <span
                        className="activity-event-badge"
                        style={{ color: meta.color, borderColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="activity-release-cell text-muted" title={item.source_title}>
                      {item.source_title || '—'}
                    </td>
                    <td className="text-muted">{item.indexer || '—'}</td>
                    <td className="text-muted">{item.download_client || '—'}</td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                      {format(new Date(item.date), 'MMM d, yyyy HH:mm')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
