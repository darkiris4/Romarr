import { Link } from 'react-router-dom'
import { RotateCcw, Trash2, Gamepad2 } from 'lucide-react'
import { gamesApi } from '../../api/games'
import StatusBadge from '../../components/StatusBadge'
import type { Game } from '../../types'

interface Props {
  games: Game[]
  platformMap: Record<number, string>
  onDelete: (game: Game) => void
}

export default function GamesTable({ games, platformMap, onDelete }: Props) {
  return (
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
                  <Link to={`/games/${game.id}`}>
                    {game.cover_url ? (
                      <img src={game.cover_url} alt="" className="cover-thumb" />
                    ) : (
                      <div className="cover-placeholder"><Gamepad2 size={14} /></div>
                    )}
                  </Link>
                </td>
                <td style={{ fontWeight: 500 }}>
                  <Link to={`/games/${game.id}`} style={{ color: 'var(--text-white)' }}>
                    {game.title}
                  </Link>
                  {!game.monitored && <span className="text-muted text-sm"> (unmonitored)</span>}
                </td>
                <td className="text-muted">{game.platform?.name ?? platformMap[game.platform_id] ?? '—'}</td>
                <td className="text-muted">{game.region}</td>
                <td className="text-muted">{game.release_year ?? '—'}</td>
                <td><StatusBadge status={game.status} /></td>
                <td>
                  <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn-icon" title="Re-search" onClick={() => gamesApi.search(game.id)}>
                      <RotateCcw size={14} />
                    </button>
                    <button className="btn-icon" title="Delete" onClick={() => onDelete(game)}>
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
  )
}
