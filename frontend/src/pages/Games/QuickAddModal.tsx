import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageOff, X } from 'lucide-react'
import { gamesApi } from '../../api/games'
import { platformsApi } from '../../api/platforms'
import { releaseProfilesApi } from '../../api/profiles'
import type { IgdbSearchResult, Platform } from '../../types'

interface Props {
  game: IgdbSearchResult
  onClose: () => void
}


export default function QuickAddModal({ game, onClose }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [platformId, setPlatformId] = useState('')
  const [region, setRegion] = useState('USA')
  const [monitored, setMonitored] = useState(true)
  const [error, setError] = useState('')

  const { data: platforms = [] } = useQuery({ queryKey: ['platforms'], queryFn: platformsApi.list })
  const { data: profiles = [] } = useQuery({ queryKey: ['release-profiles'], queryFn: releaseProfilesApi.list })

  const defaultProfile = profiles.find((p) => p.is_default) ?? profiles[0]

  // Platforms the user has configured that also match this game's IGDB platform IDs
  const matchedPlatforms: Platform[] = platforms.filter(
    (p) => p.igdb_platform_id != null && game.platform_ids.includes(p.igdb_platform_id!)
  )
  const displayPlatforms = matchedPlatforms.length > 0 ? matchedPlatforms : platforms.filter((p) => p.enabled)

  // Pre-select platform and region from the default profile once data loads
  useEffect(() => {
    if (!defaultProfile || !displayPlatforms.length) return

    // Pick region: first in profile's priority list
    const profileRegion = defaultProfile.region_priority[0] ?? 'USA'
    setRegion(profileRegion)

    // Pick platform: first match
    if (!platformId) setPlatformId(displayPlatforms[0].id.toString())
  }, [defaultProfile?.id, displayPlatforms.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const addMutation = useMutation({
    mutationFn: () =>
      gamesApi.create({
        title: game.name,
        platform_id: parseInt(platformId),
        region,
        monitored,
        igdb_id: game.igdb_id,
        cover_url: game.cover_url,
        release_year: game.release_year,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['games'] })
      navigate(`/games/${created.id}`)
    },
    onError: () => setError('Failed to add game.'),
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal quick-add-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add to Library</span>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="quick-add-body">
          <div className="quick-add-cover">
            {game.cover_url ? (
              <img src={game.cover_url} alt={game.name} />
            ) : (
              <div className="quick-add-cover--empty">
                <ImageOff size={28} />
              </div>
            )}
          </div>

          <div className="quick-add-info">
            <div className="quick-add-title">{game.name}</div>
            {game.release_year && <div className="quick-add-year">{game.release_year}</div>}
            {game.summary && <p className="quick-add-summary">{game.summary}</p>}

            {error && (
              <div className="alert alert-danger" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label">Platform</label>
                <select
                  className="form-control"
                  value={platformId}
                  onChange={(e) => setPlatformId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {displayPlatforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {matchedPlatforms.length === 0 && (
                  <div className="form-hint">No configured platforms match this game's IGDB data</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Region</label>
                <select
                  className="form-control"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option>USA</option>
                  <option>Europe</option>
                  <option>Japan</option>
                  <option>World</option>
                  <option>USA, Europe</option>
                  <option>USA, Japan</option>
                </select>
              </div>
            </div>

            <label className="form-check" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={monitored}
                onChange={(e) => setMonitored(e.target.checked)}
              />
              <span style={{ marginLeft: 8 }}>Monitored</span>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!platformId || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? 'Adding…' : `Add ${game.name}`}
          </button>
        </div>
      </div>
    </div>
  )
}
