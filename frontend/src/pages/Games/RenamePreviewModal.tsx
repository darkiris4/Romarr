import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle, X } from 'lucide-react'
import { libraryApi } from '../../api/library'

interface Props {
  gameIds: number[]
  onClose: () => void
  onDone: () => void
}

export default function RenamePreviewModal({ gameIds, onClose, onDone }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['rename-preview', gameIds],
    queryFn: () => libraryApi.renamePreview(gameIds),
  })

  const rows = data?.rows ?? []
  const eligibleIds = rows.filter((r) => r.eligible).map((r) => r.game_id)

  const renameMutation = useMutation({
    mutationFn: () => libraryApi.rename(eligibleIds),
    onSuccess: onDone,
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 740 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Preview Rename</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto', padding: 0 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
              Building preview…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
              None of the selected games have a file path recorded.
            </div>
          ) : (
            <table className="activity-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Current Filename</th>
                  <th>Proposed Filename</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.game_id} style={{ opacity: r.eligible ? 1 : 0.45 }}>
                    <td style={{ color: 'var(--text-white)' }}>{r.title}</td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.current_filename ?? '—'}
                    </td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: r.eligible ? 'var(--success)' : 'var(--text-muted)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.proposed_filename ?? '—'}
                    </td>
                    <td>
                      {r.eligible ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--success)',
                          }}
                        >
                          <CheckCircle size={12} /> Ready
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {r.reason ?? 'Skip'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer">
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
            {eligibleIds.length} of {rows.length} game{rows.length !== 1 ? 's' : ''} will be renamed
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => renameMutation.mutate()}
            disabled={eligibleIds.length === 0 || renameMutation.isPending}
          >
            {renameMutation.isPending
              ? 'Renaming…'
              : `Rename ${eligibleIds.length > 0 ? eligibleIds.length : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
