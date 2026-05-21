import client from './client'
import type { RawgSearchResult } from '../types'

export const rawgApi = {
  search: (q: string) =>
    client.get<RawgSearchResult[]>('/rawg/search', { params: { q } }).then((r) => r.data),
}
