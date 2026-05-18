import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  X,
  MessageSquare,
  Webhook,
  Mail,
  Send,
  Bell,
  Rss,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { connectApi } from '../../api/connect'
import type { Connection } from '../../types'

const CONNECTION_TYPES = [
  {
    key: 'discord',
    label: 'Discord',
    icon: <MessageSquare size={20} />,
    desc: 'Post notifications to a Discord channel via webhook.',
  },
  {
    key: 'slack',
    label: 'Slack',
    icon: <Rss size={20} />,
    desc: 'Post notifications to a Slack channel via incoming webhook.',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    icon: <Send size={20} />,
    desc: 'Send notifications via a Telegram bot.',
  },
  {
    key: 'webhook',
    label: 'Webhook',
    icon: <Webhook size={20} />,
    desc: 'POST a JSON payload to any custom URL.',
  },
  {
    key: 'email',
    label: 'Email',
    icon: <Mail size={20} />,
    desc: 'Send notifications via SMTP email.',
  },
  {
    key: 'ntfy',
    label: 'Ntfy',
    icon: <Bell size={20} />,
    desc: 'Push notifications via ntfy.sh or a self-hosted ntfy instance.',
  },
]

const EVENT_ROWS = [
  { key: 'on_grab', label: 'On Grab', hint: 'Fires when Romarr grabs a release from an indexer.' },
  {
    key: 'on_import',
    label: 'On Import',
    hint: 'Fires when a download is imported into the library.',
  },
  { key: 'on_upgrade', label: 'On Upgrade', hint: 'Fires when a better version is imported.' },
  { key: 'on_rename', label: 'On Rename', hint: 'Fires when a ROM file is renamed.' },
  { key: 'on_delete', label: 'On Delete', hint: 'Fires when a game or ROM file is removed.' },
  {
    key: 'on_download_failure',
    label: 'On Download Failure',
    hint: 'Fires when a download fails.',
  },
  {
    key: 'on_health_issue',
    label: 'On Health Issue',
    hint: 'Fires when a health check warning or error is detected.',
  },
] as const

type EventKey = (typeof EVENT_ROWS)[number]['key']
type EditConn = Omit<Connection, 'id' | 'created_at' | 'updated_at'> & { id?: number }

function blankConn(type: string): EditConn {
  return {
    name: '',
    type,
    config: {},
    tags: '',
    on_grab: true,
    on_import: true,
    on_upgrade: true,
    on_rename: false,
    on_delete: false,
    on_health_issue: true,
    on_download_failure: true,
    enabled: true,
  }
}

