import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, Bell, Info, X } from 'lucide-react'
import { format } from 'date-fns'
import { systemApi, type AppEvent } from '../../api/system'

const PER_PAGE = 50

function formatTime(iso: string) {
  try {
    return format(new Date(iso), 'h:mmaaa')
  } catch {
    return iso
  }
}

function formatFull(iso: string) {
  try {
    return format(new Date(iso), 'PPpp')
  } catch {
    return iso
  }
}

function DetailModal({ event, onClose }: { event: AppEvent; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Event Detail</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              COMPONENT
            </div>
            <span
              className="badge"
              style={{
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                border: '1px solid rgba(123,104,238,.25)',
              }}
            >
              {event.component}
            </span>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>MESSAGE</div>
            <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{event.message}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>TIME</div>
            <div style={{ color: 'var(--text-primary)' }}>{formatFull(event.created_at)}</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EventsPage() {
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<AppEvent | null>(null)
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
        <div className="loading-page">
          <div className="spinner" /> Loading…
        </div>
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
                  <th style={{ width: 32 }}></th>
                  <th style={{ width: 80 }}>Time</th>
                  <th style={{ width: 200 }}>Component</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <button
                        className="btn-icon"
                        title="Details"
                        onClick={() => setDetail(ev)}
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Info size={14} />
                      </button>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatTime(ev.created_at)}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: 'var(--accent-subtle)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(123,104,238,.25)',
                        }}
                      >
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
            <div
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}
            >
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
              >
                Previous
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {detail && <DetailModal event={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
