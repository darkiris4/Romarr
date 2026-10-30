import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { setupAuth } from '../../api/auth'
import AuthCard from './AuthCard'

const MIN_PASSWORD_LENGTH = 8

export default function SetupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const name = username.trim()
    if (!name || name.length > 64) {
      setError('Username must be between 1 and 64 characters')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const status = await setupAuth(name, password)
      queryClient.setQueryData(['auth', 'status'], status)
      navigate('/', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['auth', 'status'] })
        navigate('/login', { replace: true })
        return
      }
      setError('Unable to create the account. Try again.')
      setBusy(false)
    }
  }

  return (
    <AuthCard heading="Create your admin account">
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
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="login-input"
          type="password"
          name="new-password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="login-input"
          type="password"
          name="confirm-password"
          placeholder="Confirm password"
          aria-label="Confirm password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button className="login-button" type="submit" disabled={busy}>
          Create account
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
