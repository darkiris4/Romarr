import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { gamesApi } from '../../api/games'
import type { Platform } from '../../types'

interface Props {
  platforms: Platform[]
  onClose: () => void
  onAdded: () => void
}

export default function AddGameModal({ platforms, onClose, onAdded }: Props) {
  const [title, setTitle] = useState('')
  const [platformId, setPlatformId] = useState(platforms[0]?.id?.toString() ?? '')
  const [region, setRegion] = useState('USA')
  const [year, setYear] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => gamesApi.create({
      title: title.trim(),
      platform_id: parseInt(platformId),
      region,
      release_year: year ? parseInt(year) : undefined,
    }),
    onSuccess: onAdded,
    onError: () => setError('Failed to add game.'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (!platformId) { setError('Select a platform.'); return }
    setError('')
    mutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Game</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="form-group">
              <label className="form-label">Title</label>
              <input
                className="form-control"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Chrono Trigger"
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Platform</label>
                <select
                  className="form-control"
                  value={platformId}
                  onChange={e => setPlatformId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {platforms.filter(p => p.enabled).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Region</label>
                <select
                  className="form-control"
                  value={region}
                  onChange={e => setRegion(e.target.value)}
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
            <div className="form-group">
              <label className="form-label">Release Year (optional)</label>
              <input
                className="form-control"
                type="number"
                value={year}
                onChange={e => setYear(e.target.value)}
                placeholder="e.g. 1995"
                min={1970}
                max={2030}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
