import { useQuery } from '@tanstack/react-query'
import { Calendar } from 'lucide-react'
import client from '../../api/client'
import type { Game } from '../../types'
import { Gamepad2 } from 'lucide-react'

const TODAY = new Date()
const YEAR_START = `${TODAY.getFullYear()}-01-01`
const YEAR_END = `${TODAY.getFullYear()}-12-31`

export default function CalendarPage() {
  const { data: games = [], isLoading } = useQuery({
    queryKey: ['calendar', TODAY.getFullYear()],
    queryFn: () =>
      client
        .get<Game[]>('/calendar', { params: { start: YEAR_START, end: YEAR_END } })
        .then((r) => r.data),
  })

  // Group by release year then title
  const grouped = games.reduce<Record<number, Game[]>>((acc, g) => {
    const y = g.release_year ?? 0
    ;(acc[y] ||= []).push(g)
    return acc
  }, {})

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <Calendar size={48} />
        <p>No games with release dates</p>
        <small>Add release years to your games to see them here.</small>
      </div>
    )
  }

  return (
    <div>
      {Object.entries(grouped)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, yearGames]) => (
          <div key={year} className="settings-section">
            <div className="card-header">
              <span className="card-title">{year === '0' ? 'Unknown' : year}</span>
              <span className="text-muted text-sm">
                {yearGames.length} game{yearGames.length !== 1 ? 's' : ''}
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
                      <th>Region</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearGames.map((g) => (
                      <tr key={g.id}>
                        <td>
                          {g.cover_url ? (
                            <img src={g.cover_url} alt="" className="cover-thumb" />
                          ) : (
                            <div className="cover-placeholder">
                              <Gamepad2 size={14} />
                            </div>
                          )}
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>{g.title}</td>
                        <td className="text-muted">{g.platform?.name ?? '—'}</td>
                        <td className="text-muted">{g.region}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
    </div>
  )
}
