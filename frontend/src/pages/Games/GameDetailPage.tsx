import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  Search,
  Trash2,
  ImageOff,
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
  Settings,
  Info,
  CheckCircle,
  X,
  Link2,
} from 'lucide-react'
import { gamesApi } from '../../api/games'
import { historyApi } from '../../api/history'
import { igdbApi } from '../../api/igdb'
import { rawgApi } from '../../api/rawg'
import { platformsApi } from '../../api/platforms'
import { releaseProfilesApi } from '../../api/profiles'
import ConfirmModal from '../../components/ConfirmModal'
import LoadingScreen from '../../components/LoadingScreen'
import ManualSearchModal from './ManualSearchModal'
import QuickAddModal from './QuickAddModal'
import RenamePreviewModal from './RenamePreviewModal'
import type { Game, IgdbSearchResult, RawgSearchResult, ReleaseProfile } from '../../types'

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
  const [showIgdbRelink, setShowIgdbRelink] = useState(false)
  const [searchGameDone, setSearchGameDone] = useState(false)
  const [quickAddGame, setQuickAddGame] = useState<IgdbSearchResult | null>(null)

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

  const { data: allGames = [] } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: () => gamesApi.list({}),
  })

  const { data: metadataConfig } = useQuery<{ metadata_provider: string }>({
    queryKey: ['rawg-config'],
    queryFn: () =>
      fetch('/api/v1/system/config/rawg')
        .then((r) => r.json())
        .then((d) => ({ metadata_provider: d.metadata_provider ?? 'igdb' })),
    staleTime: 5 * 60 * 1000,
  })
  const activeProvider = metadataConfig?.metadata_provider ?? 'igdb'

  const { data: collectionGames = [] } = useQuery<IgdbSearchResult[]>({
    queryKey: ['igdb-collection', game?.collection_id],
    queryFn: () => igdbApi.collection(game!.collection_id!),
    enabled: !!game?.collection_id,
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

  const libraryByIgdbId = new Map(
    allGames.filter((g) => g.igdb_id != null).map((g) => [g.igdb_id!, g])
  )

  // Map profile region names → IGDB region codes
  const REGION_TO_IGDB: Record<string, number[]> = {
    USA: [2],
    Europe: [1, 3, 4],
    Japan: [5],
    World: [8],
    'USA, Europe': [1, 2, 3, 4],
    'USA, Japan': [2, 5],
  }
  const defaultProfile = releaseProfiles.find((p) => p.is_default) ?? releaseProfiles[0]
  const allowedIgdbRegions = new Set<number>([8]) // worldwide always included
  for (const r of defaultProfile?.region_priority ?? []) {
    for (const code of REGION_TO_IGDB[r] ?? []) allowedIgdbRegions.add(code)
  }
  const userPlatformIgdbIds = new Set(
    platforms.map((p) => p.igdb_platform_id).filter(Boolean) as number[]
  )

  const seriesGames = collectionGames.filter((cg) => {
    if (cg.igdb_id === game?.igdb_id) return false
    const regionOk = !cg.regions?.length || cg.regions.some((r) => allowedIgdbRegions.has(r))
    const platformOk =
      !cg.platform_ids?.length || cg.platform_ids.some((id) => userPlatformIgdbIds.has(id))
    return regionOk && platformOk
  })

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
          <span>
            {refreshMutation.isPending
              ? 'Refreshing…'
              : refreshMutation.isSuccess
                ? 'Refreshed!'
                : 'Refresh & Scan'}
          </span>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => setShowIgdbRelink(true)}
          title={`Manually pick a different ${activeProvider.toUpperCase()} match for this game`}
        >
          <Link2 size={18} />
          <span>Fix {activeProvider.toUpperCase()} Match</span>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => searchGameMutation.mutate()}
          disabled={searchGameMutation.isPending || searchGameDone}
          title="Automatically search indexers for this game"
        >
          <Search size={18} />
          <span>
            {searchGameDone
              ? 'Started!'
              : searchGameMutation.isPending
                ? 'Starting…'
                : 'Search Game'}
          </span>
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={() => setShowSearch(true)}
          title="Browse and pick a release manually"
        >
          <Search size={18} />
          <span>Interactive Search</span>
        </button>

        <span className="toolbar-sep" />

        <button
          className="toolbar-icon-btn"
          onClick={() => setShowRename(true)}
          disabled={!game.checksum_crc32}
          title={
            game.checksum_crc32
              ? 'Preview what this ROM would be renamed to'
              : 'No file imported yet'
          }
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
        <button
          className="toolbar-icon-btn toolbar-icon-btn--danger"
          onClick={() => setShowDelete(true)}
        >
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

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <button
                className={`detail-title-bookmark${game.monitored ? ' detail-title-bookmark--monitored' : ''}`}
                onClick={() => toggleMonitored.mutate()}
                disabled={toggleMonitored.isPending}
                title={
                  game.monitored
                    ? 'Monitored — click to unmonitor'
                    : 'Unmonitored — click to monitor'
                }
              >
                <Bookmark size={38} fill={game.monitored ? 'currentColor' : 'none'} />
              </button>
              <h1 className="detail-title" style={{ margin: 0 }}>
                {game.title}
              </h1>
            </div>

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
              {(game.relative_rom_path || game.rom_path) && (
                <HeroItem
                  label="Path"
                  value={game.relative_rom_path ?? game.rom_path!}
                  mono
                  fullWidth
                />
              )}
              <HeroItem
                label="Status"
                value={game.status.charAt(0).toUpperCase() + game.status.slice(1)}
              />
              <HeroItem label="Platform" value={game.platform?.name ?? '—'} />
              {game.file_size != null ? (
                <HeroItem label="Size" value={formatBytes(game.file_size)} />
              ) : (
                <HeroItem label="Release Year" value={game.release_year?.toString() ?? '—'} />
              )}
              <HeroItem label="Region" value={game.region || '—'} />
              {game.file_size != null && (
                <HeroItem label="Release Year" value={game.release_year?.toString() ?? '—'} />
              )}
              <HeroItem label="IGDB ID" value={game.igdb_id?.toString() ?? '—'} />
              <HeroItem label="Added" value={formatDate(game.added_at)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Files ── */}
      {hasFile && (
        <FilesSection
          game={game}
          onFileDeleted={() => {
            qc.invalidateQueries({ queryKey: ['game', Number(id)] })
            qc.invalidateQueries({ queryKey: ['games'] })
          }}
        />
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
              {seriesGames.map((sg) => {
                const libraryGame = libraryByIgdbId.get(sg.igdb_id)
                return libraryGame ? (
                  <Link
                    key={sg.igdb_id}
                    to={`/games/${libraryGame.id}`}
                    className="detail-similar-card"
                  >
                    <div className="detail-similar-cover-wrap">
                      {sg.cover_url ? (
                        <img src={sg.cover_url} alt={sg.name} className="detail-similar-cover" />
                      ) : (
                        <div className="detail-similar-cover detail-similar-cover--empty">
                          <ImageOff size={20} />
                        </div>
                      )}
                      <span
                        className="detail-series-badge detail-series-badge--owned"
                        title="In your library"
                      >
                        <CheckCircle size={14} />
                      </span>
                    </div>
                    <div className="detail-similar-name">{sg.name}</div>
                    {sg.platforms.length > 0 && (
                      <div className="detail-similar-platform">{sg.platforms.join(', ')}</div>
                    )}
                  </Link>
                ) : (
                  <button
                    key={sg.igdb_id}
                    className="detail-similar-card detail-similar-card--btn"
                    onClick={() => setQuickAddGame(sg)}
                  >
                    <div className="detail-similar-cover-wrap">
                      {sg.cover_url ? (
                        <img src={sg.cover_url} alt={sg.name} className="detail-similar-cover" />
                      ) : (
                        <div className="detail-similar-cover detail-similar-cover--empty">
                          <ImageOff size={20} />
                        </div>
                      )}
                    </div>
                    <div className="detail-similar-name">{sg.name}</div>
                    {sg.platforms.length > 0 && (
                      <div className="detail-similar-platform">{sg.platforms.join(', ')}</div>
                    )}
                  </button>
                )
              })}
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
        <GameHistoryModal
          gameId={Number(id)}
          gameTitle={game.title}
          onClose={() => setShowHistory(false)}
        />
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
      {quickAddGame && <QuickAddModal game={quickAddGame} onClose={() => setQuickAddGame(null)} />}

      {showIgdbRelink && (
        <MetadataRelinkModal
          gameId={Number(id)}
          gameTitle={game.title}
          provider={activeProvider}
          currentIgdbId={game.igdb_id}
          currentRawgId={game.rawg_id}
          onClose={() => setShowIgdbRelink(false)}
          onLinked={() => {
            qc.invalidateQueries({ queryKey: ['game', Number(id)] })
            qc.invalidateQueries({ queryKey: ['games'] })
            setShowIgdbRelink(false)
          }}
        />
      )}
    </div>
  )
}

