import { useState } from 'react'
import { Plus, Trash2, X, MessageSquare, Webhook, Mail, Send, Bell, Rss } from 'lucide-react'

interface Connection {
  id: number
  name: string
  type: string
  onGrab: boolean
  onImport: boolean
  onUpgrade: boolean
  onRename: boolean
  onDelete: boolean
  onHealthIssue: boolean
  onDownloadFailure: boolean
}

const CONNECTION_TYPES = [
  { key: 'discord',   label: 'Discord',   icon: <MessageSquare size={20} />, desc: 'Post notifications to a Discord channel via webhook.' },
  { key: 'slack',     label: 'Slack',     icon: <Rss size={20} />,           desc: 'Post notifications to a Slack channel via incoming webhook.' },
  { key: 'telegram',  label: 'Telegram',  icon: <Send size={20} />,          desc: 'Send notifications via a Telegram bot.' },
  { key: 'webhook',   label: 'Webhook',   icon: <Webhook size={20} />,       desc: 'POST a JSON payload to any custom URL.' },
  { key: 'email',     label: 'Email',     icon: <Mail size={20} />,          desc: 'Send notifications via SMTP email.' },
  { key: 'ntfy',      label: 'Ntfy',      icon: <Bell size={20} />,          desc: 'Push notifications via ntfy.sh or a self-hosted ntfy instance.' },
]

const EVENT_ROWS = [
  { key: 'onGrab',            label: 'On Grab',             hint: 'Fires when Romarr grabs a release from an indexer.' },
  { key: 'onImport',          label: 'On Import',           hint: 'Fires when a download is imported into the library.' },
  { key: 'onUpgrade',         label: 'On Upgrade',          hint: 'Fires when a better version is imported.' },
  { key: 'onRename',          label: 'On Rename',           hint: 'Fires when a ROM file is renamed.' },
  { key: 'onDelete',          label: 'On Delete',           hint: 'Fires when a game or ROM file is removed.' },
  { key: 'onDownloadFailure', label: 'On Download Failure', hint: 'Fires when a download fails.' },
  { key: 'onHealthIssue',     label: 'On Health Issue',     hint: 'Fires when a health check warning or error is detected.' },
] as const

type EventKey = typeof EVENT_ROWS[number]['key']

let nextId = 1