export default function ConnectPage() {
  const qc = useQueryClient()
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: connectApi.list,
  })

  const [showPicker, setShowPicker] = useState(false)
  const [editConn, setEditConn] = useState<EditConn | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const createMut = useMutation({
    mutationFn: connectApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
      setEditConn(null)
    },
  })
  const updateMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: Omit<Connection, 'id' | 'created_at' | 'updated_at'>
    }) => connectApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
      setEditConn(null)
    },
  })
  const deleteMut = useMutation({
    mutationFn: connectApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })

  function selectType(type: string) {
    setShowPicker(false)
    setEditConn(blankConn(type))
    setTestResult(null)
  }

  function openEdit(conn: Connection) {
    setEditConn({ ...conn })
    setTestResult(null)
  }

  function closeEdit() {
    setEditConn(null)
    setTestResult(null)
  }

  function setConfig(key: string, value: string) {
    setEditConn((prev) => (prev ? { ...prev, config: { ...prev.config, [key]: value } } : prev))
  }

  function toggleEvent(key: EventKey) {
    setEditConn((prev) => (prev ? { ...prev, [key]: !prev[key as keyof EditConn] } : prev))
  }

  function saveConn() {
    if (!editConn) return
    const { id, ...payload } = editConn as Connection
    if (id) {
      updateMut.mutate({ id, payload })
    } else {
      createMut.mutate(payload)
    }
  }

  async function testConn() {
    if (!editConn || !editConn.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await connectApi.test(editConn.id)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div>
      <div className="settings-section-title">Connect</div>
      <div className="settings-section-desc">
        Configure notifications for grab, import, failure, and health events.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowPicker(true)}>
          <Plus size={14} /> Add Connection
        </button>
      </div>

      {connections.length === 0 && !editConn ? (
        <div className="empty-state" style={{ marginTop: 0, padding: '48px 0' }}>
          <Bell size={40} />
          <p>No connections configured</p>
          <small>
            Add Discord, Slack, webhooks, or email to get notified about grab and import events.
          </small>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, marginBottom: 24 }}>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>On Grab</th>
                <th>On Import</th>
                <th>On Failure</th>
                <th>On Health</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {connections.map((conn) => (
                <tr key={conn.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(conn)}>
                  <td style={{ color: 'var(--text-white)', fontWeight: 500 }}>
                    {conn.name || <em style={{ color: 'var(--text-muted)' }}>Unnamed</em>}
                  </td>
                  <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                    {conn.type}
                  </td>
                  <td>
                    <EventDot active={conn.on_grab} />
                  </td>
                  <td>
                    <EventDot active={conn.on_import} />
                  </td>
                  <td>
                    <EventDot active={conn.on_download_failure} />
                  </td>
                  <td>
                    <EventDot active={conn.on_health_issue} />
                  </td>
                  <td
                    className="col-action"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteMut.mutate(conn.id)
                      if (editConn && (editConn as Connection).id === conn.id) closeEdit()
                    }}
                  >
                    <button className="btn-icon" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Type picker modal */}
      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Connection</span>
              <button className="modal-close" onClick={() => setShowPicker(false)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '8px 24px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {CONNECTION_TYPES.map((t) => (
                  <button
                    key={t.key}
                    className="connect-type-card"
                    onClick={() => selectType(t.key)}
                  >
                    <span className="connect-type-icon">{t.icon}</span>
                    <div>
                      <div className="connect-type-label">{t.label}</div>
                      <div className="connect-type-desc">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit panel */}
      {editConn && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title" style={{ textTransform: 'capitalize' }}>
              {editConn.type} Connection
            </span>
            <button className="btn-icon" onClick={closeEdit}>
              <X size={16} />
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-control"
              placeholder={`My ${editConn.type}`}
              value={editConn.name}
              onChange={(e) =>
                setEditConn((prev) => (prev ? { ...prev, name: e.target.value } : prev))
              }
              style={{ maxWidth: 320 }}
              autoFocus
            />
          </div>

          <ConnTypeFields type={editConn.type} config={editConn.config} setConfig={setConfig} />

          <div className="form-group">
            <label className="form-label">Tags</label>
            <input
              className="form-control"
              placeholder="e.g. nintendo, sega (comma-separated)"
              value={editConn.tags}
              onChange={(e) =>
                setEditConn((prev) => (prev ? { ...prev, tags: e.target.value } : prev))
              }
              style={{ maxWidth: 360 }}
            />
            <div className="form-hint">
              Only fire this connection if the game has a matching tag. Leave empty to fire for all
              games.
            </div>
          </div>

          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <div className="settings-section-title" style={{ margin: '0 0 4px' }}>
              Notification Triggers
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Click to toggle. Filled = enabled.
            </div>
            <div className="connect-triggers-grid">
              {EVENT_ROWS.map((row) => (
                <button
                  key={row.key}
                  className={`connect-trigger-pill${editConn[row.key as keyof EditConn] ? ' active' : ''}`}
                  onClick={() => toggleEvent(row.key)}
                  title={row.hint}
                  type="button"
                >
                  {row.label}
                </button>
              ))}
            </div>
          </div>

          {testResult && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 6,
                background: testResult.success ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                color: testResult.success ? 'var(--success)' : 'var(--danger)',
                fontSize: 13,
              }}
            >
              {testResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {testResult.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={closeEdit}>
              Cancel
            </button>
            {(editConn as Connection).id && (
              <button className="btn btn-secondary" onClick={testConn} disabled={testing}>
                {testing ? 'Testing…' : 'Test'}
              </button>
            )}
            <button className="btn btn-primary" onClick={saveConn} disabled={saving}>
              {saving ? 'Saving…' : (editConn as Connection).id ? 'Save Changes' : 'Add Connection'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EventDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: active ? 'var(--success)' : 'var(--border)',
      }}
    />
  )
}

