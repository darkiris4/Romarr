import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Clock, RefreshCw, HardDriveDownload, CheckCircle, AlertCircle } from 'lucide-react'
import { queueApi } from '../../api/queue'
import type { QueueItem } from '../../types'

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

function formatETA(eta: string | undefined): string {
  if (!eta) return '—'
  // FastAPI serializes naive UTC datetimes without 'Z' — force UTC parsing
  const utc = eta.endsWith('Z') || eta.includes('+') ? eta : eta + 'Z'
  const diffMs = new Date(utc).getTime() - Date.now()
  if (diffMs <= 0) return '< 1m'
  const totalSec = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return '< 1m'
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

  const [isPolling, setIsPolling] = useState(false)

  const { data: items = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['queue'],
    queryFn: queueApi.list,
    refetchInterval: 5_000,
  })

  async function handleRefresh() {
    setIsPolling(true)
    try {
      await queueApi.poll()
    } finally {
      setIsPolling(false)
    }
    refetch()
  }

  const removeMutation = useMutation({
    mutationFn: (id: number) => queueApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  })

  const [importResult, setImportResult] = useState<{ id: number; ok: boolean; msg: string } | null>(null)

  const importMutation = useMutation({
    mutationFn: (id: number) => queueApi.importItem(id),
    onSuccess: (res, id) => {
      setImportResult({ id, ok: true, msg: `Imported to ${res.data.destination}` })
      qc.invalidateQueries({ queryKey: ['queue'] })
      qc.invalidateQueries({ queryKey: ['games'] })
      qc.invalidateQueries({ queryKey: ['game', res.data.game_id] })
    },
    onError: (err: unknown, id) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Import failed'
      setImportResult({ id, ok: false, msg })
    },
  })

  return (
    <div className="activity-page">
      <div className="activity-toolbar">
        <span className="activity-title">Queue</span>
        <span className="activity-count">{items.length}</span>
        <div className="spacer" />
        <button className="btn-icon" title="Refresh" onClick={handleRefresh} disabled={isPolling || isFetching}>
          <RefreshCw size={14} className={isPolling || isFetching ? 'spin' : ''} />
        </button>
      </div>

      {importResult && (
        <div className={`queue-import-result queue-import-result--${importResult.ok ? 'ok' : 'err'}`}>
          {importResult.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span>{importResult.msg}</span>
          <button className="btn-icon" onClick={() => setImportResult(null)}>×</button>
        </div>
      )}

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
                <th>Client</th>
                <th>Indexer</th>
                <th>Protocol</th>
                <th>Size</th>
                <th style={{ minWidth: 160 }}>Progress</th>
                <th>Time Left</th>
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
                  onImport={() => importMutation.mutate(item.id)}
                  isImporting={importMutation.isPending && importMutation.variables === item.id}
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
  onImport,
  isImporting,
  onGameClick,
}: {
  item: QueueItem
  onRemove: () => void
  onImport: () => void
  isImporting: boolean
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
      <td className="text-muted">{item.download_client_name ?? '—'}</td>
      <td className="text-muted">{item.indexer_name ?? '—'}</td>
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
      <td className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
        {item.status === 'downloading' ? formatETA(item.estimated_completion) : '—'}
      </td>
      <td>
        <span style={{ color, fontSize: 12, fontWeight: 500 }}>
          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
        </span>
        {item.error_message && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
            {item.error_message}
          </div>
        )}
      </td>
      <td className="col-action">
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          {item.status === 'importPending' && (
            <button
              className="btn-sm btn-primary"
              title="Import to library"
              onClick={onImport}
              disabled={isImporting}
            >
              <HardDriveDownload size={13} />
              {isImporting ? 'Importing…' : 'Import'}
            </button>
          )}
          <button className="btn-icon" title="Remove from queue" onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}
