import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Copy, Check, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { isAxiosError } from 'axios'
import { logsApi } from '../../api/logs'
import {
  getAuthSettings,
  updateAuthSettings,
  changePassword,
  resetApiKey,
  type AuthMode,
  type AuthRequired,
} from '../../api/auth'
import ConfirmModal from '../../components/ConfirmModal'

function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

const MODE_HINTS: Record<AuthMode, string> = {
  forms: 'Login page with a session cookie. Recommended when exposed to a wider network.',
  basic: 'Browser-native popup dialog. Credentials are not encrypted in transit without HTTPS.',
  none: 'No authentication.',
}

export default function GeneralPage() {
  const qc = useQueryClient()

  // Logging
  const { data: levelData } = useQuery({ queryKey: ['log-level'], queryFn: logsApi.level })
  const setLevelMutation = useMutation({
    mutationFn: (level: string) => logsApi.setLevel(level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-level'] }),
  })
  const logLevel = levelData?.level ?? 'info'

  // Security
  const { data: settings } = useQuery({
    queryKey: ['auth', 'settings'],
    queryFn: getAuthSettings,
  })
  const [mode, setMode] = useState<AuthMode>('forms')
  const [required, setRequired] = useState<AuthRequired>('enabled')
  const [username, setUsername] = useState('')
  const [trustedProxies, setTrustedProxies] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setMode(settings.mode)
    setRequired(settings.required)
    setUsername(settings.username)
    setTrustedProxies(settings.trusted_proxies)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAuthSettings({ mode, required, username, trusted_proxies: trustedProxies }),
    onSuccess: (data) => {
      qc.setQueryData(['auth', 'settings'], data)
      qc.invalidateQueries({ queryKey: ['auth', 'status'] })
      setSaveError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
    onError: (err) => {
      setSaved(false)
      setSaveError(errorMessage(err, 'Settings could not be saved.'))
    },
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage({ ok: true, text: 'Password changed.' })
    },
    onError: (err) =>
      setPasswordMessage({ ok: false, text: errorMessage(err, 'Password could not be changed.') }),
  })

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      setPasswordMessage({ ok: false, text: 'New password must be at least 8 characters.' })
    } else if (newPassword !== confirmPassword) {
      setPasswordMessage({ ok: false, text: 'New password and confirmation do not match.' })
    } else {
      setPasswordMessage(null)
      passwordMutation.mutate()
    }
  }

  // API key
  const [showKey, setShowKey] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const resetKeyMutation = useMutation({
    mutationFn: resetApiKey,
    onSuccess: (key) => {
      qc.setQueryData(['auth', 'settings'], (old: typeof settings) =>
        old ? { ...old, api_key: key } : old
      )
      setKeyError(null)
      setConfirmReset(false)
    },
    onError: (err) => {
      setKeyError(errorMessage(err, 'API key could not be reset.'))
      setConfirmReset(false)
    },
  })

  async function copyApiKey() {
    if (!settings) return
    try {
      await navigator.clipboard.writeText(settings.api_key)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    } catch {
      setKeyError('Clipboard access was denied by the browser.')
    }
  }

  return (
    <div>
      <div className="settings-section-title">General</div>
      <div className="settings-section-desc">Security and logging settings.</div>

      {/* ── Security ── */}
      <div className="settings-section-title" style={{ marginTop: 8 }}>
        Security
      </div>

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 24 }}>
          {mode === 'none' && (
            <div className="alert alert-danger" role="alert">
              <AlertTriangle size={14} />
              <span>
                Authentication is disabled. Anyone who can reach Romarr can view and change
                everything, including the API key and download client credentials.
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-mode">
              Authentication
            </label>
            <select
              id="auth-mode"
              className="form-control"
              value={mode}
              onChange={(e) => setMode(e.target.value as AuthMode)}
              style={{ maxWidth: 240 }}
            >
              <option value="forms">Forms (Login Page)</option>
              <option value="basic">Basic (Browser Popup)</option>
              <option value="none">None</option>
            </select>
            <div className="form-hint">{MODE_HINTS[mode]}</div>
          </div>

          {mode !== 'none' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="auth-required">
                  Authentication Required
                </label>
                <select
                  id="auth-required"
                  className="form-control"
                  value={required}
                  onChange={(e) => setRequired(e.target.value as AuthRequired)}
                  style={{ maxWidth: 320 }}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled_for_local">Disabled for Local Addresses</option>
                </select>
                <div className="form-hint">
                  Local addresses are loopback and private network ranges.
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="auth-username">
                  Username
                </label>
                <input
                  id="auth-username"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  maxLength={64}
                  style={{ maxWidth: 280 }}
                />
              </div>
            </>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="auth-proxies">
              Trusted Proxies
            </label>
            <input
              id="auth-proxies"
              className="form-control"
              value={trustedProxies}
              onChange={(e) => setTrustedProxies(e.target.value)}
              placeholder="172.18.0.2, 10.0.0.0/8"
              autoComplete="off"
              style={{ maxWidth: 420 }}
            />
            <div className="form-hint">
              Comma separated IP addresses or CIDR ranges of reverse proxies. The X-Forwarded-For
              header is honoured only for requests from these addresses; leave empty when Romarr is
              not behind a proxy.
            </div>
          </div>
        </div>

        {saveError && <div className="alert alert-danger">{saveError}</div>}
        {saved && <div className="alert alert-success">Settings saved.</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            Save Changes
          </button>
        </div>
      </form>

      {/* ── Password ── */}
      <div className="settings-section-title">Change Password</div>
      <form onSubmit={handlePasswordSubmit}>
        <div className="card" style={{ marginBottom: 24 }}>
          {passwordMessage && (
            <div className={`alert ${passwordMessage.ok ? 'alert-success' : 'alert-danger'}`}>
              {passwordMessage.text}
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="pw-current">
              Current Password
            </label>
            <input
              id="pw-current"
              className="form-control"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              style={{ maxWidth: 280 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="pw-new">
              New Password
            </label>
            <input
              id="pw-new"
              className="form-control"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              style={{ maxWidth: 280 }}
            />
            <div className="form-hint">
              At least 8 characters. Changing the password signs out all other sessions.
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="pw-confirm">
              Confirm New Password
            </label>
            <input
              id="pw-confirm"
              className="form-control"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              style={{ maxWidth: 280 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword
            }
          >
            Change Password
          </button>
        </div>
      </form>

      {/* ── API key ── */}
      <div className="settings-section-title">API Key</div>
      <div className="card" style={{ marginBottom: 24 }}>
        {keyError && <div className="alert alert-danger">{keyError}</div>}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="api-key">
            API Key
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 520 }}>
            <input
              id="api-key"
              className="form-control"
              type={showKey ? 'text' : 'password'}
              value={settings?.api_key ?? ''}
              readOnly
              autoComplete="off"
              style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowKey((v) => !v)}
              disabled={!settings}
              style={{ flexShrink: 0 }}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={copyApiKey}
              disabled={!settings}
              style={{ flexShrink: 0 }}
            >
              {copiedKey ? <Check size={13} /> : <Copy size={13} />}
              {copiedKey ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmReset(true)}
              disabled={!settings}
              style={{ flexShrink: 0 }}
            >
              <RefreshCw size={13} /> Reset
            </button>
          </div>
          <div className="form-hint">
            Sent in the X-Api-Key header by external applications and scripts to access the Romarr
            API.
          </div>
        </div>
      </div>

      {/* ── Logging ── */}
      <div className="settings-section-title">Logging</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="log-level">
            Log Level
          </label>
          <select
            id="log-level"
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

      {confirmReset && (
        <ConfirmModal
          title="Reset API Key"
          message="A new API key will be generated and the current key stops working immediately. Applications using it must be updated."
          confirmLabel="Reset"
          danger
          onConfirm={() => resetKeyMutation.mutate()}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}
