import { useState } from 'react'
import { GripVertical, RotateCcw } from 'lucide-react'

export interface ColumnConfig {
  key: 'platform' | 'region' | 'year' | 'status' | 'tags'
  label: string
  visible: boolean
}

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'platform', label: 'Platform', visible: true },
  { key: 'region', label: 'Region', visible: true },
  { key: 'year', label: 'Year', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'tags', label: 'Tags', visible: false },
]

const COLUMNS_KEY = 'games-column-config'

export function loadColumns(): ColumnConfig[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore malformed JSON
  }
  return DEFAULT_COLUMNS
}

export function saveColumns(cols: ColumnConfig[]) {
  localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols))
}

interface Props {
  columns: ColumnConfig[]
  onChange: (cols: ColumnConfig[]) => void
  onClose: () => void
}

export default function ColumnChooser({ columns, onChange, onClose }: Props) {
  const [dragSrc, setDragSrc] = useState<number | null>(null)

  function toggle(index: number) {
    onChange(columns.map((c, i) => (i === index ? { ...c, visible: !c.visible } : c)))
  }

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragSrc(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    if (dragSrc === null || dragSrc === targetIndex) return
    const updated = [...columns]
    const [moved] = updated.splice(dragSrc, 1)
    updated.splice(targetIndex, 0, moved)
    onChange(updated)
    setDragSrc(null)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Columns</span>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Drag to reorder. Cover and Title are always shown.
          </p>
          <div className="column-chooser-list">
            {columns.map((col, i) => (
              <div
                key={col.key}
                className={`column-chooser-row${dragSrc === i ? ' dragging' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={() => setDragSrc(null)}
              >
                <GripVertical size={14} className="drag-handle" />
                <label className="column-chooser-label">
                  <input type="checkbox" checked={col.visible} onChange={() => toggle(i)} />
                  {col.label}
                </label>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            style={{ marginRight: 'auto' }}
            onClick={() => onChange(DEFAULT_COLUMNS)}
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