interface ConnTypeFieldsProps {
  type: string
  config: Record<string, string>
  setConfig: (key: string, value: string) => void
}

function ConnTypeFields({ type, config, setConfig }: ConnTypeFieldsProps) {
  if (type === 'discord' || type === 'slack')
    return (
      <div className="form-group">
        <label className="form-label">Webhook URL</label>
        <input
          className="form-control"
          value={config.url ?? ''}
          onChange={(e) => setConfig('url', e.target.value)}
          placeholder={
            type === 'discord'
              ? 'https://discord.com/api/webhooks/...'
              : 'https://hooks.slack.com/services/...'
          }
          style={{ maxWidth: 480 }}
        />
        <div className="form-hint">
          {type === 'discord'
            ? 'In your Discord server: channel settings → Integrations → Webhooks → New Webhook.'
            : 'In Slack: Apps → Incoming Webhooks → Add New Webhook.'}
        </div>
      </div>
    )

  if (type === 'webhook')
    return (
      <div className="form-group">
        <label className="form-label">URL</label>
        <input
          className="form-control"
          value={config.url ?? ''}
          onChange={(e) => setConfig('url', e.target.value)}
          placeholder="https://example.com/hook"
          style={{ maxWidth: 480 }}
        />
        <div className="form-hint">
          Romarr will POST a JSON body to this URL on each enabled event.
        </div>
      </div>
    )

  if (type === 'telegram')
    return (
      <>
        <div className="form-group">
          <label className="form-label">Bot Token</label>
          <input
            className="form-control"
            type="password"
            value={config.token ?? ''}
            onChange={(e) => setConfig('token', e.target.value)}
            placeholder="123456789:AAF..."
            style={{ maxWidth: 360 }}
          />
          <div className="form-hint">
            Create a bot with @BotFather on Telegram and paste the token here.
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Chat ID</label>
          <input
            className="form-control"
            value={config.chat_id ?? ''}
            onChange={(e) => setConfig('chat_id', e.target.value)}
            placeholder="-1001234567890"
            style={{ maxWidth: 240 }}
          />
          <div className="form-hint">
            Your chat, group, or channel ID. Use @userinfobot to find yours.
          </div>
        </div>
      </>
    )

  if (type === 'ntfy')
    return (
      <>
        <div className="form-group">
          <label className="form-label">Server URL</label>
          <input
            className="form-control"
            value={config.url ?? ''}
            onChange={(e) => setConfig('url', e.target.value)}
            placeholder="https://ntfy.sh"
            style={{ maxWidth: 360 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Topic</label>
          <input
            className="form-control"
            value={config.topic ?? ''}
            onChange={(e) => setConfig('topic', e.target.value)}
            placeholder="romarr-alerts"
            style={{ maxWidth: 240 }}
          />
          <div className="form-hint">
            The ntfy topic name to publish to. Keep this private to avoid public exposure.
          </div>
        </div>
      </>
    )

  if (type === 'email')
    return (
      <>
        <div className="form-group">
          <label className="form-label">From / To Address</label>
          <input
            className="form-control"
            type="email"
            value={config.from_to ?? ''}
            onChange={(e) => setConfig('from_to', e.target.value)}
            placeholder="alerts@example.com"
            style={{ maxWidth: 360 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">SMTP Server</label>
          <div style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
            <input
              className="form-control"
              value={config.smtp_host ?? ''}
              onChange={(e) => setConfig('smtp_host', e.target.value)}
              placeholder="smtp.example.com"
              style={{ flex: 1 }}
            />
            <input
              className="form-control"
              type="number"
              value={config.smtp_port ?? '587'}
              onChange={(e) => setConfig('smtp_port', e.target.value)}
              style={{ width: 90 }}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input
            className="form-control"
            value={config.smtp_user ?? ''}
            onChange={(e) => setConfig('smtp_user', e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-control"
            type="password"
            value={config.smtp_pass ?? ''}
            onChange={(e) => setConfig('smtp_pass', e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>
      </>
    )

  return null
}
