import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ImageOff, ChevronLeft, Search } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { igdbApi } from '../../api/igdb'
import type { Platform, IgdbSearchResult } from '../../types'

interface Props {
  platforms: Platform[]
  onClose: () => void
  onAdded: () => void
}

export default function AddGameModal({ platforms, onClose, onAdded }: Props) {
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [platformId, setPlatformId] = useState(platforms[0]?.id?.toString() ?? '')
  const [results, setResults] = useState<IgdbSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null)
  const [region, setRegion] = useState('USA')
  const [monitored, setMonitored] = useState(true)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await igdbApi.search(query.trim())
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const addMutation = useMutation({
    mutationFn: () => {
      const plat = parseInt(platformId)
      if (selected) {
        return gamesApi.create({
          title: selected.name,
          platform_id: plat,
          region,
          monitored,
          igdb_id: selected.igdb_id,
          cover_url: selected.cover_url,
          release_year: selected.release_year,
        })
      }
      return gamesApi.create({ title: query.trim(), platform_id: plat, region, monitored })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      onAdded()
    },
    onError: () => setError('Failed to add game.'),
  })

  const enabledPlatforms = platforms.filter(p => p.enabled)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--add-game" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          {selected && (
            <button className="btn-icon" style={{ marginRight: 8 }} onClick={() => setSelected(null)}>
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="modal-title">{selected ? 'Add Game' : 'Search IGDB'}</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Step 1: IGDB Search ── */}
        {!selected && (
          <>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="add-game-search-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Search</label>
                  <div className="search-input-wrap">
                    <Search size={14} className="search-input-icon" />
                    <input
                      className="form-control search-input-padded"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="e.g. Chrono Trigger"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="form-group" style={{ width: 180 }}>
                  <label className="form-label">Platform</label>
                  <select
                    className="form-control"
                    value={platformId}
                    onChange={e => setPlatformId(e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {enabledPlatforms.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="igdb-results">
                {searching && (
                  <div className="igdb-results-status">
                    <div className="spinner" /> Searching IGDB…
                  </div>
                )}
                {!searching && query && results.length === 0 && (
                  <div className="igdb-results-status">No results found.</div>
                )}
                {!searching && results.map(r => (
                  <div key={r.igdb_id} className="igdb-result-row" onClick={() => setSelected(r)}>
                    <div className="igdb-result-cover">
                      {r.cover_url
                        ? <img src={r.cover_url} alt={r.name} />
                        : <div className="igdb-result-cover--empty"><ImageOff size={16} /></div>
                      }
                    </div>
                    <div className="igdb-result-info">
                      <div className="igdb-result-title">{r.name}</div>
                      {r.release_year && (
                        <div className="igdb-result-year">{r.release_year}</div>
                      )}
                      {r.summary && (
                        <div className="igdb-result-summary">{r.summary}</div>
                      )}
                    </div>
                  </div>
                ))}
                {!query && (
                  <div className="igdb-results-hint">
                    Type a game title to search IGDB, or add manually using the form below.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn btn-secondary"
                disabled={!query.trim() || !platformId}
                onClick={() => addMutation.mutate()}
              >
                Add manually without IGDB
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Step 2: Confirm ── */}
        {selected && (
          <>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="add-game-confirm">
                <div className="add-game-confirm-cover">
                  {selected.cover_url
                    ? <img src={selected.cover_url} alt={selected.name} />
                    : <div className="igdb-result-cover--empty"><ImageOff size={24} /></div>
                  }
                </div>
                <div className="add-game-confirm-info">
                  <div className="add-game-confirm-title">{selected.name}</div>
                  {selected.release_year && (
                    <div className="add-game-confirm-year">{selected.release_year}</div>
                  )}
                  {selected.summary && (
                    <p className="add-game-confirm-summary">{selected.summary}</p>
                  )}
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 20 }}>
                <div className="form-group">
                  <label className="form-label">Platform</label>
                  <select
                    className="form-control"
                    value={platformId}
                    onChange={e => setPlatformId(e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {enabledPlatforms.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Region</label>
                  <select className="form-control" value={region} onChange={e => setRegion(e.target.value)}>
                    <option>USA</option>
                    <option>Europe</option>
                    <option>Japan</option>
                    <option>World</option>
                    <option>USA, Europe</option>
                    <option>USA, Japan</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={monitored}
                    onChange={e => setMonitored(e.target.checked)}
                  />
                  <span style={{ marginLeft: 8 }}>Monitored</span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Back</button>
              <button
                className="btn btn-primary"
                disabled={!platformId || addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                {addMutation.isPending ? 'Adding…' : `Add ${selected.name}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
