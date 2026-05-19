import client from './client'
import type { IgdbSearchResult } from '../types'

export const igdbApi = {
  search: (q: string) =>
    client.get<IgdbSearchResult[]>('/igdb/search', { params: { q } }).then((r) => r.data),
  collection: (collectionId: number) =>
    client.get<IgdbSearchResult[]>(`/igdb/collection/${collectionId}`).then((r) => r.data),
}
