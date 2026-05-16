import { X } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn-icon" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
