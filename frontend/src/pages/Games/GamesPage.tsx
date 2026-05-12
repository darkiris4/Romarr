import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Gamepad2, FolderInput, Table2, LayoutGrid, AlignJustify, X } from 'lucide-react'
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
  const [inputValue, setInputValue] = useState('')
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<number | undefined>(undefined)
  const [view, setView] = useState<View>(getSavedView)
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const qc = useQueryClient()

  // Debounce: only fire a search 300 ms after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => setSearch(inputValue), 300)
    return () => clearTimeout(t)
  }, [inputValue])

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games', search, platformFilter],
    queryFn: () => gamesApi.list({ search: search || undefined, platform_id: platformFilter }),
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

  const viewProps = { games, platformMap, onDelete: setDeleteTarget }

  return (
    <div>
      <div className="page-toolbar">
        <div className="search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            className="topbar-search"
            placeholder="Filter games…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
          />
          {inputValue && (
            <button
              className="search-clear"
              onClick={() => setInputValue('')}
              tabIndex={-1}
            >
              <X size={12} />
            </button>
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
          <button className={`view-btn${view === 'table'    ? ' active' : ''}`} title="Table"    onClick={() => changeView('table')}>
            <Table2 size={15} />
          </button>
          <button className={`view-btn${view === 'posters'  ? ' active' : ''}`} title="Posters"  onClick={() => changeView('posters')}>
            <LayoutGrid size={15} />
          </button>
          <button className={`view-btn${view === 'overview' ? ' active' : ''}`} title="Overview" onClick={() => changeView('overview')}>
            <AlignJustify size={15} />
          </button>
        </div>

        <div className="spacer" />
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
          <FolderInput size={15} /> Import Library
        </button>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add Game
        </button>
      </div>

      {isLoading ? (
        <div className="loading-page"><div className="spinner" /> Loading…</div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <Gamepad2 size={48} />
          <p>No games yet</p>
          <small>Add games manually or configure a List plugin to populate your Wanted list.</small>
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
