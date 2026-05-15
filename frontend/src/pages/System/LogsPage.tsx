import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Trash2, Download, FileText, Info } from 'lucide-react'
import { logsApi } from '../../api/logs'
import ConfirmModal from '../../components/ConfirmModal'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(2)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function LogsPage() {
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['log-files'],
    queryFn: logsApi.files,
    refetchInterval: false,
  })

  const files = data?.files ?? []
  const logDir = data?.log_dir ?? ''

  const clearMutation = useMutation({
    mutationFn: logsApi.clear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['log-files'] })
      setShowClearConfirm(false)
    },
  })

  return (
    <div>
      <div className="page-toolbar">
        <button
          className="toolbar-icon-btn"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Refresh log file list"
        >
          <RefreshCw size={18} style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
          <span>Refresh</span>
        </button>

        <button
          className="toolbar-icon-btn"
          onClick={() => setShowClearConfirm(true)}
          disabled={clearMutation.isPending || files.length === 0}
          title="Delete all log files"
        >
          <Trash2 size={18} />
          <span>Clear</span>
        </button>
      </div>

      {logDir && (
        <div className="info-block" style={{ marginBottom: 20 }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Log files are stored at <code>{logDir}</code>. Log level can be changed in{' '}
            <Link to="/settings/general" style={{ color: 'var(--accent)' }}>Settings → General → Logging</Link>.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="loading-page"><div className="spinner" /> Loading…</div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <FileText size={40} />
          <p>No log files</p>
          <small>Log files will appear here once the application writes its first entries.</small>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Last Write Time</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.filename}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{f.filename}</span>
                        {f.log_type !== 'standard' && (
                          <span className="badge" style={{
                            background: f.log_type === 'debug' ? 'rgba(53,197,244,.15)' : 'rgba(155,89,182,.15)',
                            color: f.log_type === 'debug' ? 'var(--info)' : 'var(--purple)',
                            fontSize: 10,
                          }}>
                            {f.log_type.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{formatSize(f.size)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{formatDate(f.last_modified)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <a
                        href={logsApi.downloadUrl(f.filename)}
                        download={f.filename}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Download size={12} /> Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <ConfirmModal
          title="Clear Log Files"
          message="Delete all log files? This cannot be undone. New log files will be created automatically."
          confirmLabel="Clear All"
          danger
          onConfirm={() => clearMutation.mutate()}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  )
}
