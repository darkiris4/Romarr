import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Download, ExternalLink, ChevronUp, ChevronDown, Clock } from 'lucide-react'
import { gamesApi } from '../../api/games'
import type { ReleaseResult } from '../../types'

interface Props {
  gameId: number
  gameTitle: string
  onClose: () => void
}

type SortKey = 'protocol' | 'age' | 'title' | 'indexer' | 'history' | 'size' | 'seeders' | 'region'
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

function parseRegion(title: string): string {
  const m = title.match(/\(([^)]+)\)/)
  return m ? m[1] : '—'
}

export default function ManualSearchModal({ gameId, gameTitle, onClose }: Props) {
  const qc = useQueryClient()
  const [sort, setSort] = useState<SortKey>('seeders')
  const [dir, setDir] = useState<SortDir>('desc')
  const [grabbedId, setGrabbedId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', gameId],
    queryFn: () => gamesApi.search(gameId),
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
      qc.invalidateQueries({ queryKey: ['search', gameId] })
    },
  })

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDir(key === 'age' ? 'asc' : 'desc')
    }
  }

  const results = data?.results ?? []
  const searchErrors = data?.errors ?? []

  const sorted = [...results].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (sort) {
      case 'seeders':
        av = a.seeders ?? -1; bv = b.seeders ?? -1; break
      case 'size':
        av = a.size; bv = b.size; break
      case 'age':
        av = a.publish_date ?? ''; bv = b.publish_date ?? ''; break
      case 'indexer':
        av = a.indexer; bv = b.indexer; break
      case 'protocol':
        av = a.protocol; bv = b.protocol; break
      case 'history':
        av = a.grabbed_at ?? ''; bv = b.grabbed_at ?? ''; break
      case 'region':
        av = parseRegion(a.title); bv = parseRegion(b.title); break
      default:
        av = a.title; bv = b.title
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })

  function Th({
    col,
    children,
    right,
  }: {
    col: SortKey
    children: React.ReactNode
    right?: boolean
  }) {
    return (
      <th
        className={`sortable${right ? ' col-right' : ''}`}
        onClick={() => toggleSort(col)}
      >
        {children}
        {sort === col && (
          dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
        )}
      </th>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Manual Search — {gameTitle}</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: 0, overflowX: 'auto' }}>
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
                <div key={i}><strong>{e.indexer}:</strong> {e.error}</div>
              ))}
            </div>
          )}
          {sorted.length > 0 && (
            <table className="release-table">
              <thead>
                <tr>
                  <Th col="protocol">Source</Th>
                  <Th col="age" right>Age</Th>
                  <Th col="title">Title</Th>
                  <Th col="indexer">Indexer</Th>
                  <Th col="history">History</Th>
                  <Th col="size" right>Size</Th>
                  <Th col="seeders" right>Peers</Th>
                  <Th col="region">Region</Th>
                  <th>Rejections</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const isGrabbed = grabbedId === r.link
                  const region = parseRegion(r.title)
                  const rejected = r.rejections.length > 0

                  return (
                    <tr
                      key={i}
                      className={[
                        isGrabbed ? 'row-grabbed' : '',
                        rejected ? 'row-rejected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td>
                        <span className={`protocol-badge protocol-badge--${r.protocol}`}>
                          {r.protocol === 'torznab' ? 'TOR' : 'NZB'}
                        </span>
                      </td>
                      <td className="col-right text-muted release-age">{formatAge(r.publish_date)}</td>
                      <td className="release-title" title={r.title}>
                        <span className="release-title-text">{r.title}</span>
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
                      <td className="text-muted release-indexer">{r.indexer}</td>
                      <td className="release-history">
                        {r.grabbed_at ? (
                          <span className="history-grabbed" title={new Date(r.grabbed_at).toLocaleString()}>
                            <Clock size={11} /> {formatAge(r.grabbed_at)} ago
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="col-right text-muted">{formatBytes(r.size)}</td>
                      <td className="col-right">
                        {r.seeders != null ? (
                          <span className={r.seeders > 0 ? 'text-success' : 'text-muted'}>
                            {r.seeders}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {r.leechers != null && (
                          <span className="text-muted"> / {r.leechers}</span>
                        )}
                      </td>
                      <td className="text-muted release-region">{region}</td>
                      <td>
                        {rejected ? (
                          <span className="rejection-badge" title={r.rejections.join(', ')}>
                            {r.rejections[0]}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="col-action">
                        {isGrabbed ? (
                          <span className="text-success" style={{ fontSize: 12 }}>Grabbed!</span>
                        ) : (
                          <button
                            className="btn btn-primary btn--sm"
                            onClick={() => grab.mutate(r)}
                            disabled={grab.isPending || rejected}
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
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
