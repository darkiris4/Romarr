import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { systemApi } from '../../api/system'

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  const gib = bytes / 1024 ** 3
  if (gib >= 1024) return `${(bytes / 1024 ** 4).toFixed(1)} TiB`
  if (gib >= 1) return `${gib.toFixed(1)} GiB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="toggle-row">
      <span className="text-muted" style={{ minWidth: 180 }}>
        {label}
      </span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>
        {value}
      </span>
    </div>
  )
}

export default function SystemStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: systemApi.status,
    refetchInterval: 30_000,
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )
  if (!data) return null

  const { health, disk, about } = data
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <Section title="Health">
        <div className="card" style={{ padding: '12px 16px' }}>
          {health.length === 0 ? (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--success)' }}
            >
              <CheckCircle size={18} />
              <span>No issues with your configuration</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {health.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    color: 'var(--warning, #f5a623)',
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {issue.message}{' '}
                    <button
                      onClick={() => navigate(issue.path)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontSize: 13,
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Fix
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Disk Space">
        <div className="card" style={{ padding: 0 }}>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Free Space</th>
                <th>Total Space</th>
              </tr>
            </thead>
            <tbody>
              {disk.map((d) => (
                <tr key={d.path}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.path}</td>
                  <td className="text-muted">{formatBytes(d.free)}</td>
                  <td className="text-muted">{formatBytes(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="About">
        <div className="card" style={{ maxWidth: 640 }}>
          <InfoRow label="Version" value={about.version} />
          <InfoRow label="Branch" value={about.branch} />
          <InfoRow label="Python" value={about.python} />
          <InfoRow label="Docker" value={about.docker ? 'Yes' : 'No'} />
          <InfoRow label="Database" value={`SQLite ${about.sqliteVersion}`} />
          <InfoRow label="OS" value={about.os} />
          <InfoRow label="AppData Directory" value={about.appDataDirectory} />
          <InfoRow label="Startup Directory" value={about.startupDirectory} />
          <InfoRow label="Uptime" value={formatUptime(about.uptimeSeconds)} />
        </div>
      </Section>

      <Section title="More Info">
        <div className="card" style={{ maxWidth: 640 }}>
          {[
            ['GitHub', 'github.com/darkiris4/Romarr'],
            ['Issues / Feature Requests', 'github.com/darkiris4/Romarr/issues'],
          ].map(([label, url]) => (
            <div key={label} className="toggle-row">
              <span className="text-muted" style={{ minWidth: 180 }}>
                {label}
              </span>
              <a
                href={`https://${url}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', fontSize: 13, fontFamily: 'monospace' }}
              >
                {url}
              </a>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
