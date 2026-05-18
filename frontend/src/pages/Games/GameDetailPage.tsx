import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  Search,
  Trash2,
  ImageOff,
  Eye,
  EyeOff,
  CheckCircle2,
  Download,
  AlertTriangle,
  Gamepad2,
  Pencil,
  X,
} from 'lucide-react'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import { releaseProfilesApi } from '../../api/profiles'
import ConfirmModal from '../../components/ConfirmModal'
import ManualSearchModal from './ManualSearchModal'
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
  const qc = useQueryClient()
  const [showDelete, setShowDelete] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

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

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" /> Loading…
      </div>
    )
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

            {/* Actions */}
            <div className="detail-actions">
              <button className="btn btn-primary" onClick={() => setShowSearch(true)}>
                <Search size={13} /> Search
              </button>
              <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
                <Pencil size={13} /> Edit
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => toggleMonitored.mutate()}
                disabled={toggleMonitored.isPending}
              >
                {game.monitored ? <EyeOff size={13} /> : <Eye size={13} />}
                {game.monitored ? 'Unmonitor' : 'Monitor'}
              </button>
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
                <Trash2 size={13} /> Delete
              </button>
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
    game.release_profile_id ?? null,
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
              <div className="form-hint">Override the platform's default profile for this game.</div>
            </div>
          )}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={monitored}
                  onChange={(e) => setMonitored(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
              <span className="form-label" style={{ margin: 0 }}>
                Monitored
              </span>
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
