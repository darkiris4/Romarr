import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gamepad2, Table2, LayoutGrid, AlignJustify, RefreshCw, CheckSquare, Tag, Trash2 } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { systemApi } from '../../api/system'
import { platformsApi } from '../../api/platforms'
import ConfirmModal from '../../components/ConfirmModal'
import GamesTable from './GamesTable'
import GamesPosters from './GamesPosters'
import GamesOverview from './GamesOverview'
import type { Game } from '../../types'

type View = 'table' | 'posters' | 'overview'

function getSavedView(): View {
  const v = localStorage.getItem('games-view')
  return (v === 'table' || v === 'posters' || v === 'overview') ? v : 'table'
}

function TagsModal({ count, onApply, onCancel }: {
  count: number
  onApply: (tags: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Set Tags</span>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Applying to <strong style={{ color: 'var(--text-white)' }}>{count}</strong> game{count !== 1 ? 's' : ''}.
            This replaces existing tags.
          </p>
          <input
            className="form-control"
            placeholder="action, rpg, favorite…"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onApply(value)}
            autoFocus
          />
          <div className="form-hint">Comma-separated. Leave blank to clear all tags.</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onApply(value)}>Apply</button>
        </div>
      </div>
    </div>
  )
}

export default function GamesPage() {
  const [platformFilter, setPlatformFilter] = useState<number | undefined>(undefined)
  const [view, setView] = useState<View>(getSavedView)
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showTagsModal, setShowTagsModal] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [updateAllDone, setUpdateAllDone] = useState(false)
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

  const bulkDeleteMutation = useMutation({
    mutationFn: () => gamesApi.bulkDelete([...selected]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      setSelected(new Set())
      setSelecting(false)
      setShowBulkDeleteConfirm(false)
    },
  })

  const bulkTagMutation = useMutation({
    mutationFn: (tags: string) => gamesApi.bulkTag([...selected], tags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      setShowTagsModal(false)
    },
  })

  const updateAllMutation = useMutation({
    mutationFn: () => systemApi.scrape(),
    onSuccess: () => {
      setUpdateAllDone(true)
      setTimeout(() => setUpdateAllDone(false), 2500)
    },
  })

  const platformMap = Object.fromEntries(platforms.map(p => [p.id, p.name]))
  function changeView(v: View) { setView(v); localStorage.setItem('games-view', v) }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
  }

  function toggleSelectAll() {
    if (selected.size === games.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(games.map(g => g.id)))
    }
  }

  const viewProps = {
    games,
    platformMap,
    onDelete: setDeleteTarget,
    selecting,
    selected,
    onToggleSelect: toggleSelect,
  }

  return (
    <div>
      <div className="page-toolbar">
        {!selecting ? (
          <>
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

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => updateAllMutation.mutate()}
              disabled={updateAllMutation.isPending || updateAllDone}
              title="Refresh metadata for all games"
            >
              <RefreshCw size={13} style={updateAllMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
              {updateAllDone ? 'Started!' : updateAllMutation.isPending ? 'Starting…' : 'Update All'}
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelecting(true)}
              title="Select games for bulk actions"
            >
              <CheckSquare size={13} /> Edit Games
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" onClick={stopSelecting}>
              Stop Selecting
            </button>
            <button className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>
              {selected.size === games.length ? 'Deselect All' : 'Select All'}
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>
              {selected.size} selected
            </span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowTagsModal(true)}
                disabled={selected.size === 0}
              >
                <Tag size={13} /> Set Tags
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(240,80,80,.15)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selected.size === 0}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </>
        )}

        <div className="view-switcher" style={{ marginLeft: 'auto' }}>
          <button className={`view-btn${view === 'table'    ? ' active' : ''}`} title="Table"    onClick={() => changeView('table')}>    <Table2 size={15} /></button>
          <button className={`view-btn${view === 'posters'  ? ' active' : ''}`} title="Posters"  onClick={() => changeView('posters')}>  <LayoutGrid size={15} /></button>
          <button className={`view-btn${view === 'overview' ? ' active' : ''}`} title="Overview" onClick={() => changeView('overview')}> <AlignJustify size={15} /></button>
        </div>
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

      {showBulkDeleteConfirm && (
        <ConfirmModal
          title="Delete Games"
          message={`Remove ${selected.size} game${selected.size !== 1 ? 's' : ''} from Romarr? ROM files will NOT be deleted.`}
          confirmLabel={`Delete ${selected.size}`}
          danger
          onConfirm={() => bulkDeleteMutation.mutate()}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {showTagsModal && (
        <TagsModal
          count={selected.size}
          onApply={tags => bulkTagMutation.mutate(tags)}
          onCancel={() => setShowTagsModal(false)}
        />
      )}
    </div>
  )
}
