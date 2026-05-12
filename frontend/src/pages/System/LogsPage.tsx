import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../../api/system'
import { FileText } from 'lucide-react'

export default function LogsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['logs'], queryFn: () => systemApi.logs(200) })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>

  const records: any[] = data?.records ?? []

  if (records.length === 0) {
    return (
      <div className="empty-state">
        <FileText size={40} />
        <p>No log entries</p>
        <small>Structured log output will appear here.</small>
      </div>
    )
  }

  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 16 }}>Logs</div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Logger</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="text-muted text-sm">{r.time ?? '—'}</td>
                  <td className="text-muted text-sm">{r.level ?? '—'}</td>
                  <td className="text-muted text-sm">{r.logger ?? '—'}</td>
                  <td>{r.message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
