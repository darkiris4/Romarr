import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStatus } from '../api/useAuthStatus'
import { loginUrl, safeReturnUrl } from '../utils/returnUrl'
import LoadingScreen from './LoadingScreen'

// Wraps the application routes; unauthenticated visitors are sent to the
// setup or login screens before any protected page renders.
export function AuthGate() {
  const { data: status, isError } = useAuthStatus()
  const location = useLocation()

  if (isError) {
    return (
      <div className="loading-page">
        <span style={{ color: 'var(--text-muted)' }}>Unable to reach the server.</span>
      </div>
    )
  }
  if (!status) return <LoadingScreen />

  if (status.setup_required && status.mode !== 'none') return <Navigate to="/setup" replace />
  if (status.mode === 'forms' && !status.authenticated) {
    return <Navigate to={loginUrl(location.pathname + location.search + location.hash)} replace />
  }
  return <Outlet />
}

// Wraps the login and setup routes so they are only reachable when needed.
export function GuestGate({ kind }: { kind: 'login' | 'setup' }) {
  const { data: status, isError } = useAuthStatus()
  const [params] = useSearchParams()

  if (isError) return <Outlet />
  if (!status) return <LoadingScreen />

  if (kind === 'setup') {
    return status.setup_required ? <Outlet /> : <Navigate to="/" replace />
  }
  if (status.setup_required && status.mode !== 'none') return <Navigate to="/setup" replace />
  if (status.mode !== 'forms' || status.authenticated) {
    return <Navigate to={safeReturnUrl(params.get('returnUrl'))} replace />
  }
  return <Outlet />
}
