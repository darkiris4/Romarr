import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, ImageOff, ChevronLeft, Search, Plus } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { igdbApi } from '../../api/igdb'
import type { Platform, IgdbSearchResult } from '../../types'

interface Props {
  platforms: Platform[]
  initialQuery?: string
  onClose: () => void
  onAdded: () => void
}

type Step = 'search' | 'igdb' | 'confirm'

export default function AddGameModal({ platforms, initialQuery = '', onClose, onAdded }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState<Step>(initialQuery ? 'igdb' : 'search')
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [igdbResults, setIgdbResults] = useState<IgdbSearchResult[]>([])
  const [igdbLoading, setIgdbLoading] = useState(false)
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null)
  const [platformId, setPlatformId] = useState(platforms[0]?.id?.toString() ?? '')
  const [region, setRegion] = useState('USA')
  const [monitored, setMonitored] = useState(true)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-search IGDB when opened with a pre-filled query
  useEffect(() => {
    if (initialQuery) searchIgdb()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce library search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Existing library matches
  const { data: existing = [] } = useQuery({
    queryKey: ['games', debouncedQuery],
    queryFn: () => gamesApi.list({ search: debouncedQuery }),
    enabled: debouncedQuery.length > 1,
  })

  async function searchIgdb() {
    if (!query.trim()) return
    setStep('igdb')
    setIgdbLoading(true)
    try {
      const data = await igdbApi.search(query.trim())
      setIgdbResults(data)
    } catch {
      setIgdbResults([])
    } finally {
      setIgdbLoading(false)
    }
  }

  function selectIgdbResult(r: IgdbSearchResult) {
    setSelected(r)
    setStep('confirm')
  }

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
  const trimmed = query.trim()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--add-game" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="modal-header">
          {step !== 'search' && (
            <button
              className="btn-icon"
              style={{ marginRight: 8 }}
              onClick={() => setStep(step === 'confirm' ? 'igdb' : 'search')}
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="modal-title">
            {step === 'search' && 'Add Game'}
            {step === 'igdb' && `IGDB results for "${trimmed}"`}
            {step === 'confirm' && 'Add Game'}
          </span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Step: Search ── */}
        {step === 'search' && (
          <>
            <div className="modal-body">
              <div className="add-game-searchbox">
                <Search size={15} className="add-game-searchbox-icon" />
                <input
                  ref={inputRef}
                  className="add-game-searchbox-input"
                  placeholder="Search for a game…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && trimmed && searchIgdb()}
                  autoFocus
                />
                {query && (
                  <button className="btn-icon" onClick={() => setQuery('')}>
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="add-game-results">
                {/* Existing library section */}
                {existing.length > 0 && (
                  <div className="add-game-section">
                    <div className="add-game-section-label">In your library</div>
                    {existing.slice(0, 5).map(g => (
                      <div
                        key={g.id}
                        className="add-game-result-row"
                        onClick={() => { onClose(); navigate(`/games/${g.id}`) }}
                      >
                        <div className="add-game-result-cover">
                          {g.cover_url
                            ? <img src={g.cover_url} alt={g.title} />
                            : <div className="add-game-result-cover--empty"><ImageOff size={12} /></div>
                          }
                        </div>
                        <div className="add-game-result-info">
                          <span className="add-game-result-title">{g.title}</span>
                          <span className="add-game-result-meta">
                            {g.platform?.name}
                            {g.release_year && ` · ${g.release_year}`}
                          </span>
                        </div>
                        <span className="add-game-result-badge">In Library</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new section */}
                {trimmed && (
                  <div className="add-game-section">
                    <div className="add-game-section-label">Add new</div>
                    <div className="add-game-result-row add-game-result-row--new" onClick={searchIgdb}>
                      <div className="add-game-result-cover add-game-result-cover--new">
                        <Plus size={14} />
                      </div>
                      <div className="add-game-result-info">
                        <span className="add-game-result-title">Search IGDB for "{trimmed}"</span>
                      </div>
                    </div>
                  </div>
                )}

                {!trimmed && (
                  <div className="add-game-results-hint">
                    Start typing to search your library and IGDB.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Step: IGDB results ── */}
        {step === 'igdb' && (
          <>
            <div className="modal-body">
              {igdbLoading && (
                <div className="igdb-results-status"><div className="spinner" /> Searching IGDB…</div>
              )}
              {!igdbLoading && igdbResults.length === 0 && (
                <div className="igdb-results-status">No results found on IGDB.</div>
              )}
              <div className="igdb-results">
                {igdbResults.map(r => (
                  <div key={r.igdb_id} className="igdb-result-row" onClick={() => selectIgdbResult(r)}>
                    <div className="igdb-result-cover">
                      {r.cover_url
                        ? <img src={r.cover_url} alt={r.name} />
                        : <div className="igdb-result-cover--empty"><ImageOff size={16} /></div>
                      }
                    </div>
                    <div className="igdb-result-info">
                      <div className="igdb-result-title">{r.name}</div>
                      {r.release_year && <div className="igdb-result-year">{r.release_year}</div>}
                      {r.summary && <div className="igdb-result-summary">{r.summary}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn btn-secondary"
                disabled={!trimmed || !platformId}
                onClick={() => addMutation.mutate()}
              >
                Add "{trimmed}" manually
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && selected && (
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
              <button className="btn btn-secondary" onClick={() => setStep('igdb')}>Back</button>
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
