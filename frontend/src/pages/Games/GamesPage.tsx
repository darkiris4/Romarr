import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Trash2, RotateCcw, Gamepad2 } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import StatusBadge from '../../components/StatusBadge'
import ConfirmModal from '../../components/ConfirmModal'
import AddGameModal from './AddGameModal'
import type { Game } from '../../types'

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  const mb = bytes / 1024 / 1024
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

export default function GamesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const qc = useQueryClient()

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games', search],
    queryFn: () => gamesApi.list({ search: search || undefined }),
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchParams(search ? { search } : {})
  }

  return (
    <div>
      <div className="page-toolbar">
        <form onSubmit={handleSearch} className="flex-center gap-2">
          <div className="search-wrapper">
            <Search size={14} className="search-icon" />
            <input
              className="topbar-search"
              placeholder="Filter games…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </form>
        <div className="spacer" />
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
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="col-cover" />
                  <th>Title</th>
                  <th>Platform</th>
                  <th>Region</th>
                  <th>Year</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {games.map(game => (
                  <tr key={game.id}>
                    <td>
                      {game.cover_url ? (
                        <img src={game.cover_url} alt="" className="cover-thumb" />
                      ) : (
                        <div className="cover-placeholder"><Gamepad2 size={14} /></div>
                      )}
                    </td>
                    <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>
                      {game.title}
                      {!game.monitored && <span className="text-muted text-sm"> (unmonitored)</span>}
                    </td>
                    <td className="text-muted">{game.platform?.name ?? platformMap[game.platform_id] ?? '—'}</td>
                    <td className="text-muted">{game.region}</td>
                    <td className="text-muted">{game.release_year ?? '—'}</td>
                    <td><StatusBadge status={game.status} /></td>
                    <td>
                      <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn-icon"
                          title="Re-search"
                          onClick={() => gamesApi.search(game.id)}
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          title="Delete"
                          onClick={() => setDeleteTarget(game)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <AddGameModal
          platforms={platforms}
          onClose={() => setShowAdd(false)}
          onAdded={() => { qc.invalidateQueries({ queryKey: ['games'] }); setShowAdd(false) }}
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
