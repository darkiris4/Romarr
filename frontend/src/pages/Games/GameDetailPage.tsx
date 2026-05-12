import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Search, Trash2, ImageOff,
  Eye, EyeOff, CheckCircle2, Download, AlertTriangle, Gamepad2,
} from 'lucide-react'
import { gamesApi } from '../../api/games'
import ConfirmModal from '../../components/ConfirmModal'
import type { Game } from '../../types'

const STATUS_COLORS: Record<string, string> = {
  imported:    'var(--success)',
  wanted:      'var(--accent)',
  grabbed:     'var(--info)',
  downloading: 'var(--info)',
  failed:      'var(--danger)',
}
const STATUS_ICONS: Record<string, React.ReactNode> = {
  imported:    <CheckCircle2 size={13} />,
  wanted:      <Gamepad2 size={13} />,
  grabbed:     <Download size={13} />,
  downloading: <Download size={13} />,
  failed:      <AlertTriangle size={13} />,
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showDelete, setShowDelete] = useState(false)

  const { data: game, isLoading } = useQuery<Game>({
    queryKey: ['game', Number(id)],
    queryFn: () => gamesApi.get(Number(id)),
    enabled: !!id,
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

  const searchMutation = useMutation({
    mutationFn: () => gamesApi.search(Number(id)),
  })

  if (isLoading) return <div className="loading-page"><div className="spinner" /> Loading…</div>
  if (!game) return <div className="empty-state"><p>Game not found</p></div>

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
              <Link to="/games" style={{ color: 'rgba(255,255,255,.55)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <ChevronLeft size={14} /> Games
              </Link>
            </div>

            <h1 className="detail-title">{game.title}</h1>

            {/* Inline summary: year · platform · region */}
            <div className="detail-meta-row">
              {game.release_year && <span>{game.release_year}</span>}
              {game.release_year && game.platform?.name && <span className="detail-meta-sep">·</span>}
              {game.platform?.name && <span>{game.platform.name}</span>}
              {game.region && <><span className="detail-meta-sep">·</span><span>{game.region}</span></>}
              {game.igdb_id && <><span className="detail-meta-sep">·</span><span style={{ opacity: .55 }}>IGDB #{game.igdb_id}</span></>}
            </div>

            {/* Status + monitored badges */}
            <div className="detail-status-row">
              <span className="detail-badge" style={{
                color: statusColor,
                background: `${statusColor}22`,
                border: `1px solid ${statusColor}55`,
              }}>
                {STATUS_ICONS[game.status]}
                {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
              </span>
              {!game.monitored && (
                <span className="detail-badge" style={{
                  color: 'rgba(255,255,255,.4)',
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)',
                }}>
                  <EyeOff size={12} /> Unmonitored
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="detail-actions">
              <button className="btn btn-primary" onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending}>
                <Search size={13} />
                {searchMutation.isPending ? 'Searching…' : 'Search'}
              </button>
              <button className="btn btn-secondary" onClick={() => toggleMonitored.mutate()} disabled={toggleMonitored.isPending}>
                {game.monitored ? <EyeOff size={13} /> : <Eye size={13} />}
                {game.monitored ? 'Unmonitor' : 'Monitor'}
              </button>
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
                <Trash2 size={13} /> Delete
              </button>
            </div>

            {/* Details grid — embedded in hero */}
            <div className="detail-hero-grid">
              <HeroItem label="Platform"     value={game.platform?.name ?? '—'} />
              <HeroItem label="Release Year" value={game.release_year?.toString() ?? '—'} />
              <HeroItem label="Region"       value={game.region || '—'} />
              <HeroItem label="Status"       value={game.status.charAt(0).toUpperCase() + game.status.slice(1)} />
              <HeroItem label="Monitored"    value={game.monitored ? 'Yes' : 'No'} />
              <HeroItem label="IGDB ID"      value={game.igdb_id?.toString() ?? '—'} />
              <HeroItem label="Added"        value={formatDate(game.added_at)} />
              <HeroItem label="Updated"      value={formatDate(game.updated_at)} />
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

function HeroItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-hero-grid-item">
      <div className="detail-hero-grid-key">{label}</div>
      <div className="detail-hero-grid-val">{value}</div>
    </div>
  )
}
