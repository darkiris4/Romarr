import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, ImageOff, ChevronLeft } from 'lucide-react'
import { igdbApi } from '../../api/igdb'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import type { IgdbSearchResult } from '../../types'

type Step = 'search' | 'confirm'

function ratingClass(score: number) {
  if (score >= 75) return 'detail-rating-badge--good'
  if (score >= 50) return 'detail-rating-badge--ok'
  return 'detail-rating-badge--bad'
}

export default function AddNewPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const initialQ = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQ)
  const [step, setStep] = useState<Step>('search')
  const [results, setResults] = useState<IgdbSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<IgdbSearchResult | null>(null)
  const [platformId, setPlatformId] = useState('')
  const [region, setRegion] = useState('USA')
  const [monitored, setMonitored] = useState(true)
  const [error, setError] = useState('')

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  })

  const { data: libraryGames = [] } = useQuery({
    queryKey: ['games'],
    queryFn: () => gamesApi.list({}),
  })

  const enabledPlatforms = platforms.filter((p) => p.enabled)

  // Map igdb_id → set of platform_ids already in the library
  const libraryByIgdb = new Map<number, number[]>()
  for (const g of libraryGames) {
    if (g.igdb_id == null) continue
    const existing = libraryByIgdb.get(g.igdb_id) ?? []
    existing.push(g.platform_id)
    libraryByIgdb.set(g.igdb_id, existing)
  }

  // Platforms that match the selected IGDB game; falls back to all enabled.
  const igdbMatchedPlatforms = selected?.platform_ids?.length
    ? enabledPlatforms.filter(
        (p) => p.igdb_platform_id != null && selected.platform_ids.includes(p.igdb_platform_id!)
      )
    : enabledPlatforms
  const basePlatforms = igdbMatchedPlatforms.length > 0 ? igdbMatchedPlatforms : enabledPlatforms

  // Exclude platforms where this game is already in the library.
  const ownedPlatformIds = selected ? (libraryByIgdb.get(selected.igdb_id) ?? []) : []
  const displayPlatforms = basePlatforms.filter((p) => !ownedPlatformIds.includes(p.id))

  useEffect(() => {
    if (enabledPlatforms.length && !platformId) {
      setPlatformId(enabledPlatforms[0].id.toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledPlatforms.length])

  // Auto-select first matching platform when a game is selected
  useEffect(() => {
    if (selected && displayPlatforms.length > 0) {
      setPlatformId(displayPlatforms[0].id.toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.igdb_id])

  useEffect(() => {
    if (initialQ) handleSearch(initialQ)
    else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = useCallback(
    async (q = query) => {
      const trimmed = q.trim()
      if (!trimmed) {
        setResults([])
        setSearched(false)
        return
      }
      setLoading(true)
      setSearched(true)
      setStep('search')
      setSelected(null)
      try {
        const data = await igdbApi.search(trimmed)
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [query]
  )

  // Debounced search as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(query), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const addMutation = useMutation({
    mutationFn: () => {
      const plat = parseInt(platformId)
      return gamesApi.create({
        title: selected!.name,
        platform_id: plat,
        region,
        monitored,
        igdb_id: selected!.igdb_id,
        cover_url: selected!.cover_url,
        release_year: selected!.release_year,
      })
    },
    onSuccess: (game) => {
      qc.invalidateQueries({ queryKey: ['games'] })
      navigate(`/games/${game.id}`)
    },
    onError: () => setError('Failed to add game.'),
  })

  return (
    <div className="add-new-page">
      {/* Search bar */}
      <div className="add-new-search-wrap">
        <div className="add-new-searchbox">
          <Search size={16} className="add-new-searchbox-icon" />
          <input
            ref={inputRef}
            className="add-new-searchbox-input"
            placeholder="Search for a game…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {step === 'search' && !searched && (
          <p className="add-new-hint">
            It's easy to add a new game, just start typing the name of the game you want to add. You
            can also search using the IGDB ID of a game.
          </p>
        )}
      </div>

      {/* Results */}
      {step === 'search' && searched && !loading && (
        <>
          {results.length === 0 ? (
            <div className="add-new-no-results">No results found on IGDB.</div>
          ) : (
            <div className="igdb-results igdb-results--page">
              {results.map((r) => {
                const ownedIds = libraryByIgdb.get(r.igdb_id) ?? []
                const ownedGames = libraryGames.filter(
                  (g) => g.igdb_id === r.igdb_id && ownedIds.includes(g.platform_id)
                )
                // IGDB-matched platforms that haven't been added yet
                const availableCount = (
                  r.platform_ids?.length
                    ? enabledPlatforms.filter(
                        (p) =>
                          p.igdb_platform_id != null &&
                          r.platform_ids.includes(p.igdb_platform_id!) &&
                          !ownedIds.includes(p.id)
                      )
                    : enabledPlatforms.filter((p) => !ownedIds.includes(p.id))
                ).length
                const fullyOwned = ownedIds.length > 0 && availableCount === 0

                return (
                  <div
                    key={r.igdb_id}
                    className={`igdb-result-row${fullyOwned ? ' igdb-result-row--in-library' : ''}`}
                    onClick={() =>
                      fullyOwned && ownedGames[0]
                        ? navigate(`/games/${ownedGames[0].id}`)
                        : (setSelected(r), setStep('confirm'), setError(''))
                    }
                  >
                    <div className="igdb-result-cover">
                      {r.cover_url ? (
                        <img src={r.cover_url} alt={r.name} />
                      ) : (
                        <div className="igdb-result-cover--empty">
                          <ImageOff size={16} />
                        </div>
                      )}
                    </div>
                    <div className="igdb-result-info">
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}
                      >
                        <div className="igdb-result-title" style={{ marginBottom: 0 }}>
                          {r.name}
                        </div>
                        {r.rating != null && (
                          <div
                            className={`detail-rating-badge ${ratingClass(r.rating)}`}
                            style={{ position: 'static', flexShrink: 0 }}
                          >
                            <span className="detail-rating-score">{r.rating}</span>
                            <span className="detail-rating-label">rating</span>
                          </div>
                        )}
                        {ownedGames.map((g) => (
                          <span
                            key={g.id}
                            className="igdb-result-in-library"
                            title="Click to view"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/games/${g.id}`)
                            }}
                          >
                            {g.platform?.name ?? 'In Library'}
                          </span>
                        ))}
                      </div>
                      <div className="igdb-result-year">
                        {r.release_year ?? ''}
                        {r.release_year && r.platforms.length > 0 && ' · '}
                        {r.platforms.join(', ')}
                      </div>
                      {r.summary && <div className="igdb-result-summary">{r.summary}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Confirm */}
      {step === 'confirm' && selected && (
        <div className="add-new-confirm-wrap">
          <button
            className="btn btn-secondary"
            style={{ marginBottom: 20 }}
            onClick={() => setStep('search')}
          >
            <ChevronLeft size={14} /> Back to results
          </button>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div className="add-game-confirm">
            <div className="add-game-confirm-cover">
              {selected.cover_url ? (
                <img src={selected.cover_url} alt={selected.name} />
              ) : (
                <div className="igdb-result-cover--empty">
                  <ImageOff size={24} />
                </div>
              )}
            </div>
            <div className="add-game-confirm-info">
              <div className="add-game-confirm-title">{selected.name}</div>
              {selected.release_year && (
                <div className="add-game-confirm-year">{selected.release_year}</div>
              )}
              {selected.summary && <p className="add-game-confirm-summary">{selected.summary}</p>}
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 24 }}>
            <div className="form-group">
              <label className="form-label">Platform</label>
              <select
                className="form-control"
                value={platformId}
                onChange={(e) => setPlatformId(e.target.value)}
              >
                <option value="">— Select —</option>
                {displayPlatforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Region</label>
              <select
                className="form-control"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
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
                onChange={(e) => setMonitored(e.target.checked)}
              />
              <span style={{ marginLeft: 8 }}>Monitored</span>
            </label>
          </div>

          <div style={{ marginTop: 24 }}>
            <button
              className="btn btn-primary"
              disabled={!platformId || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? 'Adding…' : `Add ${selected.name}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