function parseRevision(path: string): string {
  const filename = path.split('/').pop() ?? ''
  const rev = filename.match(/\(Rev ([^)]+)\)/)
  if (rev) return `Rev ${rev[1]}`
  const v = filename.match(/\(v(\d[^)]*)\)/)
  if (v) return `v${v[1]}`
  return '—'
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

function HeroItem({
  label,
  value,
  mono,
  fullWidth,
}: {
  label: string
  value: string
  mono?: boolean
  fullWidth?: boolean
}) {
  return (
    <div className={`detail-hero-grid-item${fullWidth ? ' detail-hero-grid-item--full' : ''}`}>
      <div className="detail-hero-grid-key">{label}</div>
      <div className={`detail-hero-grid-val${mono ? ' detail-hero-grid-val--mono' : ''}`}>
        {value}
      </div>
    </div>
  )
}

const ALL_FILE_COLS = [
  { key: 'size', label: 'Size' },
  { key: 'region', label: 'Region' },
  { key: 'revision', label: 'Revision' },
  { key: 'dat_matched', label: 'DAT Matched' },
] as const

function FilesSection({ game, onFileDeleted }: { game: Game; onFileDeleted: () => void }) {
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(['size', 'region', 'revision', 'dat_matched'])
  )
  const [showColMenu, setShowColMenu] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  const deleteMutation = useMutation({
    mutationFn: () => gamesApi.deleteFile(game.id),
    onSuccess: () => {
      setDeleteConfirm(false)
      onFileDeleted()
    },
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node))
        setShowColMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filePath = game.relative_rom_path ?? game.rom_path ?? ''
  const revision = parseRevision(filePath)
  const isDatMatched = !!game.checksum_crc32

  function toggleCol(key: string) {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="detail-body">
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <span className="card-title">Files</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Relative Path</th>
                {ALL_FILE_COLS.filter((c) => visibleCols.has(c.key)).map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th style={{ width: 32 }}>
                  <div
                    ref={colMenuRef}
                    style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
                  >
                    <button
                      className="btn-icon"
                      onClick={() => setShowColMenu((v) => !v)}
                      title="Configure columns"
                    >
                      <Settings size={14} />
                    </button>
                    {showColMenu && (
                      <div className="toolbar-dropdown-panel" style={{ minWidth: 160 }}>
                        {ALL_FILE_COLS.map((c) => (
                          <label key={c.key} className="toolbar-dropdown-item">
                            <input
                              type="checkbox"
                              checked={visibleCols.has(c.key)}
                              onChange={() => toggleCol(c.key)}
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{filePath || '—'}</td>
                {visibleCols.has('size') && (
                  <td>{game.file_size != null ? formatBytes(game.file_size) : '—'}</td>
                )}
                {visibleCols.has('region') && <td>{game.region || '—'}</td>}
                {visibleCols.has('revision') && <td className="text-muted text-sm">{revision}</td>}
                {visibleCols.has('dat_matched') && (
                  <td>
                    {isDatMatched ? (
                      <span
                        style={{
                          color: 'var(--success)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <CheckCircle size={13} /> Yes
                      </span>
                    ) : (
                      <span className="text-muted">No</span>
                    )}
                  </td>
                )}
                <td>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <button
                      className="btn-icon"
                      onClick={() => setShowDetails(true)}
                      title="File details"
                    >
                      <Info size={14} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDeleteConfirm(true)}
                      title="Delete file from disk"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showDetails && <FileDetailsModal game={game} onClose={() => setShowDetails(false)} />}

      {deleteConfirm && (
        <ConfirmModal
          title="Delete File"
          message={`Delete "${filePath.split('/').pop()}" from disk? The game record will remain in Wanted state.`}
          confirmLabel="Delete File"
          danger
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

function FileDetailsModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const rows: { label: string; value: string; mono?: boolean }[] = [
    ...(game.rom_path ? [{ label: 'Full Path', value: game.rom_path, mono: true }] : []),
    ...(game.file_size != null ? [{ label: 'Size', value: formatBytes(game.file_size) }] : []),
    ...(game.checksum_crc32 ? [{ label: 'CRC32', value: game.checksum_crc32, mono: true }] : []),
    ...(game.checksum_md5 ? [{ label: 'MD5', value: game.checksum_md5, mono: true }] : []),
    ...(game.checksum_sha1 ? [{ label: 'SHA1', value: game.checksum_sha1, mono: true }] : []),
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">File Details</span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.label}
                  style={{
                    borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none',
                  }}
                >
                  <td
                    style={{
                      padding: '9px 16px 9px 0',
                      color: 'var(--text-muted)',
                      width: 90,
                      verticalAlign: 'top',
                    }}
                  >
                    {row.label}
                  </td>
                  <td
                    style={{
                      padding: '9px 0',
                      ...(row.mono
                        ? { fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }
                        : {}),
                    }}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
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
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    Event
                  </th>
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    Source
                  </th>
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    Indexer
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <td
                      style={{
                        padding: '9px 16px',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(item.date).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '9px 16px' }}>
                      <span
                        style={{
                          color: eventColor[item.event_type] ?? 'var(--text-secondary)',
                          fontWeight: 500,
                        }}
                      >
                        {eventLabel[item.event_type] ?? item.event_type}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '9px 16px',
                        color: 'var(--text-secondary)',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
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
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

type MetadataResult = (IgdbSearchResult & { rawg_id?: undefined }) | RawgSearchResult

function MetadataRelinkModal({
  gameId,
  gameTitle,
  provider,
  currentIgdbId,
  currentRawgId,
  onClose,
  onLinked,
}: {
  gameId: number
  gameTitle: string
  provider: string
  currentIgdbId?: number
  currentRawgId?: number
  onClose: () => void
  onLinked: () => void
}) {
  const [query, setQuery] = useState(gameTitle)
  const [results, setResults] = useState<MetadataResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<MetadataResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const providerLabel = provider.toUpperCase()
  const currentExternalId = provider === 'igdb' ? currentIgdbId : currentRawgId

  function externalId(r: MetadataResult): number {
    return provider === 'igdb' ? (r as IgdbSearchResult).igdb_id : (r as RawgSearchResult).rawg_id
  }

  const linkMutation = useMutation({
    mutationFn: (result: MetadataResult) =>
      gamesApi.linkMetadata(gameId, provider, externalId(result)),
    onSuccess: onLinked,
    onError: () => setError(`Failed to link — check ${providerLabel} credentials and try again.`),
  })

  async function handleSearch() {
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setSearched(true)
    setSelected(null)
    setError('')
    try {
      const data =
        provider === 'igdb' ? await igdbApi.search(trimmed) : await rawgApi.search(trimmed)
      setResults(data as MetadataResult[])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            Fix {providerLabel} Match — {gameTitle}
          </span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ padding: '16px 20px' }}>
          {currentExternalId && !selected && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                marginBottom: 12,
                padding: '7px 10px',
                background: 'rgba(255,255,255,.04)',
                borderRadius: 5,
              }}
            >
              Currently linked to {providerLabel} #{currentExternalId}. Search below to pick a
              different match.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              ref={inputRef}
              className="form-control"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={`Search ${providerLabel}…`}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={loading || !query.trim()}
            >
              <Search size={14} />
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {selected && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'rgba(123,104,238,.12)',
                border: '1px solid rgba(123,104,238,.35)',
                borderRadius: 6,
                marginBottom: 14,
              }}
            >
              {selected.cover_url && (
                <img
                  src={selected.cover_url}
                  alt={selected.name}
                  style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 3 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {[selected.release_year, selected.platforms.slice(0, 3).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                  {' · '}
                  {providerLabel} #{externalId(selected)}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>
                Change
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => linkMutation.mutate(selected)}
                disabled={linkMutation.isPending}
              >
                {linkMutation.isPending ? 'Linking…' : 'Confirm Link'}
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--danger)',
                marginBottom: 10,
                padding: '7px 10px',
                background: 'rgba(220,53,69,.08)',
                border: '1px solid rgba(220,53,69,.25)',
                borderRadius: 5,
              }}
            >
              {error}
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--text-muted)',
                padding: '24px 0',
                fontSize: 14,
              }}
            >
              No results found.
            </div>
          )}

          {results.length > 0 && (
            <div
              style={{
                maxHeight: 360,
                overflowY: 'auto',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 6,
              }}
            >
              {results.map((r, i) => {
                const eid = externalId(r)
                const isCurrent = eid === currentExternalId
                const isSelected = selected !== null && eid === externalId(selected)
                return (
                  <button
                    key={eid}
                    onClick={() => setSelected(r)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '10px 12px',
                      background: isSelected
                        ? 'rgba(123,104,238,.15)'
                        : i % 2 === 0
                          ? 'rgba(255,255,255,.02)'
                          : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 48,
                        flexShrink: 0,
                        borderRadius: 3,
                        overflow: 'hidden',
                        background: 'rgba(255,255,255,.07)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {r.cover_url ? (
                        <img
                          src={r.cover_url}
                          alt={r.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <ImageOff size={16} style={{ opacity: 0.3 }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                        {r.name}
                        {isCurrent && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 11,
                              color: 'var(--accent)',
                              fontWeight: 400,
                            }}
                          >
                            current
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {[r.release_year, r.platforms.slice(0, 4).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    {r.rating != null && (
                      <span
                        className={`detail-rating-badge ${ratingClass(r.rating)}`}
                        style={{ fontSize: 12, padding: '3px 8px' }}
                      >
                        {r.rating}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
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
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}
          >
            <tbody>
              {(game.relative_rom_path || game.rom_path) && (
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)', width: 90 }}>Path</td>
                  <td
                    style={{
                      padding: '8px 0',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      wordBreak: 'break-all',
                    }}
                  >
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
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11 }}>
                    {game.checksum_crc32}
                  </td>
                </tr>
              )}
              {game.checksum_md5 && (
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>MD5</td>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11 }}>
                    {game.checksum_md5}
                  </td>
                </tr>
              )}
              {game.checksum_sha1 && (
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--text-muted)' }}>SHA1</td>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 11 }}>
                    {game.checksum_sha1}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {confirmDelete ? (
            <div
              style={{
                background: 'rgba(220,53,69,.08)',
                border: '1px solid rgba(220,53,69,.3)',
                borderRadius: 6,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>
                Delete the ROM file from disk? The game record will be kept in Wanted state.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
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
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
