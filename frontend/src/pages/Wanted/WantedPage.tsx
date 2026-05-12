import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookX, RotateCcw } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { Gamepad2 } from 'lucide-react'

export default function WantedPage() {
  const qc = useQueryClient()

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['wanted-missing'],
    queryFn: () => gamesApi.list({ status: 'wanted' }),
  })

  const searchMutation = useMutation({
    mutationFn: (id: number) => gamesApi.search(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['games'] }),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <BookX size={48} />
        <p>No missing games</p>
        <small>All monitored games are either downloading or imported.</small>
      </div>
    )
  }

  return (
    <div>
      <div className="page-toolbar">
        <span className="text-muted">{games.length} missing game{games.length !== 1 ? 's' : ''}</span>
        <div className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => games.forEach(g => searchMutation.mutate(g.id))}
        >
          <RotateCcw size={14} /> Search All
        </button>
      </div>

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
                  <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>{game.title}</td>
                  <td className="text-muted">{game.platform?.name ?? '—'}</td>
                  <td className="text-muted">{game.region}</td>
                  <td className="text-muted">{game.release_year ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-icon"
                        title="Search now"
                        onClick={() => searchMutation.mutate(game.id)}
                        disabled={searchMutation.isPending}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