export default function ConnectPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [editConn, setEditConn] = useState<Connection | null>(null)
  const [editType, setEditType] = useState<string | null>(null)

  function openPicker() { setShowPicker(true); setEditConn(null); setEditType(null) }
  function closePicker() { setShowPicker(false) }

  function selectType(typeKey: string) {
    setEditType(typeKey)
    setShowPicker(false)
    setEditConn({
      id: nextId++,
      name: '',
      type: typeKey,
      onGrab: true,
      onImport: true,
      onUpgrade: true,
      onRename: false,
      onDelete: false,
      onHealthIssue: true,
      onDownloadFailure: true,
    })
  }

  function editExisting(conn: Connection) {
    setEditConn({ ...conn })
    setEditType(conn.type)
    setShowPicker(false)
  }

  function saveConn() {
    if (!editConn) return
    setConnections(prev => {
      const exists = prev.find(c => c.id === editConn.id)
      return exists ? prev.map(c => c.id === editConn.id ? editConn : c) : [...prev, editConn]
    })
    setEditConn(null)
    setEditType(null)
  }

  function deleteConn(id: number) {
    setConnections(prev => prev.filter(c => c.id !== id))
    if (editConn?.id === id) { setEditConn(null); setEditType(null) }
  }

  function toggleEvent(key: EventKey) {
    if (!editConn) return
    setEditConn(prev => prev ? { ...prev, [key]: !prev[key as keyof Connection] } : prev)
  }

  return (
    <div>
      <div className="settings-section-title">Connect</div>
      <div className="settings-section-desc">Configure notifications for grab, import, failure, and health events.</div>

      {/* ── Connections list ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={openPicker}>
          <Plus size={14} /> Add Connection
        </button>
      </div>

      {connections.length === 0 && !editConn ? (
        <div className="empty-state" style={{ marginTop: 0, padding: '48px 0' }}>
          <Bell size={40} />
          <p>No connections configured</p>
          <small>Add Discord, Slack, webhooks, or email to get notified about grab and import events.</small>
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
              {connections.map(conn => (
                <tr key={conn.id} style={{ cursor: 'pointer' }} onClick={() => editExisting(conn)}>
                  <td style={{ color: 'var(--text-white)', fontWeight: 500 }}>{conn.name || <em style={{ color: 'var(--text-muted)' }}>Unnamed</em>}</td>
                  <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{conn.type}</td>
                  <td><EventDot active={conn.onGrab} /></td>
                  <td><EventDot active={conn.onImport} /></td>
                  <td><EventDot active={conn.onDownloadFailure} /></td>
                  <td><EventDot active={conn.onHealthIssue} /></td>
                  <td className="col-action" onClick={e => { e.stopPropagation(); deleteConn(conn.id) }}>
                    <button className="btn-icon" title="Remove"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Type picker modal ── */}
      {showPicker && (
        <div className="modal-backdrop" onClick={closePicker}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add Connection</span>
              <button className="modal-close" onClick={closePicker}><X size={18} /></button>
            </div>
            <div style={{ padding: '8px 24px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {CONNECTION_TYPES.map(t => (
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

      {/* ── Edit connection panel ── */}
      {editConn && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title" style={{ textTransform: 'capitalize' }}>{editConn.type} Connection</span>
            <button className="btn-icon" onClick={() => { setEditConn(null); setEditType(null) }}>
              <X size={16} />
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-control"
              placeholder={`My ${editConn.type}`}
              value={editConn.name}
              onChange={e => setEditConn(prev => prev ? { ...prev, name: e.target.value } : prev)}
              style={{ maxWidth: 320 }}
              autoFocus
            />
          </div>

          <ConnTypeFields type={editConn.type} />

          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <div className="settings-section-title" style={{ margin: '0 0 8px' }}>Notification Triggers</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {EVENT_ROWS.map(row => (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-primary)', fontSize: 14, width: '40%' }}>{row.label}</td>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)', fontSize: 12 }}>{row.hint}</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', width: 48 }}>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={!!editConn[row.key as keyof Connection]}
                          onChange={() => toggleEvent(row.key)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => { setEditConn(null); setEditType(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={saveConn}>{connections.find(c => c.id === editConn.id) ? 'Save Changes' : 'Add Connection'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function EventDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8,
      borderRadius: '50%',
      background: active ? 'var(--success)' : 'var(--border)',
    }} />
  )
}

function ConnTypeFields({ type }: { type: string }) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [email, setEmail] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [topic, setTopic] = useState('')
  const [ntfyUrl, setNtfyUrl] = useState('')

  if (type === 'discord' || type === 'slack') return (
    <div className="form-group">
      <label className="form-label">Webhook URL</label>
      <input className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." style={{ maxWidth: 480 }} />
      <div className="form-hint">
        {type === 'discord'
          ? 'In your Discord server: channel settings → Integrations → Webhooks → New Webhook.'
          : 'In Slack: Apps → Incoming Webhooks → Add New Webhook.'}
      </div>
    </div>
  )

  if (type === 'webhook') return (
    <div className="form-group">
      <label className="form-label">URL</label>
      <input className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/hook" style={{ maxWidth: 480 }} />
      <div className="form-hint">Romarr will POST a JSON body to this URL on each enabled event.</div>
    </div>
  )

  if (type === 'telegram') return (
    <>
      <div className="form-group">
        <label className="form-label">Bot Token</label>
        <input className="form-control" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="123456789:AAF..." style={{ maxWidth: 360 }} />
        <div className="form-hint">Create a bot with @BotFather on Telegram and paste the token here.</div>
      </div>
      <div className="form-group">
        <label className="form-label">Chat ID</label>
        <input className="form-control" value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890" style={{ maxWidth: 240 }} />
        <div className="form-hint">Your chat, group, or channel ID. Use @userinfobot to find yours.</div>
      </div>
    </>
  )

  if (type === 'ntfy') return (
    <>
      <div className="form-group">
        <label className="form-label">Server URL</label>
        <input className="form-control" value={ntfyUrl} onChange={e => setNtfyUrl(e.target.value)} placeholder="https://ntfy.sh" style={{ maxWidth: 360 }} />
      </div>
      <div className="form-group">
        <label className="form-label">Topic</label>
        <input className="form-control" value={topic} onChange={e => setTopic(e.target.value)} placeholder="romarr-alerts" style={{ maxWidth: 240 }} />
        <div className="form-hint">The ntfy topic name to publish to. Keep this private to avoid public exposure.</div>
      </div>
    </>
  )

  if (type === 'email') return (
    <>
      <div className="form-group">
        <label className="form-label">From / To Address</label>
        <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alerts@example.com" style={{ maxWidth: 360 }} />
      </div>
      <div className="form-group">
        <label className="form-label">SMTP Server</label>
        <div style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
          <input className="form-control" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.example.com" style={{ flex: 1 }} />
          <input className="form-control" type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} style={{ width: 90 }} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Username</label>
        <input className="form-control" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} style={{ maxWidth: 280 }} />
      </div>
      <div className="form-group">
        <label className="form-label">Password</label>
        <input className="form-control" type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} style={{ maxWidth: 280 }} />
      </div>
    </>
  )

  return null
}
