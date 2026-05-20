import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { systemApi } from '../../api/system'

export default function HealthBanner() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['system-status-banner'],
    queryFn: systemApi.status,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const issues = data?.health ?? []
  if (issues.length === 0) return null

  return (
    <div className="health-banner">
      {issues.map((issue, i) => (
        <div key={i} className="health-banner-row">
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{issue.message}</span>
          <button className="health-banner-fix" onClick={() => navigate(issue.path)}>
            Fix
          </button>
        </div>
      ))}
    </div>
  )
}
