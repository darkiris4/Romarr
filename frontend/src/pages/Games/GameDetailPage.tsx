import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  Search,
  Trash2,
  ImageOff,
  EyeOff,
  CheckCircle2,
  Download,
  AlertTriangle,
  Gamepad2,
  Pencil,
  FileEdit,
  RefreshCw,
  Clock,
  HardDrive,
  Bookmark,
  X,
} from 'lucide-react'
import { gamesApi } from '../../api/games'
import { historyApi } from '../../api/history'
import { platformsApi } from '../../api/platforms'
import { releaseProfilesApi } from '../../api/profiles'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingScreen from '../../components/LoadingScreen'
import ManualSearchModal from './ManualSearchModal'
import RenamePreviewModal from './RenamePreviewModal'
import type { Game, ReleaseProfile } from '../../types'

const STATUS_COLORS: Record<string, string> = {
  imported: 'var(--success)',
  wanted: 'var(--accent)',
  grabbed: 'var(--info)',
  downloading: 'var(--info)',
  failed: 'var(--danger)',
}
const STATUS_ICONS: Record<string, React.ReactNode> = {
  imported: <CheckCircle2 size={13} />,
  wanted: <Gamepad2 size={13} />,
  grabbed: <Download size={13} />,
  downloading: <Download size={13} />,
  failed: <AlertTriangle size={13} />,
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [showDelete, setShowDelete] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showManageFiles, setShowManageFiles] = useState(false)
  const [searchGameDone, setSearchGameDone] = useState(false)

  useEffect(() => {
    if (location.state?.openSearch) setShowSearch(true)
    if (location.state?.openEdit) setShowEdit(true)
    if (location.state?.openSearch || location.state?.openEdit) window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: game, isLoading } = useQuery<Game>({
    queryKey: ['game', Number(id)],
    queryFn: () => gamesApi.get(Number(id)),
    enabled: !!id,
  })

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  })

  const { data: releaseProfiles = [] } = useQuery({
    queryKey: ['release-profiles'],
    queryFn: releaseProfilesApi.list,
  })

  const refreshMutation = useMutation({
    mutationFn: () => gamesApi.refresh(Number(id)),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['game', Number(id)] })
        qc.invalidateQueries({ queryKey: ['games'] })
      }, 3000)
    },
  })

  const searchGameMutation = useMutation({
    mutationFn: () => gamesApi.bulkSearch([Number(id)]),
    onSuccess: () => {
      setSearchGameDone(true)
      setTimeout(() => setSearchGameDone(false), 3000)
    },
  })

  const toggleMonitored = useMutation({
    mutationFn: () => gamesApi.update(Number(id), { monitored: !game!.monitored }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['game', Number(id)] })
      qc.invalidateQueries({ queryKey: ['games'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => gamesApi.delete(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      navigate('/games')
    },
  })

  const cachedGames = qc.getQueryData<Game[]>(['games']) ?? []
  const seriesGames = game?.collection_id
    ? cachedGames.filter((g) => g.collection_id === game.collection_id && g.id !== game.id)
    : []

  if (isLoading) return <LoadingScreen />
  if (!game)
    return (
      <div className="empty-state">
        <p>Game not found</p>
      </div>
    )

  const statusColor = STATUS_COLORS[game.status] ?? 'var(--text-muted)'
  const hasFile = !!(game.rom_path || game.checksum_crc32)

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="page-toolbar">
        <button
          className="toolbar-icon-btn"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          title="Re-scrape IGDB metadata and verify ROM file on disk"
        >
          <RefreshCw
            size={18}
            style={refreshMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined}
          />
          <span>{refreshMutation.isPending ? 'Refreshing…' : refreshMutation.isSuccess ? 'Refreshed!' : 'Refresh & Scan'}</span>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => searchGameMutation.mutate()}
          disabled={searchGameMutation.isPending || searchGameDone}
          title="Automatically search indexers for this game"
        >
          <Search size={18} />
          <span>{searchGameDone ? 'Started!' : searchGameMutation.isPending ? 'Starting…' : 'Search Game'}</span>
        </button>
        <button className="toolbar-icon-btn" onClick={() => setShowSearch(true)} title="Browse and pick a release manually">
          <Search size={18} />
          <span>Interactive Search</span>
        </button>

        <span className="toolbar-sep" />

        <button
          className="toolbar-icon-btn"
          onClick={() => setShowRename(true)}
          disabled={!game.checksum_crc32}
          title={game.checksum_crc32 ? 'Preview what this ROM would be renamed to' : 'No file imported yet'}
        >
          <FileEdit size={18} />
          <span>Preview Rename</span>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => setShowManageFiles(true)}
          disabled={!hasFile}
          title={hasFile ? 'Manage the imported ROM file' : 'No file imported yet'}
        >
          <HardDrive size={18} />
          <span>Manage Files</span>
        </button>
        <button className="toolbar-icon-btn" onClick={() => setShowHistory(true)}>
          <Clock size={18} />
          <span>History</span>
        </button>

        <span className="toolbar-sep" />

        <button className="toolbar-icon-btn" onClick={() => setShowEdit(true)}>
          <Pencil size={18} />
          <span>Edit</span>
        </button>
        <button className="toolbar-icon-btn toolbar-icon-btn--danger" onClick={() => setShowDelete(true)}>
          <Trash2 size={18} />
          <span>Delete</span>
        </button>
      </div>

      {/* ── Hero ── */}
      <div className="detail-hero">
        {game.cover_url && (
          <div className="detail-backdrop" style={{ backgroundImage: `url(${game.cover_url})` }} />
        )}
        <div className="detail-backdrop-overlay" />

        {/* Rating badge — top right */}
        {game.rating != null && (
          <div className={`detail-rating-badge ${ratingClass(game.rating)}`}>
            <span className="detail-rating-score">{Math.round(game.rating)}</span>
            <span className="detail-rating-label">rating</span>
          </div>
        )}

        <div className="detail-hero-content">
          {/* Poster */}
          <div className="detail-poster-wrap">
            {game.cover_url ? (
              <img src={game.cover_url} alt={game.title} className="detail-poster" />
            ) : (
              <div className="detail-poster-placeholder">
                <ImageOff size={36} />
                <span>No cover</span>
              </div>
            )}
            <button
              className={`detail-poster-bookmark${game.monitored ? ' detail-poster-bookmark--monitored' : ''}`}
              onClick={() => toggleMonitored.mutate()}
              disabled={toggleMonitored.isPending}
              title={game.monitored ? 'Monitored — click to unmonitor' : 'Unmonitored — click to monitor'}
            >
              <Bookmark
                size={20}
                fill={game.monitored ? 'currentColor' : 'none'}
              />
            </button>
          </div>

          {/* Info column */}
          <div className="detail-info">
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', marginBottom: 10 }}>
              <Link
                to="/games"
                style={{
                  color: 'rgba(255,255,255,.55)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <ChevronLeft size={14} /> Games
              </Link>
            </div>

            <h1 className="detail-title">{game.title}</h1>

            {/* Inline summary: year · platform · region */}
            <div className="detail-meta-row">
              {game.release_year && <span>{game.release_year}</span>}
              {game.release_year && game.platform?.name && (
                <span className="detail-meta-sep">·</span>
              )}
              {game.platform?.name && <span>{game.platform.name}</span>}
              {game.region && (
                <>
                  <span className="detail-meta-sep">·</span>
                  <span>{game.region}</span>
                </>
              )}
              {game.igdb_id && (
                <>
                  <span className="detail-meta-sep">·</span>
                  <span style={{ opacity: 0.55 }}>IGDB #{game.igdb_id}</span>
                </>
              )}
            </div>

            {/* Status + monitored badges */}
            <div className="detail-status-row">
              <span
                className="detail-badge"
                style={{
                  color: statusColor,
                  background: `${statusColor}22`,
                  border: `1px solid ${statusColor}55`,
                }}
              >
                {STATUS_ICONS[game.status]}
                {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
              </span>
              {!game.monitored && (
                <span
                  className="detail-badge"
                  style={{
                    color: 'rgba(255,255,255,.4)',
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.12)',
                  }}
                >
                  <EyeOff size={12} /> Unmonitored
                </span>
              )}
            </div>

            {/* Summary */}
            {game.summary && <p className="detail-summary">{game.summary}</p>}

            {/* Tags: game modes, themes */}
            {(game.game_modes || game.themes) && (
              <div className="detail-tags">
                {parseTags(game.game_modes).map((m) => (
                  <span key={m} className="detail-tag detail-tag--mode">
                    {m}
                  </span>
                ))}
                {parseTags(game.themes).map((t) => (
                  <span key={t} className="detail-tag detail-tag--theme">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Details grid — embedded in hero */}
            <div className="detail-hero-grid">
              <HeroItem label="Platform" value={game.platform?.name ?? '—'} />
              <HeroItem label="Release Year" value={game.release_year?.toString() ?? '—'} />
              <HeroItem label="Region" value={game.region || '—'} />
              <HeroItem
                label="Status"
                value={game.status.charAt(0).toUpperCase() + game.status.slice(1)}
              />
              <HeroItem label="Monitored" value={game.monitored ? 'Yes' : 'No'} />
              <HeroItem label="IGDB ID" value={game.igdb_id?.toString() ?? '—'} />
              <HeroItem label="Added" value={formatDate(game.added_at)} />
              <HeroItem label="Updated" value={formatDate(game.updated_at)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── File Information ── */}
      {hasFile && (
        <div className="detail-body">
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <span className="card-title">File Information</span>
            </div>
            <table className="detail-files-table">
              <thead>
                <tr>
                  <th className="col-prop">Property</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {(game.relative_rom_path || game.rom_path) && (
                  <tr>
                    <td className="col-prop">Path</td>
                    <td className="col-val-mono">{game.relative_rom_path ?? game.rom_path}</td>
                  </tr>
                )}
                {game.file_size != null && (
                  <tr>
                    <td className="col-prop">Size</td>
                    <td>{formatBytes(game.file_size)}</td>
                  </tr>
                )}
                {game.checksum_crc32 && (
                  <tr>
                    <td className="col-prop">CRC32</td>
                    <td className="col-val-mono">{game.checksum_crc32}</td>
                  </tr>
                )}
                {game.checksum_md5 && (
                  <tr>
                    <td className="col-prop">MD5</td>
                    <td className="col-val-mono">{game.checksum_md5}</td>
                  </tr>
                )}
                {game.checksum_sha1 && (
                  <tr>
                    <td className="col-prop">SHA1</td>
                    <td className="col-val-mono">{game.checksum_sha1}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── More in this series ── */}
      {seriesGames.length > 0 && (
        <div className="detail-body">
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <span className="card-title">
                More in {game.collection_name ? `"${game.collection_name}"` : 'this series'}
              </span>
            </div>
            <div className="detail-similar-row">
              {seriesGames.map((sg) => (
                <Link key={sg.id} to={`/games/${sg.id}`} className="detail-similar-card">
                  {sg.cover_url ? (
                    <img src={sg.cover_url} alt={sg.title} className="detail-similar-cover" />
                  ) : (
                    <div className="detail-similar-cover detail-similar-cover--empty">
                      <ImageOff size={20} />
                    </div>
                  )}
                  <div className="detail-similar-name">{sg.title}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Similar Games ── */}
      {parseSimilarGames(game.similar_games).length > 0 && (
        <div className="detail-body">
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header" style={{ padding: '12px 16px' }}>
              <span className="card-title">Similar Games</span>
            </div>
            <div className="detail-similar-row">
              {parseSimilarGames(game.similar_games).map((sg, i) => (
                <div key={i} className="detail-similar-card">
                  {sg.cover_url ? (
                    <img src={sg.cover_url} alt={sg.name ?? ''} className="detail-similar-cover" />
                  ) : (
                    <div className="detail-similar-cover detail-similar-cover--empty">
                      <ImageOff size={20} />
                    </div>
                  )}
                  <div className="detail-similar-name">{sg.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showEdit && (
        <EditGameModal
          game={game}
          platforms={platforms}
          releaseProfiles={releaseProfiles}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['game', Number(id)] })
            qc.invalidateQueries({ queryKey: ['games'] })
            setShowEdit(false)
          }}
        />
      )}

      {showSearch && (
        <ManualSearchModal
          gameId={Number(id)}
          gameTitle={game.title}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showRename && (
        <RenamePreviewModal
          gameIds={[Number(id)]}
          onClose={() => setShowRename(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['game', Number(id)] })
            qc.invalidateQueries({ queryKey: ['games'] })
            setShowRename(false)
          }}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="Delete Game"
          message={`Remove "${game.title}" from Romarr? The ROM file will NOT be deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {showHistory && (
        <GameHistoryModal gameId={Number(id)} gameTitle={game.title} onClose={() => setShowHistory(false)} />
      )}

      {showManageFiles && (
        <ManageFilesModal
          game={game}
          onClose={() => setShowManageFiles(false)}
          onFileDeleted={() => {
            qc.invalidateQueries({ queryKey: ['game', Number(id)] })
            qc.invalidateQueries({ queryKey: ['games'] })
            setShowManageFiles(false)
          }}
        />
      )}
    </div>
  )
}

function ratingClass(score: number): string {
  if (score >= 75) return 'detail-rating-badge--good'
  if (score >= 50) return 'detail-rating-badge--ok'
  return 'detail-rating-badge--bad'
}

function parseTags(json: string | undefined): string[] {
  if (!json) return []
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

function parseSimilarGames(json: string | undefined): { name?: string; cover_url?: string }[] {
  if (!json) return []
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

function HeroItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-hero-grid-item">
      <div className="detail-hero-grid-key">{label}</div>
      <div className="detail-hero-grid-val">{value}</div>
    </div>
  )
}

function EditGameModal({
  game,
  platforms,
  releaseProfiles,
  onClose,
  onSaved,
}: {
  game: Game
  platforms: import('../../types').Platform[]
  releaseProfiles: ReleaseProfile[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(game.title)
  const [platformId, setPlatformId] = useState(game.platform_id)
  const [region, setRegion] = useState(game.region)
  const [monitored, setMonitored] = useState(game.monitored)
  const [tags, setTags] = useState(game.tags ?? '')
  const [releaseProfileId, setReleaseProfileId] = useState<number | null>(
    game.release_profile_id ?? null
  )
  const [confirmSave, setConfirmSave] = useState(false)

  const saveMut = useMutation({
    mutationFn: () =>
      gamesApi.update(game.id, {
        title,
        platform_id: platformId,
        region,
        monitored,
        tags: tags || null,
        release_profile_id: releaseProfileId,
      }),
    onSuccess: onSaved,
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edit Game</span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Platform</label>
            <select
              className="form-control"
              value={platformId}
              onChange={(e) => setPlatformId(Number(e.target.value))}
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Region</label>
            <input
              className="form-control"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={{ maxWidth: 200 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tags</label>
            <input
              className="form-control"
              placeholder="action, rpg, favorite…"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <div className="form-hint">Comma-separated.</div>
          </div>
          {releaseProfiles.length > 0 && (
            <div className="form-group">
              <label className="form-label">Release Profile</label>
              <select
                className="form-control"
                value={releaseProfileId ?? ''}
                onChange={(e) =>
                  setReleaseProfileId(e.target.value ? Number(e.target.value) : null)
                }
                style={{ maxWidth: 280 }}
              >
                <option value="">Platform / global default</option>
                {releaseProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="form-hint">
                Override the platform's default profile for this game.
              </div>
            </div>
          )}
          <div className="toggle-row" style={{ borderBottom: 'none' }}>
            <div className="toggle-label">Monitored</div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={monitored}
                onChange={(e) => setMonitored(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
        <div
          className="modal-footer"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
        >
          {confirmSave ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--warning, #f39c12)',
                  background: 'rgba(243,156,18,0.1)',
                  border: '1px solid rgba(243,156,18,0.3)',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}
              >
                Manual edits to Title, Platform, or Region may conflict with DAT-matched data and
                could affect future CRC matching. Continue?
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmSave(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending ? 'Saving…' : 'Confirm Changes'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => setConfirmSave(true)}>
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GameHistoryModal({
  gameId,
  gameTitle,
  onClose,
}: {
  gameId: number
  gameTitle: string
  onClose: () => void
}) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['history', gameId],
    queryFn: () => historyApi.list({ game_id: gameId, limit: 100 }),
  })

  const eventLabel: Record<string, string> = {
    grabbed: 'Grabbed',
    downloadComplete: 'Download Complete',
    downloadFailed: 'Download Failed',
    importFailed: 'Import Failed',
    imported: 'Imported',
    deleted: 'Deleted',
    ignored: 'Ignored',
  }
  const eventColor: Record<string, string> = {
    grabbed: 'var(--info)',
    downloadComplete: 'var(--success)',
    downloadFailed: 'var(--danger)',
    importFailed: 'var(--danger)',
    imported: 'var(--success)',
    deleted: 'var(--warning)',
    ignored: 'var(--text-muted)',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">History — {gameTitle}</span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              No history for this game yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Event</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Source</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Indexer</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <td style={{ padding: '9px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(item.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '9px 16px' }}>
                      <span style={{ color: eventColor[item.event_type] ?? 'var(--text-secondary)', fontWeight: 500 }}>
                        {eventLabel[item.event_type] ?? item.event_type}
                      </span>
                    </td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.source_title || '—'}
                    </td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>
                      {item.indexer || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function ManageFilesModal({
  game,
  onClose,
  onFileDeleted,
}: {
  game: Game
  onClose: () => void
  onFileDeleted: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteFileMutation = useMutation({
    mutationFn: () => gamesApi.deleteFile(game.id),
    onSuccess: onFileDeleted,
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Manage Files — {game.title}</span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
            <tbody>
              {(game.relative_rom_path || game.rom_path) && (
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)', width: 90 }}>Path</td>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                    {game.relative_rom_path ?? game.rom_path}
                  </td>
                </tr>
              )}
              {game.file_size != null && (
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>Size</td>
                  <td style={{ padding: '8px 0' }}>{formatBytes(game.file_size)}</td>
                </tr>
              )}
              {game.checksum_crc32 && (
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>CRC32</td>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11 }}>{game.checksum_crc32}</td>
                </tr>
              )}
              {game.checksum_md5 && (
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>MD5</td>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11 }}>{game.checksum_md5}</td>
                </tr>
              )}
              {game.checksum_sha1 && (
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>SHA1</td>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11 }}>{game.checksum_sha1}</td>
                </tr>
              )}
            </tbody>
          </table>

          {confirmDelete ? (
            <div style={{ background: 'rgba(220,53,69,.08)', border: '1px solid rgba(220,53,69,.3)', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>
                Delete the ROM file from disk? The game record will be kept in Wanted state.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteFileMutation.mutate()}
                  disabled={deleteFileMutation.isPending}
                >
                  {deleteFileMutation.isPending ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Delete File
            </button>
          )}
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
