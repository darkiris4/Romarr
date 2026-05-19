import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Copy, Check } from 'lucide-react'
import { logsApi } from '../../api/logs'

export default function GeneralPage() {
  const [saved, setSaved] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const qc = useQueryClient()

  // Host
  const [port, setPort] = useState('8000')
  const [urlBase, setUrlBase] = useState('')

  // Security
  const [authMethod, setAuthMethod] = useState('None')
  const [authRequired, setAuthRequired] = useState('DisabledForLocalAddresses')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const apiKey = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'

  // Logging
  const { data: levelData } = useQuery({ queryKey: ['log-level'], queryFn: logsApi.level })
  const setLevelMutation = useMutation({
    mutationFn: (level: string) => logsApi.setLevel(level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-level'] }),
  })
  const logLevel = levelData?.level ?? 'info'


  // Updates
  const [branch, setBranch] = useState('main')
  const [autoUpdate, setAutoUpdate] = useState(false)

  // Backup
  const [backupFolder, setBackupFolder] = useState('./Backups')
  const [backupInterval, setBackupInterval] = useState('7')
  const [backupRetention, setBackupRetention] = useState('28')

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function copyApiKey() {
    navigator.clipboard.writeText(apiKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  function regenerateKey() {
    // no-op in UI-only mode
  }

  return (
    <div>
      <div className="settings-section-title">General</div>
      <div className="settings-section-desc">
        Application host, security, logging, and maintenance settings.
      </div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        {/* ── Host ── */}
        <div className="settings-section-title" style={{ marginTop: 8 }}>
          Host
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">Port Number</label>
            <input
              className="form-control"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <div className="form-hint">Requires restart to take effect.</div>
          </div>
          <div className="form-group">
            <label className="form-label">URL Base</label>
            <input
              className="form-control"
              value={urlBase}
              onChange={(e) => setUrlBase(e.target.value)}
              placeholder="/"
              style={{ maxWidth: 240 }}
            />
            <div className="form-hint">
              For reverse proxy support. Example: <code>/romarr</code>
            </div>
          </div>
        </div>

        {/* ── Security ── */}
        <div className="settings-section-title">Security</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">Authentication Method</label>
            <select
              className="form-control"
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value)}
              style={{ maxWidth: 240 }}
            >
              <option value="None">None</option>
              <option value="Basic">Basic (Browser Popup)</option>
              <option value="Forms">Forms (Login Page)</option>
            </select>
            <div className="form-hint">
              {authMethod === 'None'
                ? 'No authentication. Recommended for trusted local networks only.'
                : authMethod === 'Basic'
                  ? 'Browser-native popup dialog. Simple but credentials are not encrypted in transit without HTTPS.'
                  : 'Full login page. Recommended when exposed to a wider network.'}
            </div>
          </div>

          {authMethod !== 'None' && (
            <>
              <div className="form-group">
                <label className="form-label">Authentication Required</label>
                <select
                  className="form-control"
                  value={authRequired}
                  onChange={(e) => setAuthRequired(e.target.value)}
                  style={{ maxWidth: 320 }}
                >
                  <option value="DisabledForLocalAddresses">Disabled for Local Addresses</option>
                  <option value="Enabled">Enabled</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  style={{ maxWidth: 280 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-control"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  style={{ maxWidth: 280 }}
                />
              </div>
            </>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">API Key</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420 }}>
              <input
                className="form-control"
                value={apiKey}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={copyApiKey}
                style={{ flexShrink: 0 }}
              >
                {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                {copiedKey ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={regenerateKey}
                style={{ flexShrink: 0 }}
              >
                <RefreshCw size={13} /> Reset
              </button>
            </div>
            <div className="form-hint">
              Used by external applications and scripts to access the Romarr API.
            </div>
          </div>
        </div>

        {/* ── Logging ── */}
        <div className="settings-section-title">Logging</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Log Level</label>
            <select
              className="form-control"
              value={logLevel}
              onChange={(e) => setLevelMutation.mutate(e.target.value)}
              style={{ maxWidth: 180 }}
            >
              <option value="info">Info</option>
              <option value="debug">Debug</option>
              <option value="trace">Trace</option>
            </select>
            <div className="form-hint">
              {logLevel === 'trace' || logLevel === 'debug'
                ? 'Verbose output — only enable for troubleshooting. Causes significant log growth.'
                : 'Standard logging level. View log files under System → Logs.'}
            </div>
          </div>
        </div>

        {/* ── Updates ── */}
        <div className="settings-section-title">Updates</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">Branch</label>
            <input
              className="form-control"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              style={{ maxWidth: 200 }}
            />
            <div className="form-hint">
              The release branch to track for updates. Use <code>main</code> for stable releases.
            </div>
          </div>
          <div className="toggle-row" style={{ borderBottom: 'none' }}>
            <div>
              <div className="toggle-label">Automatic</div>
              <div className="toggle-hint">
                Automatically install updates when available. Romarr will restart.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoUpdate}
                onChange={(e) => setAutoUpdate(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* ── Backup ── */}
        <div className="settings-section-title">Backups</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">Folder</label>
            <input
              className="form-control"
              value={backupFolder}
              onChange={(e) => setBackupFolder(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <div className="form-hint">
              Path where Romarr stores database backups. Relative paths are from the application
              data directory.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Interval</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="form-control"
                type="number"
                value={backupInterval}
                onChange={(e) => setBackupInterval(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>days</span>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Retention</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="form-control"
                type="number"
                value={backupRetention}
                onChange={(e) => setBackupRetention(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>files</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}
