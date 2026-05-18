import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { delayProfilesApi, releaseProfilesApi } from '../../api/profiles'
import type { DelayProfile, ReleaseProfile } from '../../types'

// ── Shared helpers ────────────────────────────────────────────────────────────

const KNOWN_REGIONS = ['USA', 'World', 'Europe', 'Japan', 'Germany', 'France', 'Spain', 'Italy', 'Australia', 'Brazil', 'Korea', 'China', 'Netherlands', 'Sweden', 'Norway', 'Denmark']

function blankRelease(): Omit<ReleaseProfile, 'id' | 'is_default' | 'created_at' | 'updated_at'> {
  return {
    name: '',
    region_priority: ['USA', 'World', 'Europe', 'Japan'],
    prefer_no_intro: true,
    accept_hacks: false,
    accept_unlicensed: false,
    preferred_formats: [],
  }
}

function blankDelay(): Omit<DelayProfile, 'id' | 'is_default' | 'created_at' | 'updated_at'> {
  return {
    name: '',
    preferred_protocol: 'any',
    usenet_delay: 0,
    torrent_delay: 0,
    bypass_if_only_one: true,
    tags: '',
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilesPage() {
  const [tab, setTab] = useState<'release' | 'delay'>('release')

  return (
    <div>
      <div className="settings-section-title">Profiles</div>
      <div className="settings-section-desc">
        Release profiles control which ROMs Romarr will grab. Delay profiles control when grabs
        happen and protocol preference.
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn${tab === 'release' ? ' active' : ''}`}
          onClick={() => setTab('release')}
        >
          Release Profiles
        </button>
        <button
          className={`tab-btn${tab === 'delay' ? ' active' : ''}`}
          onClick={() => setTab('delay')}
        >
          Delay Profiles
        </button>
      </div>

      {tab === 'release' && <ReleaseProfilesTab />}
      {tab === 'delay' && <DelayProfilesTab />}
    </div>
  )
}

// ── Release Profiles Tab ──────────────────────────────────────────────────────

function ReleaseProfilesTab() {
  const qc = useQueryClient()
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['release-profiles'],
    queryFn: releaseProfilesApi.list,
  })
  const [editId, setEditId] = useState<number | 'new' | null>(null)

  const deleteMut = useMutation({
    mutationFn: releaseProfilesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release-profiles'] }),
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" />
      </div>
    )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setEditId('new')}>
          <Plus size={14} /> Add Profile
        </button>
      </div>

      {editId === 'new' && (
        <ReleaseProfileEditor
          initial={blankRelease()}
          onClose={() => setEditId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['release-profiles'] })
            setEditId(null)
          }}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        <table className="activity-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Region Priority</th>
              <th>No-Intro</th>
              <th>Hacks</th>
              <th>Unlicensed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <>
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setEditId(editId === p.id ? null : p.id)}
                >
                  <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>
                    {p.name}
                    {p.is_default && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: 'var(--accent)',
                          background: 'rgba(123,104,238,.15)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        Default
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {p.region_priority.slice(0, 3).join(', ')}
                    {p.region_priority.length > 3 ? '…' : ''}
                  </td>
                  <td>
                    <StatusDot active={p.prefer_no_intro} />
                  </td>
                  <td>
                    <StatusDot active={p.accept_hacks} />
                  </td>
                  <td>
                    <StatusDot active={p.accept_unlicensed} />
                  </td>
                  <td className="col-action" onClick={(e) => e.stopPropagation()}>
                    {!p.is_default && (
                      <button
                        className="btn-icon"
                        onClick={() => deleteMut.mutate(p.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
                {editId === p.id && (
                  <tr key={`edit-${p.id}`}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <ReleaseProfileEditor
                        profileId={p.id}
                        initial={p}
                        onClose={() => setEditId(null)}
                        onSaved={() => {
                          qc.invalidateQueries({ queryKey: ['release-profiles'] })
                          setEditId(null)
                        }}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ReleaseEditorProps {
  profileId?: number
  initial: Omit<ReleaseProfile, 'id' | 'is_default' | 'created_at' | 'updated_at'> | ReleaseProfile
  onClose: () => void
  onSaved: () => void
}

function ReleaseProfileEditor({ profileId, initial, onClose, onSaved }: ReleaseEditorProps) {
  const [name, setName] = useState(initial.name)
  const [regionPriority, setRegionPriority] = useState<string[]>(initial.region_priority)
  const [preferNoIntro, setPreferNoIntro] = useState(initial.prefer_no_intro)
  const [acceptHacks, setAcceptHacks] = useState(initial.accept_hacks)
  const [acceptUnlicensed, setAcceptUnlicensed] = useState(initial.accept_unlicensed)
  const [preferredFormats, setPreferredFormats] = useState<string[]>(initial.preferred_formats)
  const [newFormat, setNewFormat] = useState('')

  const createMut = useMutation({
    mutationFn: () =>
      releaseProfilesApi.create({
        name,
        region_priority: regionPriority,
        prefer_no_intro: preferNoIntro,
        accept_hacks: acceptHacks,
        accept_unlicensed: acceptUnlicensed,
        preferred_formats: preferredFormats,
      }),
    onSuccess: onSaved,
  })

  const updateMut = useMutation({
    mutationFn: () =>
      releaseProfilesApi.update(profileId!, {
        name,
        region_priority: regionPriority,
        prefer_no_intro: preferNoIntro,
        accept_hacks: acceptHacks,
        accept_unlicensed: acceptUnlicensed,
        preferred_formats: preferredFormats,
      }),
    onSuccess: onSaved,
  })

  const isPending = createMut.isPending || updateMut.isPending

  function moveRegion(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= regionPriority.length) return
    const arr = [...regionPriority]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    setRegionPriority(arr)
  }

  function addRegion(region: string) {
    if (!region || regionPriority.includes(region)) return
    setRegionPriority((prev) => [...prev, region])
  }

  function removeRegion(region: string) {
    setRegionPriority((prev) => prev.filter((r) => r !== region))
  }

  function addFormat() {
    const ext = newFormat.trim().replace(/^\.?/, '.')
    if (ext === '.' || preferredFormats.includes(ext)) return
    setPreferredFormats((prev) => [...prev, ext])
    setNewFormat('')
  }

  function save() {
    profileId ? updateMut.mutate() : createMut.mutate()
  }

  const availableRegions = KNOWN_REGIONS.filter((r) => !regionPriority.includes(r))

  return (
    <div
      className="card"
      style={{ margin: '8px 0', border: '1px solid var(--accent)', borderRadius: 8 }}
    >
      <div className="card-header">
        <span className="card-title">{profileId ? 'Edit Profile' : 'New Release Profile'}</span>
        <button className="btn-icon" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">Name</label>
        <input
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. USA First, No Hacks"
          style={{ maxWidth: 320 }}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="form-label">Region Priority</label>
        <div className="form-hint" style={{ marginBottom: 8 }}>
          Drag to reorder. Romarr picks the highest-priority region when multiple releases are
          available.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 340 }}>
          {regionPriority.map((r, idx) => (
            <div
              key={r}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--bg-secondary)',
                borderRadius: 6,
                padding: '4px 8px',
              }}
            >
              <span style={{ flex: 1, fontSize: 13 }}>
                #{idx + 1} {r}
              </span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveRegion(idx, -1)}
                disabled={idx === 0}
                style={{ padding: 2 }}
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveRegion(idx, 1)}
                disabled={idx === regionPriority.length - 1}
                style={{ padding: 2 }}
              >
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => removeRegion(r)}
                style={{ padding: 2 }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        {availableRegions.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {availableRegions.map((r) => (
              <button
                key={r}
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => addRegion(r)}
              >
                + {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Preferred Formats</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {preferredFormats.map((f) => (
            <span key={f} className="format-chip format-chip--on">
              <span className="format-chip-toggle">{f}</span>
              <button
                type="button"
                className="format-chip-remove"
                onClick={() => setPreferredFormats((prev) => prev.filter((x) => x !== f))}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-control"
            value={newFormat}
            onChange={(e) => setNewFormat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFormat())}
            placeholder=".zip, .nes…"
            style={{ maxWidth: 140, fontFamily: 'monospace' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addFormat}
            disabled={!newFormat.trim()}
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="form-hint">Leave empty to accept any format.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <ToggleRow
          label="Prefer No-Intro Verified"
          hint="Prioritise releases matched to a No-Intro DAT entry."
          checked={preferNoIntro}
          onChange={setPreferNoIntro}
        />
        <ToggleRow
          label="Accept Hacks & Translations"
          hint="Allow releases tagged (Hack), (Translation), or (Pirate)."
          checked={acceptHacks}
          onChange={setAcceptHacks}
        />
        <ToggleRow
          label="Accept Unlicensed"
          hint="Allow releases tagged (Unl) — unofficial cartridges."
          checked={acceptUnlicensed}
          onChange={setAcceptUnlicensed}
          last
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim() || isPending}>
          {isPending ? 'Saving…' : profileId ? 'Save Changes' : 'Add Profile'}
        </button>
      </div>
    </div>
  )
}

// ── Delay Profiles Tab ────────────────────────────────────────────────────────

function DelayProfilesTab() {
  const qc = useQueryClient()
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['delay-profiles'],
    queryFn: delayProfilesApi.list,
  })
  const [editId, setEditId] = useState<number | 'new' | null>(null)

  const deleteMut = useMutation({
    mutationFn: delayProfilesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delay-profiles'] }),
  })

  if (isLoading)
    return (
      <div className="loading-page">
        <div className="spinner" />
      </div>
    )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setEditId('new')}>
          <Plus size={14} /> Add Profile
        </button>
      </div>

      {editId === 'new' && (
        <DelayProfileEditor
          initial={blankDelay()}
          onClose={() => setEditId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['delay-profiles'] })
            setEditId(null)
          }}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        <table className="activity-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Protocol</th>
              <th>Usenet Delay</th>
              <th>Torrent Delay</th>
              <th>Tags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <>
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setEditId(editId === p.id ? null : p.id)}
                >
                  <td style={{ fontWeight: 500, color: 'var(--text-white)' }}>
                    {p.name}
                    {p.is_default && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: 'var(--accent)',
                          background: 'rgba(123,104,238,.15)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        Default
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {p.preferred_protocol}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {p.usenet_delay === 0 ? 'Immediate' : `${p.usenet_delay} min`}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {p.torrent_delay === 0 ? 'Immediate' : `${p.torrent_delay} min`}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {p.tags || <em>All games</em>}
                  </td>
                  <td className="col-action" onClick={(e) => e.stopPropagation()}>
                    {!p.is_default && (
                      <button
                        className="btn-icon"
                        onClick={() => deleteMut.mutate(p.id)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
                {editId === p.id && (
                  <tr key={`edit-${p.id}`}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <DelayProfileEditor
                        profileId={p.id}
                        initial={p}
                        onClose={() => setEditId(null)}
                        onSaved={() => {
                          qc.invalidateQueries({ queryKey: ['delay-profiles'] })
                          setEditId(null)
                        }}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface DelayEditorProps {
  profileId?: number
  initial: Omit<DelayProfile, 'id' | 'is_default' | 'created_at' | 'updated_at'> | DelayProfile
  onClose: () => void
  onSaved: () => void
}

function DelayProfileEditor({ profileId, initial, onClose, onSaved }: DelayEditorProps) {
  const [name, setName] = useState(initial.name)
  const [protocol, setProtocol] = useState(initial.preferred_protocol)
  const [usenetDelay, setUsenetDelay] = useState(initial.usenet_delay)
  const [torrentDelay, setTorrentDelay] = useState(initial.torrent_delay)
  const [bypassIfOne, setBypassIfOne] = useState(initial.bypass_if_only_one)
  const [tags, setTags] = useState(initial.tags)

  const createMut = useMutation({
    mutationFn: () =>
      delayProfilesApi.create({
        name,
        preferred_protocol: protocol as DelayProfile['preferred_protocol'],
        usenet_delay: usenetDelay,
        torrent_delay: torrentDelay,
        bypass_if_only_one: bypassIfOne,
        tags,
      }),
    onSuccess: onSaved,
  })

  const updateMut = useMutation({
    mutationFn: () =>
      delayProfilesApi.update(profileId!, {
        name,
        preferred_protocol: protocol as DelayProfile['preferred_protocol'],
        usenet_delay: usenetDelay,
        torrent_delay: torrentDelay,
        bypass_if_only_one: bypassIfOne,
        tags,
      }),
    onSuccess: onSaved,
  })

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div
      className="card"
      style={{ margin: '8px 0', border: '1px solid var(--accent)', borderRadius: 8 }}
    >
      <div className="card-header">
        <span className="card-title">{profileId ? 'Edit Delay Profile' : 'New Delay Profile'}</span>
        <button className="btn-icon" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="form-group">
        <label className="form-label">Name</label>
        <input
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Usenet First"
          style={{ maxWidth: 320 }}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="form-label">Preferred Protocol</label>
        <select
          className="form-control"
          value={protocol}
          onChange={(e) => setProtocol(e.target.value as DelayProfile['preferred_protocol'])}
          style={{ maxWidth: 200 }}
        >
          <option value="any">No Preference</option>
          <option value="usenet">Usenet First</option>
          <option value="torrent">Torrent First</option>
        </select>
        <div className="form-hint">Results of the preferred protocol will be sorted first.</div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div className="form-group">
          <label className="form-label">Usenet Delay (minutes)</label>
          <input
            className="form-control"
            type="number"
            min={0}
            value={usenetDelay}
            onChange={(e) => setUsenetDelay(Number(e.target.value))}
            style={{ maxWidth: 120 }}
          />
          <div className="form-hint">0 = grab immediately.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Torrent Delay (minutes)</label>
          <input
            className="form-control"
            type="number"
            min={0}
            value={torrentDelay}
            onChange={(e) => setTorrentDelay(Number(e.target.value))}
            style={{ maxWidth: 120 }}
          />
          <div className="form-hint">0 = grab immediately.</div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Tags</label>
        <input
          className="form-control"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="e.g. nintendo, sega"
          style={{ maxWidth: 360 }}
        />
        <div className="form-hint">
          Games with a matching tag use this profile. Leave empty to use as the default for all
          untagged games.
        </div>
      </div>

      <ToggleRow
        label="Bypass Delay If Only One Result"
        hint="Grab immediately if only one release is found, regardless of delay."
        checked={bypassIfOne}
        onChange={setBypassIfOne}
        last
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => profileId ? updateMut.mutate() : createMut.mutate()} disabled={!name.trim() || isPending}>
          {isPending ? 'Saving…' : profileId ? 'Save Changes' : 'Add Profile'}
        </button>
      </div>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: active ? 'var(--success)' : 'var(--border)',
      }}
    />
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  last,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  last?: boolean
}) {
  return (
    <div className="toggle-row" style={last ? { borderBottom: 'none' } : {}}>
      <div>
        <div className="toggle-label">{label}</div>
        <div className="toggle-hint">{hint}</div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  )
}
