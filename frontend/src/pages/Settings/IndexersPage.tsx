import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle, XCircle, X, Wifi } from 'lucide-react'
import { indexersApi } from '../../api/indexers'
import type { Indexer } from '../../types'

function IndexerModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Indexer
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [protocol, setProtocol] = useState<'newznab' | 'torznab'>(initial?.protocol ?? 'torznab')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [apiKey, setApiKey] = useState(initial?.api_key ?? '')
  const [priority, setPriority] = useState(initial?.priority ?? 25)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const qc = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: () =>
      initial
        ? indexersApi.update(initial.id, {
            name,
            protocol,
            url,
            api_key: apiKey,
            priority,
            enabled,
          })
        : indexersApi.create({
            name,
            protocol,
            url,
            api_key: apiKey,
            priority,
            enabled,
            categories: '',
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['indexers'] })
      onSaved()
    },
  })

  async function handleTest() {
    if (!initial) return
    setTesting(true)
    try {
      const result = await indexersApi.test(initial.id)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{initial ? 'Edit Indexer' : 'Add Indexer'}</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {testResult && (
            <div className={`alert ${testResult.success ? 'alert-success' : 'alert-danger'}`}>
              {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {testResult.message}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Indexer"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Protocol</label>
              <select
                className="form-control"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as any)}
              >
                <option value="torznab">Torznab (torrents)</option>
                <option value="newznab">Newznab (Usenet)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <input
                className="form-control"
                type="number"
                value={priority}
                onChange={(e) => setPriority(+e.target.value)}
                min={1}
                max={50}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">URL</label>
            <input
              className="form-control"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://prowlarr:9696/1"
            />
            <div className="form-hint">
              Point at Prowlarr (/&lt;id&gt;/api) or a direct Torznab/Newznab endpoint.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              className="form-control"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          {initial && (
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test'}
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function IndexersPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'new' | Indexer | null>(null)

  const { data: indexers = [], isLoading } = useQuery({
    queryKey: ['indexers'],
    queryFn: indexersApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: indexersApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['indexers'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      indexersApi.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['indexers'] }),
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  return (
    <div>
      <div className="settings-section-title">Indexers</div>
      <div className="settings-section-desc">
        Configure Newznab/Torznab indexers or point at Prowlarr for unified indexer management.
      </div>

      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={14} /> Add Indexer
        </button>
      </div>

      {indexers.length === 0 ? (
        <div className="empty-state">
          <Wifi size={40} />
          <p>No indexers configured</p>
          <small>Add a Torznab/Newznab indexer or Prowlarr proxy to start searching.</small>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Protocol</th>
                  <th>URL</th>
                  <th>Priority</th>
                  <th>Enabled</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {indexers.map((idx) => (
                  <tr key={idx.id}>
                    <td
                      style={{ fontWeight: 500, color: 'var(--accent)', cursor: 'pointer' }}
                      onClick={() => setModal(idx)}
                    >
                      {idx.name}
                    </td>
                    <td className="text-muted text-sm" style={{ textTransform: 'uppercase' }}>
                      {idx.protocol}
                    </td>
                    <td
                      className="text-muted text-sm"
                      style={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {idx.url}
                    </td>
                    <td className="text-muted">{idx.priority}</td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={idx.enabled}
                          onChange={(e) =>
                            toggleMutation.mutate({ id: idx.id, enabled: e.target.checked })
                          }
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => deleteMutation.mutate(idx.id)}>
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

      {modal !== null && (
        <IndexerModal
          initial={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}
