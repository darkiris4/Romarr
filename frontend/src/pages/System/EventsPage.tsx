import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, Bell } from 'lucide-react'
import { format } from 'date-fns'
import { systemApi } from '../../api/system'

const PER_PAGE = 50

function formatTime(iso: string) {
  try {
    return format(new Date(iso), 'h:mmaaa')
  } catch {
    return iso
  }
}

export default function EventsPage() {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['events', page],
    queryFn: () => systemApi.events(page, PER_PAGE),
  })

  const clearMutation = useMutation({
    mutationFn: systemApi.clearEvents,
    onSuccess: () => {
      setPage(1)
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1

  return (
    <div>
      <div className="page-toolbar">
        <button
          className="toolbar-icon-btn"
          onClick={() => qc.invalidateQueries({ queryKey: ['events'] })}
        >
          <RefreshCw size={18} />
          <span>Refresh</span>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => clearMutation.mutate()}
          disabled={!data?.total || clearMutation.isPending}
        >
          <Trash2 size={18} />
          <span>Clear</span>
        </button>
        <div className="spacer" />
        {data && data.total > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {data.total.toLocaleString()} event{data.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="loading-page"><div className="spinner" /> Loading…</div>
      ) : !data?.events.length ? (
        <div className="empty-state">
          <Bell size={48} />
          <p>No events</p>
          <small>Events are logged as Romarr performs background operations.</small>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, marginBottom: 16 }}>
            <table className="activity-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Time</th>
                  <th style={{ width: 200 }}>Component</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }} title={ev.created_at}>
                      {formatTime(ev.created_at)}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid rgba(123,104,238,.25)' }}>
                        {ev.component}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-primary)' }}>{ev.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
              >
                Previous
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
