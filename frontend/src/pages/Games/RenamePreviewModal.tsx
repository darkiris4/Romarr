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
      <div
        className="modal"
        style={{ maxWidth: 860, width: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">Preview Rename</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: 520, overflowY: 'auto', padding: 0 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
              Building preview…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
              None of the selected games have a file path recorded.
            </div>
          ) : (
            <div>
              {rows.map((r) => (
                <div
                  key={r.game_id}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    opacity: r.eligible ? 1 : 0.45,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--text-white)', fontSize: 13 }}>
                      {r.title}
                    </span>
                    {r.eligible ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--success)',
                        }}
                      >
                        <CheckCircle size={11} /> Ready
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {r.reason ?? 'Skip'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                        width: 52,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Current
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        wordBreak: 'break-all',
                        lineHeight: 1.5,
                      }}
                    >
                      {r.current_filename ?? '—'}
                    </span>
                  </div>
                  {r.eligible && r.proposed_filename && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--success)',
                          flexShrink: 0,
                          width: 52,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        New
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: 'var(--success)',
                          wordBreak: 'break-all',
                          lineHeight: 1.5,
                        }}
                      >
                        {r.proposed_filename}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
