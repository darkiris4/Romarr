import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { login } from '../../api/auth'
import { safeReturnUrl } from '../../utils/returnUrl'
import AuthCard from './AuthCard'

const FORGOT_PASSWORD_URL = 'https://github.com/darkiris4/Romarr#forgot-your-password'

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const status = await login(username, password, remember)
      queryClient.setQueryData(['auth', 'status'], status)
      navigate(safeReturnUrl(params.get('returnUrl')), { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('Invalid username or password')
      } else {
        setError('Unable to sign in. Try again.')
      }
      setBusy(false)
    }
  }

  return (
    <AuthCard heading="Sign in to continue">
      <form onSubmit={handleSubmit}>
        <input
          className="login-input"
          type="text"
          name="username"
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="login-input"
          type="password"
          name="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="login-options">
          <label className="login-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember Me
          </label>
          <a
            className="login-forgot"
            href={FORGOT_PASSWORD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Forgot your password?
          </a>
        </div>
        <button className="login-button" type="submit" disabled={busy}>
          Login
        </button>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </AuthCard>
  )
}
