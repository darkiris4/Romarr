import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Download, ExternalLink, ChevronUp, ChevronDown, Search } from 'lucide-react'
import { gamesApi } from '../../api/games'
import type { ReleaseResult } from '../../types'

interface Props {
  gameId: number
  gameTitle: string
  onClose: () => void
}

type SortKey = 'seeders' | 'size' | 'title' | 'indexer' | 'age'
type SortDir = 'asc' | 'desc'

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / 1024 ** 2
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function formatAge(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return '1d'
  if (days < 365) return `${days}d`
  return `${Math.floor(days / 365)}y`
}

export default function ManualSearchModal({ gameId, gameTitle, onClose }: Props) {
  const qc = useQueryClient()
  const [sort, setSort] = useState<SortKey>('seeders')
  const [dir, setDir] = useState<SortDir>('desc')
  const [grabbedId, setGrabbedId] = useState<string | null>(null)
  const [queryInput, setQueryInput] = useState('')
  const [activeQuery, setActiveQuery] = useState<string | undefined>(undefined)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', gameId, activeQuery],
    queryFn: () => gamesApi.search(gameId, activeQuery),
    staleTime: 0,
  })

  const grab = useMutation({
    mutationFn: (r: ReleaseResult) =>
      gamesApi.grab(gameId, {
        link: r.link,
        title: r.title,
        size: r.size,
        protocol: r.protocol,
        indexer: r.indexer,
        indexer_id: r.indexer_id,
        seeders: r.seeders,
      }),
    onSuccess: (_, r) => {
      setGrabbedId(r.link)
      qc.invalidateQueries({ queryKey: ['game', gameId] })
      qc.invalidateQueries({ queryKey: ['queue'] })
    },
  })

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDir('desc')
    }
  }

  const results = data?.results ?? []
  const searchErrors = data?.errors ?? []

  // Once the first response arrives, populate the query input with what the backend used
  if (data?.query && !queryInput) setQueryInput(data.query)

  function triggerSearch() {
    setActiveQuery(queryInput || undefined)
  }
  const sorted = [...results].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (sort) {
      case 'seeders':
        av = a.seeders ?? -1
        bv = b.seeders ?? -1
        break
      case 'size':
        av = a.size
        bv = b.size
        break
      case 'age':
        av = a.publish_date ?? ''
        bv = b.publish_date ?? ''
        break
      case 'indexer':
        av = a.indexer
        bv = b.indexer
        break
      default:
        av = a.title
        bv = b.title
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })

  function SortIcon({ col }: { col: SortKey }) {
    if (sort !== col) return null
    return dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Manual Search — {gameTitle}</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-search-bar">
          <input
            className="form-control"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && triggerSearch()}
            placeholder="Search query…"
          />
          <button className="btn btn-primary" onClick={triggerSearch} disabled={isLoading}>
            <Search size={13} /> Search
          </button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          {isLoading && (
            <div className="search-modal-status">
              <div className="spinner" /> Searching indexers…
            </div>
          )}
          {isError && (
            <div className="search-modal-status" style={{ color: 'var(--danger)' }}>
              Search request failed — check the backend logs for details.
            </div>
          )}
          {!isLoading && !isError && results.length === 0 && searchErrors.length === 0 && (
            <div className="search-modal-status">No releases found.</div>
          )}
          {!isLoading && !isError && searchErrors.length > 0 && results.length === 0 && (
            <div className="search-modal-status" style={{ color: 'var(--danger)' }}>
              {searchErrors.map((e, i) => (
                <div key={i}>
                  <strong>{e.indexer}:</strong> {e.error}
                </div>
              ))}
            </div>
          )}
          {sorted.length > 0 && (
            <div className="table-wrap">
              <table className="release-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => toggleSort('title')}>
                      Release <SortIcon col="title" />
                    </th>
                    <th className="sortable" onClick={() => toggleSort('indexer')}>
                      Indexer <SortIcon col="indexer" />
                    </th>
                    <th>Protocol</th>
                    <th className="sortable col-right" onClick={() => toggleSort('size')}>
                      Size <SortIcon col="size" />
                    </th>
                    <th className="sortable col-right" onClick={() => toggleSort('seeders')}>
                      Peers <SortIcon col="seeders" />
                    </th>
                    <th className="sortable col-right" onClick={() => toggleSort('age')}>
                      Age <SortIcon col="age" />
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const isGrabbed = grabbedId === r.link
                    return (
                      <tr key={i} className={isGrabbed ? 'row-grabbed' : undefined}>
                        <td className="release-title" title={r.title}>
                          {r.title}
                          {r.link && (
                            <a
                              href={r.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="release-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </td>
                        <td className="text-muted">{r.indexer}</td>
                        <td>
                          <span className={`protocol-badge protocol-badge--${r.protocol}`}>
                            {r.protocol}
                          </span>
                        </td>
                        <td className="col-right text-muted">{formatBytes(r.size)}</td>
                        <td className="col-right">
                          {r.seeders != null ? (
                            <span className={r.seeders > 0 ? 'text-success' : 'text-muted'}>
                              {r.seeders}
                            </span>
                          ) : (
                            '—'
                          )}
                          {r.leechers != null && (
                            <span className="text-muted"> / {r.leechers}</span>
                          )}
                        </td>
                        <td className="col-right text-muted">{formatAge(r.publish_date)}</td>
                        <td className="col-action">
                          {isGrabbed ? (
                            <span className="text-success" style={{ fontSize: 12 }}>
                              Grabbed!
                            </span>
                          ) : (
                            <button
                              className="btn btn-primary btn--sm"
                              onClick={() => grab.mutate(r)}
                              disabled={grab.isPending}
                            >
                              <Download size={12} /> Grab
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {results.length > 0 && `${results.length} release${results.length !== 1 ? 's' : ''} found`}
            {searchErrors.length > 0 && results.length > 0 && (
              <span style={{ color: 'var(--danger)', marginLeft: 8 }}>
                {searchErrors.length} indexer{searchErrors.length !== 1 ? 's' : ''} failed
              </span>
            )}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
