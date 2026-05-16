import { useNavigate } from 'react-router-dom'
import { RotateCcw, Trash2, Gamepad2 } from 'lucide-react'
import { gamesApi } from '../../api/games'
import type { Game } from '../../types'

interface Props {
  games: Game[]
  platformMap: Record<number, string>
  onDelete: (game: Game) => void
  selecting?: boolean
  selected?: Set<number>
  onToggleSelect?: (id: number) => void
}

export default function GamesPosters({
  games,
  platformMap,
  onDelete,
  selecting,
  selected,
  onToggleSelect,
}: Props) {
  const navigate = useNavigate()

  return (
    <div className="poster-grid">
      {games.map((game) => {
        const isSelected = selected?.has(game.id) ?? false
        return (
          <div
            key={game.id}
            className={`poster-card${isSelected ? ' selected' : ''}`}
            onClick={() => (selecting ? onToggleSelect?.(game.id) : navigate(`/games/${game.id}`))}
            style={{ cursor: 'pointer' }}
          >
            {selecting && (
              <div className="poster-check">
                <input
                  type="checkbox"
                  className="game-checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect?.(game.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {game.cover_url ? (
              <img src={game.cover_url} alt={game.title} className="poster-img" />
            ) : (
              <div className="poster-img poster-placeholder">
                <Gamepad2 size={32} />
              </div>
            )}

            {!selecting && (
              <div className="poster-hover-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-icon"
                  title="Re-search"
                  onClick={() => gamesApi.search(game.id)}
                >
                  <RotateCcw size={14} />
                </button>
                <button className="btn-icon" title="Delete" onClick={() => onDelete(game)}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            <div className="poster-footer">
              <div className="poster-title" title={game.title}>
                {game.title}
              </div>
              <div className="poster-meta">
                {game.platform?.name ?? platformMap[game.platform_id] ?? '—'}
                {game.release_year ? ` · ${game.release_year}` : ''}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
