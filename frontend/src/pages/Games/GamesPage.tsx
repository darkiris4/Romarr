import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gamepad2, Table2, LayoutGrid, AlignJustify, RefreshCw, CheckSquare, Tag, Trash2, Filter, ArrowUpDown, Copy } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { systemApi } from '../../api/system'
import { platformsApi } from '../../api/platforms'
import { libraryApi } from '../../api/library'
import ConfirmModal from '../../components/ConfirmModal'
import GamesTable from './GamesTable'
import GamesPosters from './GamesPosters'
import GamesOverview from './GamesOverview'
import type { Game } from '../../types'

type View = 'table' | 'posters' | 'overview'
type SortKey = 'name_asc' | 'name_desc' | 'rating_desc' | 'rating_asc' | 'year_desc' | 'year_asc' | 'platform' | 'added_desc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name_asc',    label: 'Name A→Z' },
  { key: 'name_desc',   label: 'Name Z→A' },
  { key: 'rating_desc', label: 'Rating ↓' },
  { key: 'rating_asc',  label: 'Rating ↑' },
  { key: 'year_desc',   label: 'Year (newest)' },
  { key: 'year_asc',    label: 'Year (oldest)' },
  { key: 'platform',    label: 'Platform' },
  { key: 'added_desc',  label: 'Date Added' },
]

function parseIds(p: URLSearchParams, key: string): Set<number> {
  const v = p.get(key); if (!v) return new Set()
  return new Set(v.split(',').filter(Boolean).map(Number))
}
function parseStrs(p: URLSearchParams, key: string): Set<string> {
  const v = p.get(key); if (!v) return new Set()
  return new Set(v.split(',').filter(Boolean))
}

function getSavedView(): View {
  const v = localStorage.getItem('games-view')
  return (v === 'table' || v === 'posters' || v === 'overview') ? v : 'table'
}

function TagsModal({ count, onApply, onCancel }: {
  count: number
  onApply: (tags: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Set Tags</span>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Applying to <strong style={{ color: 'var(--text-white)' }}>{count}</strong> game{count !== 1 ? 's' : ''}.
            This replaces existing tags.
          </p>
          <input
            className="form-control"
            placeholder="action, rpg, favorite…"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onApply(value)}
            autoFocus
          />
          <div className="form-hint">Comma-separated. Leave blank to clear all tags.</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onApply(value)}>Apply</button>
        </div>
      </div>
    </div>
  )
}

