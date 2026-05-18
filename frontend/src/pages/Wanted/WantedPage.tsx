import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BookX, RotateCcw, Gamepad2, ArrowUpCircle } from 'lucide-react'
import { gamesApi } from '../../api/games'
import client from '../../api/client'
import type { Game, RevisionUnmetEntry } from '../../types'

function lastSearchedLabel(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function WantedPage() {
  const [tab, setTab] = useState<'missing' | 'revision'>('missing')

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn${tab === 'missing' ? ' active' : ''}`}
          onClick={() => setTab('missing')}
        >
          Missing
        </button>
        <button
          className={`tab-btn${tab === 'revision' ? ' active' : ''}`}
          onClick={() => setTab('revision')}
        >
          Revision Unmet
        </button>
      </div>

      {tab === 'missing' && <MissingTab />}
      {tab === 'revision' && <RevisionUnmetTab />}
    </div>
  )
}

function MissingTab() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['wanted-missing'],
    queryFn: () => client.get<Game[]>('/wanted/missing').then((r) => r.data),
  })

  const searchMutation = useMutation({
    mutationFn: (ids: number[]) => gamesApi.bulkSearch(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wanted-missing'] }),
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

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
        <span className="text-muted">
          {games.length} missing game{games.length !== 1 ? 's' : ''}
        </span>
        <div className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => searchMutation.mutate(games.map((g) => g.id))}
          disabled={searchMutation.isPending}
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
                <th>Last Searched</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.id}>
                  <td>
                    {game.cover_url ? (
                      <img src={game.cover_url} alt="" className="cover-thumb" />
                    ) : (
                      <div className="cover-placeholder">
                        <Gamepad2 size={14} />
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className="activity-game-link"
                      onClick={() => navigate(`/games/${game.id}`)}
                    >
                      {game.title}
                    </span>
                  </td>
                  <td className="text-muted">{game.platform?.name ?? '—'}</td>
                  <td className="text-muted">{game.region}</td>
                  <td className="text-muted">{game.release_year ?? '—'}</td>
                  <td className="text-muted" style={{ fontSize: 12 }}>
                    {lastSearchedLabel(game.last_searched_at)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-icon"
                        title="Search now"
                        onClick={() => searchMutation.mutate([game.id])}
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

function RevisionUnmetTab() {
  const navigate = useNavigate()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['wanted-revision-unmet'],
    queryFn: () => client.get<RevisionUnmetEntry[]>('/wanted/revision-unmet').then((r) => r.data),
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <ArrowUpCircle size={48} />
        <p>All revisions are current</p>
        <small>No imported ROMs have a newer revision available in the loaded No-Intro DATs.</small>
      </div>
    )
  }

  return (
    <div>
      <div className="page-toolbar">
        <span className="text-muted">
          {entries.length} game{entries.length !== 1 ? 's' : ''} with newer revision available
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-cover" />
                <th>Title</th>
                <th>Platform</th>
                <th>Current Revision</th>
                <th>Latest Revision</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {entry.cover_url ? (
                      <img src={entry.cover_url} alt="" className="cover-thumb" />
                    ) : (
                      <div className="cover-placeholder">
                        <Gamepad2 size={14} />
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className="activity-game-link"
                      onClick={() => navigate(`/games/${entry.id}`)}
                    >
                      {entry.title}
                    </span>
                  </td>
                  <td className="text-muted">{entry.platform ?? '—'}</td>
                  <td className="text-muted" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    {entry.current_revision}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--success)' }}>
                    {entry.latest_revision}
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-icon"
                        title="Go to game"
                        onClick={() => navigate(`/games/${entry.id}`)}
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
