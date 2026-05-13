import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, Gamepad2, FolderInput, Table2, LayoutGrid, AlignJustify, X, Plus, ImageOff } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import ConfirmModal from '../../components/ConfirmModal'
import AddGameModal from './AddGameModal'
import ImportModal from './ImportModal'
import GamesTable from './GamesTable'
import GamesPosters from './GamesPosters'
import GamesOverview from './GamesOverview'
import type { Game } from '../../types'

type View = 'table' | 'posters' | 'overview'

function getSavedView(): View {
  const v = localStorage.getItem('games-view')
  return (v === 'table' || v === 'posters' || v === 'overview') ? v : 'table'
}

export default function GamesPage() {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState('')
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<number | undefined>(undefined)
  const [view, setView] = useState<View>(getSavedView)
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  // Debounce list filter
  useEffect(() => {
    const t = setTimeout(() => setSearch(inputValue), 300)
    return () => clearTimeout(t)
  }, [inputValue])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games', search, platformFilter],
    queryFn: () => gamesApi.list({ search: search || undefined, platform_id: platformFilter }),
  })

  // Dropdown: existing library matches (up to 5)
  const { data: suggestions = [] } = useQuery({
    queryKey: ['games-suggest', inputValue],
    queryFn: () => gamesApi.list({ search: inputValue }),
    enabled: dropdownOpen && inputValue.length > 1,
    staleTime: 10_000,
  })

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => gamesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['games'] }); setDeleteTarget(null) },
  })

  const platformMap = Object.fromEntries(platforms.map(p => [p.id, p.name]))

  function changeView(v: View) {
    setView(v)
    localStorage.setItem('games-view', v)
  }

  function openAdd(query: string) {
    setAddQuery(query)
    setDropdownOpen(false)
    setShowAdd(true)
  }

  const viewProps = { games, platformMap, onDelete: setDeleteTarget }
  const trimmed = inputValue.trim()

  return (
    <div>
      <div className="page-toolbar">

        {/* Search + dropdown */}
        <div className="search-wrapper" ref={searchRef} style={{ position: 'relative' }}>
          <Search size={14} className="search-icon" />
          <input
            className="topbar-search"
            placeholder="Search or add games…"
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setDropdownOpen(true) }}
            onFocus={() => inputValue && setDropdownOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setDropdownOpen(false); setInputValue('') }
              if (e.key === 'Enter' && trimmed) openAdd(trimmed)
            }}
          />
          {inputValue && (
            <button
              className="search-clear"
              onClick={() => { setInputValue(''); setDropdownOpen(false) }}
              tabIndex={-1}
            >
              <X size={12} />
            </button>
          )}

          {/* Dropdown */}
          {dropdownOpen && trimmed && (
            <div className="search-dropdown">
              {suggestions.slice(0, 5).map(g => (
                <div
                  key={g.id}
                  className="search-dropdown-row"
                  onMouseDown={e => { e.preventDefault(); setDropdownOpen(false); navigate(`/games/${g.id}`) }}
                >
                  <div className="search-dropdown-cover">
                    {g.cover_url
                      ? <img src={g.cover_url} alt={g.title} />
                      : <div className="search-dropdown-cover--empty"><ImageOff size={10} /></div>
                    }
                  </div>
                  <div className="search-dropdown-info">
                    <span className="search-dropdown-title">{g.title}</span>
                    <span className="search-dropdown-meta">
                      {g.platform?.name}{g.release_year ? ` · ${g.release_year}` : ''}
                    </span>
                  </div>
                  <span className="search-dropdown-badge">In Library</span>
                </div>
              ))}

              <div
                className="search-dropdown-row search-dropdown-row--add"
                onMouseDown={e => { e.preventDefault(); openAdd(trimmed) }}
              >
                <div className="search-dropdown-cover search-dropdown-cover--add">
                  <Plus size={13} />
                </div>
                <span className="search-dropdown-title">
                  Search IGDB for "{trimmed}"
                </span>
              </div>
            </div>
          )}
        </div>

        <select
          className="form-control"
          style={{ maxWidth: 180, height: 32, padding: '0 8px', fontSize: 13 }}
          value={platformFilter ?? ''}
          onChange={e => setPlatformFilter(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Consoles</option>
          {platforms.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div className="view-switcher">
          <button className={`view-btn${view === 'table'    ? ' active' : ''}`} title="Table"    onClick={() => changeView('table')}>    <Table2 size={15} /></button>
          <button className={`view-btn${view === 'posters'  ? ' active' : ''}`} title="Posters"  onClick={() => changeView('posters')}>  <LayoutGrid size={15} /></button>
          <button className={`view-btn${view === 'overview' ? ' active' : ''}`} title="Overview" onClick={() => changeView('overview')}> <AlignJustify size={15} /></button>
        </div>

        <div className="spacer" />
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
          <FolderInput size={15} /> Import Library
        </button>
      </div>

      {isLoading ? (
        <div className="loading-page"><div className="spinner" /> Loading…</div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <Gamepad2 size={48} />
          <p>No games yet</p>
          <small>Search for a game above to add it, or import an existing library.</small>
        </div>
      ) : view === 'table' ? (
        <GamesTable {...viewProps} />
      ) : view === 'posters' ? (
        <GamesPosters {...viewProps} />
      ) : (
        <GamesOverview {...viewProps} />
      )}

      {showAdd && (
        <AddGameModal
          platforms={platforms}
          initialQuery={addQuery}
          onClose={() => setShowAdd(false)}
          onAdded={() => { qc.invalidateQueries({ queryKey: ['games'] }); setShowAdd(false) }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { qc.invalidateQueries({ queryKey: ['games'] }) }}
        />
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
    </div>
  )
}
