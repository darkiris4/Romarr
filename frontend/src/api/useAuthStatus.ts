import { useQuery } from '@tanstack/react-query'
import { getAuthStatus } from './auth'

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth', 'status'],
    queryFn: getAuthStatus,
    staleTime: Infinity,
    retry: false,
  })
}
