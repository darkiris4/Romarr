import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { List, RefreshCw, Info, X } from 'lucide-react'
import { format } from 'date-fns'
import { historyApi } from '../../api/history'
import type { HistoryEventType, HistoryItem } from '../../types'

const EVENT_META: Record<string, { label: string; color: string }> = {
  grabbed: { label: 'Grabbed', color: 'var(--accent-hover)' },
  downloadComplete: { label: 'Download Complete', color: 'var(--info)' },
  downloadFailed: { label: 'Download Failed', color: 'var(--danger)' },
  importFailed: { label: 'Import Failed', color: 'var(--danger)' },
  imported: { label: 'Imported', color: 'var(--success)' },
  deleted: { label: 'Deleted', color: 'var(--text-muted)' },
  ignored: { label: 'Ignored', color: 'var(--text-muted)' },
}

const FILTERS: { label: string; value: HistoryEventType | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Grabbed', value: 'grabbed' },
  { label: 'Imported', value: 'imported' },
  { label: 'Download Failed', value: 'downloadFailed' },
  { label: 'Import Failed', value: 'importFailed' },
  { label: 'Deleted', value: 'deleted' },
]

export default function HistoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<HistoryEventType | ''>('')
  const [detail, setDetail] = useState<HistoryItem | null>(null)

  const {
    data: items = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['history', filter],
    queryFn: () => historyApi.list({ event_type: filter || undefined, limit: 250 }),
  })

  return (
    <div className="activity-page">
      <div className="activity-toolbar">
        <span className="activity-title">History</span>
        <span className="activity-count">{items.length}</span>
        <div className="activity-filters">
          <button
            className="btn-icon"
            title="Refresh"
            onClick={() => refetch()}
            disabled={isFetching}
          >
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
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const meta = EVENT_META[item.event_type] ?? {
                  label: item.event_type,
                  color: 'var(--text-muted)',
                }
                const hasData = item.data && Object.keys(item.data).length > 0
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
                    <td>
                      {hasData && (
                        <button
                          className="btn-icon"
                          title="Details"
                          onClick={() => setDetail(item)}
                        >
                          <Info size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && <HistoryDetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function HistoryDetailModal({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  const meta = EVENT_META[item.event_type] ?? { label: item.event_type, color: 'var(--text-muted)' }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ color: meta.color }}>{meta.label}</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <table className="activity-table" style={{ fontSize: 13 }}>
            <tbody>
              {Object.entries(item.data).map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      color: 'var(--text-muted)',
                      width: '35%',
                      fontFamily: 'monospace',
                      fontSize: 12,
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ wordBreak: 'break-all' }}>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
