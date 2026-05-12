import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle, XCircle, X, Server } from 'lucide-react'
import { downloadClientsApi } from '../../api/downloadClients'
import type { DownloadClient, DownloadClientType } from '../../types'

const CLIENT_DEFAULTS: Record<DownloadClientType, { port: number; urlBase: string }> = {
  qbittorrent: { port: 8080, urlBase: '' },
  sabnzbd: { port: 8080, urlBase: '/sabnzbd' },
  deluge: { port: 8112, urlBase: '' },
  transmission: { port: 9091, urlBase: '' },
}

function ClientModal({ initial, onClose, onSaved }: {
  initial?: DownloadClient
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [impl, setImpl] = useState<DownloadClientType>(initial?.implementation ?? 'qbittorrent')
  const [host, setHost] = useState(initial?.host ?? 'localhost')
  const [port, setPort] = useState(initial?.port ?? 8080)
  const [urlBase, setUrlBase] = useState(initial?.url_base ?? '')
  const [useSsl, setUseSsl] = useState(initial?.use_ssl ?? false)
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState(initial?.password ?? '')
  const [apiKey, setApiKey] = useState(initial?.api_key ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'romarr')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const qc = useQueryClient()
  const needs_api_key = impl === 'sabnzbd'
  const needs_password = impl !== 'sabnzbd'

  const saveMutation = useMutation({
    mutationFn: () => initial
      ? downloadClientsApi.update(initial.id, { name, implementation: impl, host, port, url_base: urlBase, use_ssl: useSsl, username, password, api_key: apiKey, category, enabled: true, priority: 0 })
      : downloadClientsApi.create({ name, implementation: impl, host, port, url_base: urlBase, use_ssl: useSsl, username, password, api_key: apiKey, category, enabled: true, priority: 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['download-clients'] }); onSaved() },
  })

  async function handleTest() {
    if (!initial) return
    setTesting(true)
    try {
      const result = await downloadClientsApi.test(initial.id)
      setTestResult(result)
    } finally { setTesting(false) }
  }

  function handleImplChange(v: DownloadClientType) {
    setImpl(v)
    const defaults = CLIENT_DEFAULTS[v]
    setPort(defaults.port)
    setUrlBase(defaults.urlBase)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{initial ? 'Edit Download Client' : 'Add Download Client'}</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {testResult && (
            <div className={`alert ${testResult.success ? 'alert-success' : 'alert-danger'}`}>
              {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {testResult.message}
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-control" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Client</label>
              <select className="form-control" value={impl} onChange={e => handleImplChange(e.target.value as DownloadClientType)}>
                <option value="qbittorrent">qBittorrent</option>
                <option value="sabnzbd">SABnzbd</option>
                <option value="transmission">Transmission</option>
                <option value="deluge">Deluge (coming soon)</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Host</label>
              <input className="form-control" value={host} onChange={e => setHost(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Port</label>
              <input className="form-control" type="number" value={port} onChange={e => setPort(+e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">URL Base</label>
              <input className="form-control" value={urlBase} onChange={e => setUrlBase(e.target.value)} placeholder="/sabnzbd" />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-control" value={category} onChange={e => setCategory(e.target.value)} />
            </div>
          </div>
          {needs_api_key && (
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input className="form-control" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
            </div>
          )}
          {needs_password && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-control" value={username} onChange={e => setUsername(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            </div>
          )}
          <div className="toggle-row" style={{ paddingTop: 8 }}>
            <div className="toggle-label">Use SSL</div>
            <label className="toggle">
              <input type="checkbox" checked={useSsl} onChange={e => setUseSsl(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
        <div className="modal-footer">
          {initial && (
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test'}
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DownloadClientsPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'new' | DownloadClient | null>(null)

  const { data: clients = [], isLoading } = useQuery({ queryKey: ['download-clients'], queryFn: downloadClientsApi.list })

  const deleteMutation = useMutation({
    mutationFn: downloadClientsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['download-clients'] }),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>

  return (
    <div>
      <div className="settings-section-title">Download Clients</div>
      <div className="settings-section-desc">Configure clients to receive grabbed releases.</div>

      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Add Client</button>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state">
          <Server size={40} />
          <p>No download clients configured</p>
          <small>Add qBittorrent, SABnzbd, or Transmission.</small>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Host</th>
                  <th>Category</th>
                  <th>Enabled</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td
                      style={{ fontWeight: 500, color: 'var(--accent)', cursor: 'pointer' }}
                      onClick={() => setModal(c)}
                    >{c.name}</td>
                    <td className="text-muted text-sm" style={{ textTransform: 'capitalize' }}>{c.implementation}</td>
                    <td className="text-muted text-sm">{c.host}:{c.port}</td>
                    <td className="text-muted text-sm">{c.category}</td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={c.enabled} readOnly />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => deleteMutation.mutate(c.id)}><Trash2 size={14} /></button>
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
        <ClientModal
          initial={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  )
}
