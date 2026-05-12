import { useState } from 'react'
import { Plus, X, List } from 'lucide-react'

interface ListSource {
  id: number
  name: string
  plugin: string
  enabled: boolean
}

const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  igdb: 'Import games from an IGDB collection or by specific IGDB game IDs.',
}

export default function ListsPage() {
  const [sources, setSources] = useState<ListSource[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPlugin, setNewPlugin] = useState('igdb')
  const [newConfig, setNewConfig] = useState('{\n  "client_id": "",\n  "client_secret": "",\n  "platform_map": {},\n  "game_ids": []\n}')

  function handleAdd() {
    if (!newName.trim()) return
    setSources(prev => [...prev, { id: Date.now(), name: newName, plugin: newPlugin, enabled: true }])
    setShowNew(false)
    setNewName('')
  }

  return (
    <div>
      <div className="settings-section-title">Lists</div>
      <div className="settings-section-desc">
        List plugins populate your Wanted list automatically from external sources.
      </div>

      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add List</button>
      </div>

      {sources.length === 0 && !showNew && (
        <div className="empty-state">
          <List size={40} />
          <p>No lists configured</p>
          <small>Add the IGDB plugin to automatically populate your Wanted list from a game collection.</small>
        </div>
      )}

      {sources.map(s => (
        <div key={s.id} className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-white)', marginBottom: 2 }}>{s.name}</div>
            <div className="text-muted text-sm">{s.plugin} — {PLUGIN_DESCRIPTIONS[s.plugin] ?? ''}</div>
          </div>
          <div className="flex-center gap-2">
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={e => setSources(prev => prev.map(x => x.id === s.id ? { ...x, enabled: e.target.checked } : x))}
              />
              <span className="toggle-slider" />
            </label>
            <button className="btn-icon" onClick={() => setSources(prev => prev.filter(x => x.id !== s.id))}>
              <X size={14} />
            </button>
          </div>
        </div>
      ))}

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add List</span>
              <button className="btn-icon" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-control" value={newName} onChange={e => setNewName(e.target.value)} placeholder="My IGDB List" />
              </div>
              <div className="form-group">
                <label className="form-label">Plugin</label>
                <select className="form-control" value={newPlugin} onChange={e => setNewPlugin(e.target.value)}>
                  <option value="igdb">IGDB</option>
                </select>
                <div className="form-hint">{PLUGIN_DESCRIPTIONS[newPlugin]}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Configuration (JSON)</label>
                <textarea
                  className="form-control"
                  rows={8}
                  value={newConfig}
                  onChange={e => setNewConfig(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add List</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
