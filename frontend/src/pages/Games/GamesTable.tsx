import { memo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Trash2, Gamepad2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { gamesApi } from '../../api/games'
import StatusBadge from '../../components/StatusBadge'
import type { ColumnConfig } from '../../components/ColumnChooser'
import type { Game } from '../../types'

type SortableCol = 'title' | 'platform' | 'year'

interface Props {
  games: Game[]
  platformMap: Record<number, string>
  onDelete: (game: Game) => void
  selecting?: boolean
  selected?: Set<number>
  onToggleSelect?: (id: number) => void
  sortBy?: string
  onSort?: (col: SortableCol) => void
  focusedIndex?: number
  columns?: ColumnConfig[]
}

const COL_SORT: Partial<Record<ColumnConfig['key'], SortableCol>> = {
  platform: 'platform',
  year: 'year',
}

function SortIcon({ col, sortBy }: { col: SortableCol; sortBy?: string }) {
  const asc = col === 'title' ? 'name_asc' : col === 'platform' ? 'platform' : 'year_asc'
  const desc = col === 'title' ? 'name_desc' : col === 'platform' ? 'platform' : 'year_desc'
  if (sortBy === asc) return <ArrowUp size={12} style={{ marginLeft: 4 }} />
  if (sortBy === desc) return <ArrowDown size={12} style={{ marginLeft: 4 }} />
  return <ArrowUpDown size={12} style={{ marginLeft: 4, opacity: 0.35 }} />
}

const DEFAULT_VISIBLE: ColumnConfig[] = [
  { key: 'platform', label: 'Platform', visible: true },
  { key: 'region', label: 'Region', visible: true },
  { key: 'year', label: 'Year', visible: true },
  { key: 'status', label: 'Status', visible: true },
]

export default memo(function GamesTable({
  games,
  platformMap,
  onDelete,
  selecting,
  selected,
  onToggleSelect,
  sortBy,
  onSort,
  focusedIndex = -1,
  columns,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: games.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < games.length) {
      rowVirtualizer.scrollToIndex(focusedIndex, { align: 'auto' })
    }
    // rowVirtualizer is stable; games.length guards the bounds check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, games.length])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0

  const visibleCols = (columns ?? DEFAULT_VISIBLE).filter((c) => c.visible)
  // cover + title + visibleCols + (check or actions)
  const colSpan = 2 + visibleCols.length + 1

  function cellContent(col: ColumnConfig, game: Game): React.ReactNode {
    switch (col.key) {
      case 'platform':
        return game.platform?.name ?? platformMap[game.platform_id] ?? '—'
      case 'region':
        return game.region || '—'
      case 'year':
        return game.release_year ?? '—'
      case 'status':
        return <StatusBadge status={game.status} />
      case 'tags':
        return game.tags || '—'
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        className="table-wrap"
        ref={parentRef}
        style={{ maxHeight: 'calc(100vh - 195px)', overflowY: 'auto' }}
      >
        <table>
          <thead>
            <tr>
              {selecting && <th className="col-check" />}
              <th className="col-cover" />
              <th
                className={onSort ? 'sortable' : ''}
                onClick={onSort ? () => onSort('title') : undefined}
              >
                Title
                {onSort && <SortIcon col="title" sortBy={sortBy} />}
              </th>
              {visibleCols.map((col) => {
                const sortCol = COL_SORT[col.key]
                return (
                  <th
                    key={col.key}
                    className={sortCol && onSort ? 'sortable' : ''}
                    onClick={sortCol && onSort ? () => onSort(sortCol) : undefined}
                  >
                    {col.label}
                    {sortCol && onSort && <SortIcon col={sortCol} sortBy={sortBy} />}
                  </th>
                )
              })}
              {!selecting && <th className="col-actions" />}
            </tr>
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td colSpan={colSpan} style={{ height: paddingTop, padding: 0 }} />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const game = games[virtualRow.index]
              const isSelected = selected?.has(game.id) ?? false
              const isFocused = virtualRow.index === focusedIndex
              let rowClass = ''
              if (selecting) rowClass = `selecting${isSelected ? ' selected' : ''}`
              if (isFocused) rowClass = (rowClass ? rowClass + ' ' : '') + 'keyboard-focused'

              return (
                <tr
                  key={game.id}
                  id={`game-row-${game.id}`}
                  className={rowClass || undefined}
                  onClick={selecting ? () => onToggleSelect?.(game.id) : undefined}
                  style={selecting ? { cursor: 'pointer' } : undefined}
                >
                  {selecting && (
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="game-checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect?.(game.id)}
                      />
                    </td>
                  )}
                  <td>
                    {selecting ? (
                      game.cover_url ? (
                        <img src={game.cover_url} alt="" className="cover-thumb" />
                      ) : (
                        <div className="cover-placeholder">
                          <Gamepad2 size={14} />
                        </div>
                      )
                    ) : (
                      <Link to={`/games/${game.id}`}>
                        {game.cover_url ? (
                          <img src={game.cover_url} alt="" className="cover-thumb" />
                        ) : (
                          <div className="cover-placeholder">
                            <Gamepad2 size={14} />
                          </div>
                        )}
                      </Link>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    {selecting ? (
                      <span style={{ color: 'var(--text-white)' }}>{game.title}</span>
                    ) : (
                      <Link to={`/games/${game.id}`} style={{ color: 'var(--text-white)' }}>
                        {game.title}
                      </Link>
                    )}
                    {!game.monitored && <span className="text-muted text-sm"> (unmonitored)</span>}
                  </td>
                  {visibleCols.map((col) => (
                    <td key={col.key} className={col.key !== 'status' ? 'text-muted' : ''}>
                      {cellContent(col, game)}
                    </td>
                  ))}
                  {!selecting && (
                    <td>
                      <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
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
                    </td>
                  )}
                </tr>
              )
            })}
            {paddingBottom > 0 && (
              <tr>
                <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
})
