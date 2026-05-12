import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../../api/system'
import { format } from 'date-fns'

export default function SystemStatus() {
  const { data, isLoading } = useQuery({ queryKey: ['system-status'], queryFn: systemApi.status })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>
  if (!data) return null

  const rows = [
    ['Version', data.version],
    ['Start Time', format(new Date(data.startupTime), 'MMM d, yyyy HH:mm:ss')],
    ['OS', `${data.osName} ${data.osVersion}`],
    ['Python', data.runtimeVersion?.split(' ')[0] ?? '—'],
    ['SQLite', data.sqliteVersion],
  ]

  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 16 }}>System Status</div>
      <div className="card" style={{ maxWidth: 600 }}>
        {rows.map(([label, value]) => (
          <div key={label} className="toggle-row">
            <span className="text-muted" style={{ minWidth: 160 }}>{label}</span>
            <span style={{ color: 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
