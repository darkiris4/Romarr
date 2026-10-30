import axios from 'axios'
import { queryClient } from '../queryClient'
import { loginUrl } from '../utils/returnUrl'
import type { AuthStatus } from './auth'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

const AUTH_STATUS_KEY = ['auth', 'status']
const UNGUARDED_PATHS = ['/auth/login', '/auth/setup']

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? ''
      const status = queryClient.getQueryData<AuthStatus>(AUTH_STATUS_KEY)
      const onAuthScreen = ['/login', '/setup'].includes(window.location.pathname)
      if (status?.mode === 'forms' && !UNGUARDED_PATHS.includes(url) && !onAuthScreen) {
        const current = window.location.pathname + window.location.search + window.location.hash
        void queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY })
        window.location.assign(loginUrl(current))
      }
    }
    return Promise.reject(error)
  }
)

export default client
