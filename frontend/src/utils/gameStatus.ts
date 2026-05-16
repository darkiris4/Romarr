import type { Game } from '../types'

/**
 * Radarr-style status bar color for a game card.
 *
 * Priority order (mirrors Radarr's getProgressBarKind):
 *   grabbed/downloading → purple  (queued)
 *   imported + monitored → green  (downloaded, monitored)
 *   imported + !monitored → grey  (downloaded, unmonitored)
 *   monitored → red               (missing, monitored)
 *   !monitored → orange           (missing, unmonitored)
 */
export function getStatusColor(game: Game): string {
  if (game.status === 'grabbed' || game.status === 'downloading') return 'var(--accent)'
  if (game.status === 'imported' && game.monitored) return 'var(--success)'
  if (game.status === 'imported' && !game.monitored) return '#555'
  if (game.monitored) return 'var(--danger)'
  return 'var(--warning)'
}