export default function GamesPage() {
  const [view, setView] = useState<View>(getSavedView)
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showTagsModal, setShowTagsModal] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [updateAllDone, setUpdateAllDone] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  // Derive filter/sort state from URL — persists across refresh and back/forward
  const filterPlatforms = useMemo(() => parseIds(searchParams, 'platforms'), [searchParams])
  const filterStatuses  = useMemo(() => parseStrs(searchParams, 'statuses'),  [searchParams])
  const filterMissing   = useMemo(() => parseStrs(searchParams, 'missing'),    [searchParams])
  const filterRegions   = useMemo(() => parseStrs(searchParams, 'regions'),    [searchParams])
  const sortBy = (searchParams.get('sort') as SortKey) || 'name_asc'

  const [dedupResult, setDedupResult] = useState<string | null>(null)

  const [showFilter, setShowFilter] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  const qc = useQueryClient()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const { data: allGames = [], isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => gamesApi.list({}),
  })

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => gamesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['games'] }); setDeleteTarget(null) },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: () => gamesApi.bulkDelete([...selected]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      setSelected(new Set())
      setSelecting(false)
      setShowBulkDeleteConfirm(false)
    },
  })

  const bulkTagMutation = useMutation({
    mutationFn: (tags: string) => gamesApi.bulkTag([...selected], tags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      setShowTagsModal(false)
    },
  })

  const updateAllMutation = useMutation({
    mutationFn: () => systemApi.scrape(),
    onSuccess: () => {
      setUpdateAllDone(true)
      setTimeout(() => setUpdateAllDone(false), 2500)
    },
  })

  const dedupMutation = useMutation({
    mutationFn: () => libraryApi.deduplicate(),
    onSuccess: ({ removed }) => {
      qc.invalidateQueries({ queryKey: ['games'] })
      setDedupResult(removed > 0 ? `Removed ${removed}` : 'None found')
      setTimeout(() => setDedupResult(null), 3000)
    },
  })

  const platformMap = Object.fromEntries(platforms.map(p => [p.id, p.name]))

  const uniqueRegions = useMemo(() => {
    const set = new Set<string>()
    for (const g of allGames) if (g.region) set.add(g.region)
    return [...set].sort()
  }, [allGames])

  const filteredGames = useMemo(() => {
    return allGames.filter(g => {
      if (filterPlatforms.size > 0 && !filterPlatforms.has(g.platform_id)) return false
      if (filterStatuses.size > 0 && !filterStatuses.has(g.status)) return false
      if (filterRegions.size > 0 && !filterRegions.has(g.region)) return false
      if (filterMissing.has('no_cover') && g.cover_url) return false
      if (filterMissing.has('no_rating') && g.rating != null) return false
      if (filterMissing.has('no_igdb') && g.igdb_id != null) return false
      return true
    })
  }, [allGames, filterPlatforms, filterStatuses, filterRegions, filterMissing])

  const games = useMemo(() => {
    return [...filteredGames].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':    return a.title.localeCompare(b.title)
        case 'name_desc':   return b.title.localeCompare(a.title)
        case 'rating_desc': return (b.rating ?? -1) - (a.rating ?? -1)
        case 'rating_asc':  return (a.rating ?? 101) - (b.rating ?? 101)
        case 'year_desc':   return (b.release_year ?? 0) - (a.release_year ?? 0)
        case 'year_asc':    return (a.release_year ?? 9999) - (b.release_year ?? 9999)
        case 'platform':    return (platformMap[a.platform_id] ?? '').localeCompare(platformMap[b.platform_id] ?? '')
        case 'added_desc':  return b.added_at.localeCompare(a.added_at)
        default:            return 0
      }
    })
  }, [filteredGames, sortBy, platformMap])

  function changeView(v: View) { setView(v); localStorage.setItem('games-view', v) }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopSelecting() { setSelecting(false); setSelected(new Set()) }

  function toggleSelectAll() {
    if (selected.size === games.length) setSelected(new Set())
    else setSelected(new Set(games.map(g => g.id)))
  }

  function updateParams(updates: Record<string, string | null>) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v); else next.delete(k)
      }
      return next
    }, { replace: true })
  }

  function toggleFilter(paramKey: string, value: string | number) {
    const current = searchParams.get(paramKey)
    const parts = current ? current.split(',').filter(Boolean) : []
    const str = String(value)
    const next = parts.includes(str) ? parts.filter(p => p !== str) : [...parts, str]
    updateParams({ [paramKey]: next.join(',') || null })
  }

  function clearAllFilters() {
    updateParams({ platforms: null, statuses: null, missing: null, regions: null })
  }

  const activeFilterCount =
    (filterPlatforms.size > 0 ? 1 : 0) +
    (filterStatuses.size > 0 ? 1 : 0) +
    (filterMissing.size > 0 ? 1 : 0) +
    (filterRegions.size > 0 ? 1 : 0)

  const viewProps = { games, platformMap, onDelete: setDeleteTarget, selecting, selected, onToggleSelect: toggleSelect }

  return (
    <div>
      <div className="page-toolbar">
        {!selecting ? (
          <>
            <button
              className="toolbar-icon-btn"
              onClick={() => updateAllMutation.mutate()}
              disabled={updateAllMutation.isPending || updateAllDone}
              title="Refresh metadata for all games"
            >
              <RefreshCw size={18} style={updateAllMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
              <span>{updateAllDone ? 'Started!' : updateAllMutation.isPending ? 'Starting…' : 'Update All'}</span>
            </button>

            <button
              className="toolbar-icon-btn"
              onClick={() => setSelecting(true)}
              title="Select games for bulk actions"
            >
              <CheckSquare size={18} />
              <span>Edit Games</span>
            </button>

            <button
              className="toolbar-icon-btn"
              onClick={() => dedupMutation.mutate()}
              disabled={dedupMutation.isPending || dedupResult !== null}
              title="Find and remove duplicate game entries"
            >
              <Copy size={18} />
              <span>{dedupResult ?? (dedupMutation.isPending ? 'Running…' : 'Dedupe')}</span>
            </button>

            <div className="spacer" />

            <div ref={filterRef} className="toolbar-dropdown-wrap">
              <button
                className={`toolbar-icon-btn${activeFilterCount > 0 ? ' active' : ''}`}
                onClick={() => { setShowFilter(v => !v); setShowSort(false) }}
              >
                <Filter size={18} />
                <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
              </button>
              {showFilter && (
                <div className="toolbar-dropdown-panel">
                  {platforms.length > 0 && (
                    <>
                      <div className="toolbar-dropdown-section-label">Platform</div>
                      <div className="toolbar-dropdown-scroll">
                        {platforms.map(p => (
                          <label key={p.id} className="toolbar-dropdown-item">
                            <input type="checkbox" checked={filterPlatforms.has(p.id)} onChange={() => toggleFilter('platforms', p.id)} />
                            {p.name}
                          </label>
                        ))}
                      </div>
                      <div className="toolbar-dropdown-divider" />
                    </>
                  )}

                  <div className="toolbar-dropdown-section-label">Status</div>
                  {(['wanted', 'grabbed', 'downloading', 'imported', 'failed'] as const).map(s => (
                    <label key={s} className="toolbar-dropdown-item">
                      <input type="checkbox" checked={filterStatuses.has(s)} onChange={() => toggleFilter('statuses', s)} />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </label>
                  ))}

                  <div className="toolbar-dropdown-divider" />
                  <div className="toolbar-dropdown-section-label">Missing</div>
                  {[
                    { key: 'no_cover',  label: 'No Cover Art' },
                    { key: 'no_rating', label: 'No Rating' },
                    { key: 'no_igdb',   label: 'Not in IGDB' },
                  ].map(({ key, label }) => (
                    <label key={key} className="toolbar-dropdown-item">
                      <input type="checkbox" checked={filterMissing.has(key)} onChange={() => toggleFilter('missing', key)} />
                      {label}
                    </label>
                  ))}

                  {uniqueRegions.length > 0 && (
                    <>
                      <div className="toolbar-dropdown-divider" />
                      <div className="toolbar-dropdown-section-label">Region</div>
                      <div className="toolbar-dropdown-scroll">
                        {uniqueRegions.map(r => (
                          <label key={r} className="toolbar-dropdown-item">
                            <input type="checkbox" checked={filterRegions.has(r)} onChange={() => toggleFilter('regions', r)} />
                            {r || '—'}
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  {activeFilterCount > 0 && (
                    <>
                      <div className="toolbar-dropdown-divider" />
                      <button className="toolbar-dropdown-item" style={{ color: 'var(--danger)' }} onClick={clearAllFilters}>
                        Clear All Filters
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div ref={sortRef} className="toolbar-dropdown-wrap">
              <button
                className="toolbar-icon-btn"
                onClick={() => { setShowSort(v => !v); setShowFilter(false) }}
              >
                <ArrowUpDown size={18} />
                <span>Sort</span>
              </button>
              {showSort && (
                <div className="toolbar-dropdown-panel" style={{ minWidth: 170 }}>
                  {SORT_OPTIONS.map(({ key, label }) => (
                    <label key={key} className={`toolbar-dropdown-item${sortBy === key ? ' active' : ''}`}>
                      <input type="radio" name="sort" checked={sortBy === key} onChange={() => { updateParams({ sort: key === 'name_asc' ? null : key }); setShowSort(false) }} />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="view-switcher">
              <button className={`view-btn${view === 'table'    ? ' active' : ''}`} onClick={() => changeView('table')}>    <Table2 size={16} /><span>Table</span></button>
              <button className={`view-btn${view === 'posters'  ? ' active' : ''}`} onClick={() => changeView('posters')}>  <LayoutGrid size={16} /><span>Posters</span></button>
              <button className={`view-btn${view === 'overview' ? ' active' : ''}`} onClick={() => changeView('overview')}> <AlignJustify size={16} /><span>Overview</span></button>
            </div>
          </>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" onClick={stopSelecting}>Stop Selecting</button>
            <button className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>
              {selected.size === games.length ? 'Deselect All' : 'Select All'}
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>{selected.size} selected</span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTagsModal(true)} disabled={selected.size === 0}>
                <Tag size={13} /> Set Tags
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(240,80,80,.15)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selected.size === 0}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </>
        )}
      </div>

      {activeFilterCount > 0 && !isLoading && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Showing {games.length.toLocaleString()} of {allGames.length.toLocaleString()} games
        </div>
      )}

      {isLoading ? (
        <div className="loading-page"><div className="spinner" /> Loading…</div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <Gamepad2 size={48} />
          <p>{allGames.length > 0 ? 'No games match your filters' : 'No games yet'}</p>
          <small>{allGames.length > 0 ? 'Try adjusting or clearing your filters.' : 'Search for a game above to add it, or import an existing library.'}</small>
        </div>
      ) : view === 'table' ? (
        <GamesTable {...viewProps} />
      ) : view === 'posters' ? (
        <GamesPosters {...viewProps} />
      ) : (
        <GamesOverview {...viewProps} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Game"
          message={`Remove "${deleteTarget.title}" from Romarr? The ROM file will NOT be deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showBulkDeleteConfirm && (
        <ConfirmModal
          title="Delete Games"
          message={`Remove ${selected.size} game${selected.size !== 1 ? 's' : ''} from Romarr? ROM files will NOT be deleted.`}
          confirmLabel={`Delete ${selected.size}`}
          danger
          onConfirm={() => bulkDeleteMutation.mutate()}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {showTagsModal && (
        <TagsModal
          count={selected.size}
          onApply={tags => bulkTagMutation.mutate(tags)}
          onCancel={() => setShowTagsModal(false)}
        />
      )}
    </div>
  )
}
