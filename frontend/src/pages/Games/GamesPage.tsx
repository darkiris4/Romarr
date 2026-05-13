import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gamepad2, FolderInput, Table2, LayoutGrid, AlignJustify } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import ConfirmModal from '../../components/ConfirmModal'
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
  const [platformFilter, setPlatformFilter] = useState<number | undefined>(undefined)
  const [view, setView] = useState<View>(getSavedView)
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)
  const [showImport, setShowImport] = useState(false)
  const qc = useQueryClient()

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games', platformFilter],
    queryFn: () => gamesApi.list({ platform_id: platformFilter }),
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
  function changeView(v: View) { setView(v); localStorage.setItem('games-view', v) }

  const viewProps = { games, platformMap, onDelete: setDeleteTarget }

  return (
    <div>
      <div className="page-toolbar">
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
