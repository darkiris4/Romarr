import { useRef, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, RotateCcw, Trash2, X } from 'lucide-react'
import { format, isToday } from 'date-fns'
import { systemApi } from '../../api/system'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return isToday(d) ? format(d, 'h:mmaaa') : format(d, 'MMM d yyyy')
  } catch {
    return iso
  }
}

function ConfirmRestoreModal({
  name,
  onConfirm,
  onClose,
}: {
  name: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Restore Backup</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
            Are you sure you want to restore{' '}
            <strong style={{ color: 'var(--text-white)' }}>{name}</strong>?
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
            The current database will be overwritten and the application will restart automatically.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BackupPage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)

  // Poll until the backend is back up after a restore-triggered restart, then reload.
  useEffect(() => {
    if (!restarting) return
    let cancelled = false
    const poll = async () => {
      await new Promise((r) => setTimeout(r, 2000))
      while (!cancelled) {
        try {
          await systemApi.status()
          if (!cancelled) window.location.href = '/'
          return
        } catch {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    }
    poll()
    return () => { cancelled = true }
  }, [restarting])

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: systemApi.backups,
  })

  const createMutation = useMutation({
    mutationFn: systemApi.createBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: systemApi.deleteBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })

  const restoreMutation = useMutation({
    mutationFn: systemApi.restoreBackup,
    onSuccess: () => {
      setConfirmRestore(null)
      setRestarting(true)
    },
  })

  const uploadRestoreMutation = useMutation({
    mutationFn: systemApi.restoreFromUpload,
    onSuccess: () => setRestarting(true),
  })

  function handleFileRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    uploadRestoreMutation.mutate(formData)
    e.target.value = ''
  }

  if (restarting)
    return (
      <div className="loading-page">
        <div className="spinner" />
        <span style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 14 }}>
          Restore complete — waiting for app to restart…
        </span>
      </div>
    )

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  return (
    <div>
      <div className="page-toolbar">
        <button
          className="toolbar-icon-btn"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <div className="spinner" style={{ width: 16, height: 16 }} />
          ) : (
            <Download size={18} />
          )}
          <span>Backup Now</span>
        </button>
        <button className="toolbar-icon-btn" onClick={() => fileInputRef.current?.click()}>
          <RotateCcw size={18} />
          <span>Restore Backup</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={handleFileRestore}
        />
      </div>

      {backups.length === 0 ? (
        <div className="empty-state">
          <Download size={48} />
          <p>No backups yet</p>
          <small>
            Click <strong>Backup Now</strong> to create your first backup.
          </small>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Time</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td>
                      <a
                        href={systemApi.backupDownloadUrl(b.name)}
                        download={b.name}
                        style={{ color: 'var(--text-white)', textDecoration: 'none' }}
                        onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                        onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-white)')}
                      >
                        {b.name}
                      </a>
                    </td>
                    <td className="text-muted">{formatSize(b.size)}</td>
                    <td className="text-muted">{formatTime(b.time)}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button
                          className="btn-icon"
                          title="Restore"
                          onClick={() => setConfirmRestore(b.name)}
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          title="Delete"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => deleteMutation.mutate(b.name)}
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
        </div>
      )}

      {confirmRestore && (
        <ConfirmRestoreModal
          name={confirmRestore}
          onConfirm={() => restoreMutation.mutate(confirmRestore)}
          onClose={() => setConfirmRestore(null)}
        />
      )}
    </div>
  )
}
