import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { List, Plus, RefreshCw, X } from 'lucide-react'
import { listSourcesApi } from '../../api/listSources'

const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  igdb: 'Import games from an IGDB collection or by specific IGDB game IDs.',
}

const DEFAULT_CONFIGS: Record<string, string> = {
  igdb: '{\n  "client_id": "",\n  "client_secret": "",\n  "platform_map": {},\n  "game_ids": []\n}',
}

export default function ListsPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPlugin, setNewPlugin] = useState('igdb')
  const [newConfig, setNewConfig] = useState(DEFAULT_CONFIGS.igdb)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [syncResult, setSyncResult] = useState<Record<number, string>>({})

  const { data: sources = [] } = useQuery({
    queryKey: ['list-sources'],
    queryFn: listSourcesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      listSourcesApi.create({
        name: newName.trim(),
        plugin: newPlugin,
        enabled: true,
        config: newConfig,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list-sources'] })
      setShowNew(false)
      setNewName('')
      setNewConfig(DEFAULT_CONFIGS[newPlugin] ?? '{}')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      enabled,
      source,
    }: {
      id: number
      enabled: boolean
      source: (typeof sources)[0]
    }) =>
      listSourcesApi.update(id, {
        name: source.name,
        plugin: source.plugin,
        config: source.config,
        enabled,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-sources'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: listSourcesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-sources'] }),
  })

  async function handleSync(id: number) {
    setSyncingId(id)
    setSyncResult((prev) => ({ ...prev, [id]: '' }))
    try {
      const r = await listSourcesApi.sync(id)
      qc.invalidateQueries({ queryKey: ['list-sources'] })
      setSyncResult((prev) => ({
        ...prev,
        [id]: r.added === 0 ? 'Up to date' : `${r.added} game${r.added !== 1 ? 's' : ''} added`,
      }))
    } catch {
      setSyncResult((prev) => ({ ...prev, [id]: 'Sync failed' }))
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div>
      <div className="settings-section-title">Lists</div>
      <div className="settings-section-desc">
        List plugins populate your Wanted list automatically from external sources.
      </div>

      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={14} /> Add List
        </button>
      </div>

      {sources.length === 0 && !showNew && (
        <div className="empty-state">
          <List size={40} />
          <p>No lists configured</p>
          <small>
            Add the IGDB plugin to automatically populate your Wanted list from a game collection.
          </small>
        </div>
      )}

      {sources.map((s) => (
        <div
          key={s.id}
          className="card"
          style={{
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-white)', marginBottom: 2 }}>
              {s.name}
            </div>
            <div className="text-muted text-sm">
              {s.plugin} — {PLUGIN_DESCRIPTIONS[s.plugin] ?? ''}
            </div>
            {s.last_sync && (
              <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                Last sync: {new Date(s.last_sync).toLocaleString()}
              </div>
            )}
            {syncResult[s.id] && (
              <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 2 }}>
                {syncResult[s.id]}
              </div>
            )}
          </div>
          <div className="flex-center gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSync(s.id)}
              disabled={syncingId === s.id}
              title="Sync now"
            >
              <RefreshCw
                size={13}
                style={syncingId === s.id ? { animation: 'spin 1s linear infinite' } : undefined}
              />
              {syncingId === s.id ? 'Syncing…' : 'Sync'}
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) =>
                  toggleMutation.mutate({ id: s.id, enabled: e.target.checked, source: s })
                }
              />
              <span className="toggle-slider" />
            </label>
            <button className="btn-icon" onClick={() => deleteMutation.mutate(s.id)}>
              <X size={14} />
            </button>
          </div>
        </div>
      ))}

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add List</span>
              <button className="btn-icon" onClick={() => setShowNew(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My IGDB List"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Plugin</label>
                <select
                  className="form-control"
                  value={newPlugin}
                  onChange={(e) => {
                    setNewPlugin(e.target.value)
                    setNewConfig(DEFAULT_CONFIGS[e.target.value] ?? '{}')
                  }}
                >
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
                  onChange={(e) => setNewConfig(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || createMutation.isPending}
              >
                Add List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
