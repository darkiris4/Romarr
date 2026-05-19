import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { systemApi } from '../../api/system'

export default function UpdatesPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['system-updates'],
    queryFn: systemApi.updates,
    staleTime: 6 * 3600 * 1000,
    retry: false,
  })

  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 16 }}>
        Updates
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        {isLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Checking for updates…</div>
        ) : isError ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}
          >
            <AlertCircle size={16} />
            <span>Could not reach GitHub — check your internet connection.</span>
          </div>
        ) : data ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              {data.has_update ? (
                <AlertCircle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              ) : (
                <CheckCircle size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 14 }}>
                {data.has_update ? (
                  <>
                    <strong style={{ color: 'var(--accent)' }}>v{data.latest}</strong> is available
                    — you are running{' '}
                    <strong style={{ color: 'var(--text-white)' }}>v{data.current}</strong>
                  </>
                ) : (
                  <>
                    You are running the latest version —{' '}
                    <strong style={{ color: 'var(--text-white)' }}>v{data.current}</strong>
                  </>
                )}
              </span>
            </div>

            {data.release_notes && (
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  marginBottom: 16,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {data.release_notes}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {data.release_url && (
                <a
                  href={data.release_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink size={13} />
                  View on GitHub
                </a>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => refetch()}
                disabled={isFetching}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw
                  size={13}
                  style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined}
                />
                Check Again
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
