import { useState } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'

interface FormatItem { id: number; label: string; enabled: boolean }
interface RegionItem { id: number; label: string; code: string; enabled: boolean }

const DEFAULT_FORMATS: FormatItem[] = [
  { id: 1, label: '.zip',  enabled: true },
  { id: 2, label: '.7z',   enabled: true },
  { id: 3, label: '.rar',  enabled: true },
  { id: 4, label: '.nes',  enabled: true },
  { id: 5, label: '.sfc',  enabled: true },
  { id: 6, label: '.smc',  enabled: true },
  { id: 7, label: '.gba',  enabled: true },
  { id: 8, label: '.nds',  enabled: true },
  { id: 9, label: '.3ds',  enabled: true },
  { id: 10, label: '.iso', enabled: true },
  { id: 11, label: '.bin', enabled: true },
  { id: 12, label: '.cue', enabled: true },
  { id: 13, label: '.chd', enabled: true },
  { id: 14, label: '.rom', enabled: false },
]

const DEFAULT_REGIONS: RegionItem[] = [
  { id: 1, label: 'USA',        code: 'USA',      enabled: true },
  { id: 2, label: 'Europe',     code: 'Europe',   enabled: true },
  { id: 3, label: 'World',      code: 'World',    enabled: true },
  { id: 4, label: 'Japan',      code: 'Japan',    enabled: true },
  { id: 5, label: 'Australia',  code: 'Australia',enabled: true },
  { id: 6, label: 'Germany',    code: 'Germany',  enabled: false },
  { id: 7, label: 'France',     code: 'France',   enabled: false },
  { id: 8, label: 'Spain',      code: 'Spain',    enabled: false },
  { id: 9, label: 'Italy',      code: 'Italy',    enabled: false },
  { id: 10, label: 'Korea',     code: 'Korea',    enabled: false },
  { id: 11, label: 'China',     code: 'China',    enabled: false },
  { id: 12, label: 'Brazil',    code: 'Brazil',   enabled: false },
]

let nextFormatId = 100
let nextRegionId = 200

export default function ProfilesPage() {
  const [formats, setFormats] = useState<FormatItem[]>(DEFAULT_FORMATS)
  const [regions, setRegions] = useState<RegionItem[]>(DEFAULT_REGIONS)
  const [newFormat, setNewFormat] = useState('')
  const [preferVerified, setPreferVerified] = useState(true)
  const [preferNoIntro, setPreferNoIntro] = useState(true)
  const [skipHacks, setSkipHacks] = useState(false)
  const [skipUnlicensed, setSkipUnlicensed] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggleFormat(id: number) {
    setFormats(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f))
  }
  function removeFormat(id: number) {
    setFormats(prev => prev.filter(f => f.id !== id))
  }
  function addFormat() {
    const ext = newFormat.trim().replace(/^\.?/, '.')
    if (!ext || ext === '.') return
    if (formats.some(f => f.label === ext)) { setNewFormat(''); return }
    setFormats(prev => [...prev, { id: nextFormatId++, label: ext, enabled: true }])
    setNewFormat('')
  }

  function toggleRegion(id: number) {
    setRegions(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  function moveRegion(id: number, dir: -1 | 1) {
    setRegions(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const enabledFormats = formats.filter(f => f.enabled)
  const enabledRegions = regions.filter(r => r.enabled)

  return (
    <div>
      <div className="settings-section-title">Profiles</div>
      <div className="settings-section-desc">
        Define which ROM formats and regions are acceptable, and set priorities for automatic searching.
      </div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>

        {/* ── Release Preferences ── */}
        <div className="settings-section-title" style={{ marginTop: 8 }}>Release Preferences</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="toggle-row">
            <div>
              <div className="toggle-label">Prefer No-Intro Verified</div>
              <div className="toggle-hint">Prioritise releases that are matched to a No-Intro DAT entry over unmatched ones.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={preferNoIntro} onChange={e => setPreferNoIntro(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Prefer Checksummed Releases</div>
              <div className="toggle-hint">Choose releases with a known-good CRC32 over releases that can't be verified.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={preferVerified} onChange={e => setPreferVerified(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Skip Hacks &amp; Fan Translations</div>
              <div className="toggle-hint">Ignore releases with "(Hack)" or "(Translation)" in the No-Intro title.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={skipHacks} onChange={e => setSkipHacks(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row" style={{ borderBottom: 'none' }}>
            <div>
              <div className="toggle-label">Skip Unlicensed</div>
              <div className="toggle-hint">Ignore releases tagged "(Unl)" — unofficial or unlicensed cartridges.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={skipUnlicensed} onChange={e => setSkipUnlicensed(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* ── ROM Formats ── */}
        <div className="settings-section-title">ROM Formats</div>
        <div className="settings-section-desc" style={{ marginBottom: 16 }}>
          Enable the file extensions Romarr will accept during import and automatic search.
          {enabledFormats.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
              {enabledFormats.length} enabled
            </span>
          )}
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {formats.map(f => (
              <span key={f.id} className={`format-chip${f.enabled ? ' format-chip--on' : ''}`}>
                <button type="button" className="format-chip-toggle" onClick={() => toggleFormat(f.id)}>
                  {f.label}
                </button>
                {/* allow removing custom entries only */}
                {f.id >= 100 && (
                  <button type="button" className="format-chip-remove" onClick={() => removeFormat(f.id)}>
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-control"
              value={newFormat}
              onChange={e => setNewFormat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFormat())}
              placeholder=".ext"
              style={{ maxWidth: 140, fontFamily: 'monospace' }}
            />
            <button type="button" className="btn btn-secondary" onClick={addFormat} disabled={!newFormat.trim()}>
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* ── Region Priority ── */}
        <div className="settings-section-title">Region Priority</div>
        <div className="settings-section-desc" style={{ marginBottom: 16 }}>
          Drag to reorder. Romarr picks the highest-priority enabled region when multiple releases are available.
          {enabledRegions.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
              {enabledRegions.length} enabled
            </span>
          )}
        </div>
        <div className="card" style={{ padding: 0, marginBottom: 24 }}>
          <table className="activity-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Region</th>
                <th style={{ width: 60 }}>Code</th>
                <th style={{ width: 80 }}>Priority</th>
                <th style={{ width: 80 }}>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r, idx) => (
                <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.45 }}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button type="button" className="btn-icon" onClick={() => moveRegion(r.id, -1)} disabled={idx === 0} style={{ padding: 2 }}>
                        <GripVertical size={12} style={{ transform: 'rotate(90deg)' }} />
                      </button>
                      <button type="button" className="btn-icon" onClick={() => moveRegion(r.id, 1)} disabled={idx === regions.length - 1} style={{ padding: 2 }}>
                        <GripVertical size={12} style={{ transform: 'rotate(-90deg)' }} />
                      </button>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-white)', fontWeight: r.enabled ? 500 : 400 }}>{r.label}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{r.code}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {r.enabled ? `#${enabledRegions.indexOf(r) + 1}` : '—'}
                  </td>
                  <td>
                    <label className="toggle">
                      <input type="checkbox" checked={r.enabled} onChange={() => toggleRegion(r.id)} />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  )
}
