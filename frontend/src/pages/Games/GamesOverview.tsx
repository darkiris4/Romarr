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

function romFilename(path: string | null | undefined) {
  if (!path) return null
  return path.split('/').pop() ?? path
}

export default function GamesOverview({ games, platformMap, onDelete }: Props) {
  return (
    <div className="overview-list card" style={{ padding: 0 }}>
      {games.map(game => (
        <div key={game.id} className="overview-row">
          <Link to={`/games/${game.id}`} style={{ flexShrink: 0 }}>
            {game.cover_url ? (
              <img src={game.cover_url} alt={game.title} className="overview-cover" />
            ) : (
              <div className="overview-cover overview-cover-placeholder">
                <Gamepad2 size={22} />
              </div>
            )}
          </Link>

          <div className="overview-body">
            <div className="overview-title">
              <Link to={`/games/${game.id}`} style={{ color: 'var(--text-white)' }}>
                {game.title}
              </Link>
              {!game.monitored && <span className="text-muted text-sm"> (unmonitored)</span>}
            </div>
            <div className="overview-meta">
              <span>{game.platform?.name ?? platformMap[game.platform_id] ?? '—'}</span>
              {game.region && <span>{game.region}</span>}
              {game.release_year && <span>{game.release_year}</span>}
            </div>
            {game.rom_path && (
              <div className="overview-path" title={game.rom_path}>
                {romFilename(game.rom_path)}
              </div>
            )}
          </div>

          <div className="overview-right">
            <StatusBadge status={game.status} />
            <div className="flex-center gap-2" style={{ marginTop: 8 }}>
              <button className="btn-icon" title="Re-search" onClick={() => gamesApi.search(game.id)}>
                <RotateCcw size={14} />
              </button>
              <button className="btn-icon" title="Delete" onClick={() => onDelete(game)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
