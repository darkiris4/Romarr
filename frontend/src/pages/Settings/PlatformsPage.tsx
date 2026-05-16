import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X, MonitorPlay } from 'lucide-react'
import { platformsApi } from '../../api/platforms'
import type { Platform } from '../../types'

interface PlatformFormProps {
  initial?: Partial<Platform>
  onSubmit: (data: Omit<Platform, 'id' | 'created_at' | 'updated_at'>) => void
  onCancel: () => void
  isPending: boolean
}

function PlatformForm({ initial, onSubmit, onCancel, isPending }: PlatformFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [noIntroName, setNoIntroName] = useState(initial?.no_intro_name ?? '')
  const [folderName, setFolderName] = useState(initial?.folder_name ?? '')
  const [extensions, setExtensions] = useState(initial?.extensions ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ name, no_intro_name: noIntroName, folder_name: folderName, extensions, enabled })
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{initial?.id ? 'Edit Platform' : 'Add Platform'}</span>
          <button className="btn-icon" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Super Nintendo Entertainment System"
              />
            </div>
            <div className="form-group">
              <label className="form-label">No-Intro DAT Name</label>
              <input
                className="form-control"
                value={noIntroName}
                onChange={(e) => setNoIntroName(e.target.value)}
                required
                placeholder="Nintendo - Super Nintendo Entertainment System"
              />
              <div className="form-hint">Matches the No-Intro DAT file header name.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Library Folder Name</label>
              <input
                className="form-control"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                required
                placeholder="Nintendo - Super Nintendo Entertainment System"
              />
            </div>
            <div className="form-group">
              <label className="form-label">File Extensions</label>
              <input
                className="form-control"
                value={extensions}
                onChange={(e) => setExtensions(e.target.value)}
                placeholder="sfc,smc"
              />
              <div className="form-hint">Comma-separated, no dots.</div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PlatformsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Platform | null>(null)

  const { data: platforms = [], isLoading } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  })
  const { data: builtins = [] } = useQuery({
    queryKey: ['platforms-builtin'],
    queryFn: platformsApi.builtin,
  })

  const createMutation = useMutation({
    mutationFn: platformsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platforms'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Platform> }) =>
      platformsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platforms'] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: platformsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms'] }),
  })

  function addBuiltin(b: (typeof builtins)[0]) {
    createMutation.mutate({ ...b, enabled: true })
  }

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  return (
    <div>
      <div className="settings-section-title">Platforms</div>
      <div className="settings-section-desc">
        Configure which platforms Romarr manages. Platform folder names must match No-Intro
        conventions.
      </div>

      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <div className="spacer" />
        <button className="btn btn-secondary" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Add Custom Platform
        </button>
      </div>

      {platforms.length === 0 ? (
        <div className="empty-state">
          <MonitorPlay size={40} />
          <p>No platforms configured</p>
          <small>Add a platform below to get started.</small>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, marginBottom: 24 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>No-Intro Name</th>
                  <th>Extensions</th>
                  <th>Enabled</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {platforms.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>{p.name}</td>
                    <td className="text-muted text-sm">{p.no_intro_name}</td>
                    <td className="text-muted text-sm">{p.extensions || '—'}</td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={(e) =>
                            updateMutation.mutate({ id: p.id, data: { enabled: e.target.checked } })
                          }
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => deleteMutation.mutate(p.id)}>
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

      <div className="card">
        <div className="card-header">
          <span className="card-title">Common Platforms</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 8,
          }}
        >
          {builtins
            .filter((b) => !platforms.some((p) => p.no_intro_name === b.no_intro_name))
            .map((b) => (
              <div
                key={b.no_intro_name}
                className="card"
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onClick={() => addBuiltin(b)}
              >
                <span style={{ fontSize: 13 }}>{b.name}</span>
                <Plus size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              </div>
            ))}
        </div>
      </div>

      {(showForm || editTarget) && (
        <PlatformForm
          initial={editTarget ?? undefined}
          isPending={createMutation.isPending || updateMutation.isPending}
          onCancel={() => {
            setShowForm(false)
            setEditTarget(null)
          }}
          onSubmit={(data) => {
            if (editTarget) updateMutation.mutate({ id: editTarget.id, data })
            else createMutation.mutate(data)
          }}
        />
      )}
    </div>
  )
}
