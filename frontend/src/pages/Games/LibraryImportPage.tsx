import { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Database,
  FileQuestion,
  Clock,
  X,
} from 'lucide-react'
import { libraryApi, type ScannedROM, type ScanPreview } from '../../api/library'
import { platformsApi } from '../../api/platforms'

type Step = 'path' | 'scanning' | 'preview' | 'importing' | 'done'

const KNOWN_REGIONS = new Set([
  'USA',
  'Europe',
  'Japan',
  'World',
  'Australia',
  'Brazil',
  'Korea',
  'China',
  'Taiwan',
  'Spain',
  'France',
  'Germany',
  'Italy',
  'Netherlands',
  'Asia',
  'Scandinavia',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Poland',
  'Russia',
  'Canada',
  'Mexico',
  'Argentina',
  'Portugal',
  'Greece',
  'Turkey',
  'Hong Kong',
  'UK',
  'England',
  'Latin America',
  'South Africa',
  'India',
  'Unknown',
])

function isStructuralTag(tag: string): boolean {
  if (/^Rev\s+\S+$/i.test(tag)) return true
  if (/^v\d[\d.]*$/i.test(tag)) return true
  if (/^[A-Z][a-z](?:-[A-Za-z]+)?(?:,[A-Z][a-z](?:-[A-Za-z]+)?)*$/.test(tag)) return true
  return tag
    .split(',')
    .map((p) => p.trim())
    .every((p) => KNOWN_REGIONS.has(p))
}

const RETAIL_TAG = '__retail__'

function extractContentTags(filename: string): string[] {
  const roundTags = [...filename.matchAll(/\(([^)]+)\)/g)]
    .map((m) => m[1].trim())
    .filter((tag) => !isStructuralTag(tag))
  const squareTags = [...filename.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim())
  return [...squareTags, ...roundTags]
}

const SOURCE_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  dat: { label: 'DAT match', color: 'var(--success)', icon: <Database size={11} /> },
  filename: { label: 'Filename', color: 'var(--warning)', icon: <FileQuestion size={11} /> },
  unmatched: { label: 'No platform', color: 'var(--text-muted)', icon: <AlertCircle size={11} /> },
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (options.length === 0) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`import-filter-pill${selected.size > 0 ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {selected.size > 0 && <span className="import-filter-count">{selected.size}</span>}
      </button>
      {open && (
        <div className="filter-dropdown-panel">
          {options.map((opt) => (
            <label key={opt.value} className="filter-dropdown-item">
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => {
                  const next = new Set(selected)
                  if (next.has(opt.value)) next.delete(opt.value)
                  else next.add(opt.value)
                  onChange(next)
                }}
              />
              {opt.label}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              className="filter-dropdown-clear"
              onClick={() => {
                onChange(new Set())
                setOpen(false)
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function LibraryImportPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState<Step>('path')
  const [folderPath, setFolderPath] = useState('')
  const [hintPlatformId, setHintPlatformId] = useState<number | undefined>()
  const [preview, setPreview] = useState<ScanPreview | null>(null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  type FilterKey = 'new' | 'dat' | 'filename' | 'ambiguous' | 'exists'
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set())
  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      const n = new Set(prev)
      if (n.has(key)) {
        n.delete(key)
      } else {
        n.add(key)
      }
      return n
    })
  }
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set())
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())

  const { data: platforms = [] } = useQuery({ queryKey: ['platforms'], queryFn: platformsApi.list })
  const { data: recentFolders = [] } = useQuery({
    queryKey: ['recent-scan-folders'],
    queryFn: libraryApi.recentFolders,
  })

  const { data: scanStatus } = useQuery({
    queryKey: ['scan-status'],
    queryFn: libraryApi.scanStatus,
    refetchInterval: step === 'scanning' ? 800 : false,
    enabled: step === 'scanning',
  })

  const { data: importStatusData } = useQuery({
    queryKey: ['import-status'],
    queryFn: libraryApi.importStatus,
    refetchInterval: step === 'importing' ? 800 : false,
  })

  // Recover from a page refresh mid-import
  useEffect(() => {
    if (!importStatusData) return
    if (importStatusData.running && step !== 'importing') {
      setStep('importing')
    } else if (importStatusData.done && importStatusData.result && step === 'importing') {
      setResult(importStatusData.result)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['games'] })
    }
  }, [importStatusData, step, qc])

  useEffect(() => {
    if (step !== 'scanning' || !scanStatus?.done || scanStatus.running) return
    if (scanStatus.error) {
      setScanError(scanStatus.error)
      setStep('path')
    } else if (scanStatus.result) {
      setPreview(scanStatus.result)
      setStep('preview')
    }
  }, [scanStatus, step])

  const deleteRecentMutation = useMutation({
    mutationFn: (path: string) => libraryApi.deleteRecentFolder(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recent-scan-folders'] }),
  })

  const scanMutation = useMutation({
    mutationFn: (pathOverride?: string) =>
      libraryApi.scanStart((pathOverride ?? folderPath).trim(), hintPlatformId),
    onSuccess: (data, pathOverride) => {
      if (data.error) {
        setScanError(data.error)
        return
      }
      setScanError(null)
      if (pathOverride) setFolderPath(pathOverride)
      setActiveFilters(new Set())
      setSelectedPlatforms(new Set())
      setSelectedRegions(new Set())
      setSelectedTypes(new Set())
      qc.invalidateQueries({ queryKey: ['recent-scan-folders'] })
      setStep('scanning')
    },
  })

  const importMutation = useMutation({
    mutationFn: () =>
      libraryApi.importStart(folderPath.trim(), {
        platform_hint_id: hintPlatformId,
        platform_overrides: overrides,
        selected_keys:
          activeFilters.size === 0 &&
          selectedPlatforms.size === 0 &&
          selectedRegions.size === 0 &&
          selectedTypes.size === 0
            ? undefined
            : eligibleKeys,
      }),
    onSuccess: () => setStep('importing'),
  })

  const filteredRoms =
    preview?.roms.filter((rom) => {
      if (activeFilters.has('new') && rom.already_exists) return false
      if (activeFilters.has('exists') && !rom.already_exists) return false
      if (activeFilters.has('dat') && rom.match_source !== 'dat') return false
      if (activeFilters.has('filename') && rom.match_source !== 'filename') return false
      if (activeFilters.has('ambiguous') && (rom.platform_id !== null || overrides[rom.path]))
        return false
      if (selectedPlatforms.size > 0) {
        const pid = String(overrides[rom.path] ?? rom.platform_id ?? '')
        if (!selectedPlatforms.has(pid)) return false
      }
      if (selectedRegions.size > 0) {
        const romRegions = (rom.region || '').split(',').map((r) => r.trim())
        if (!romRegions.includes('World') && !romRegions.some((r) => selectedRegions.has(r)))
          return false
      }
      if (selectedTypes.size > 0) {
        const tags = extractContentTags(rom.filename)
        const isRetail = tags.length === 0
        if (!(isRetail && selectedTypes.has(RETAIL_TAG)) && !tags.some((t) => selectedTypes.has(t)))
          return false
      }
      return true
    }) ?? []

  // Use "path::filename" as the unique key per ROM entry so multi-ROM ZIPs are
  // handled correctly — only the specific inner files the user selected get imported,
  // not every variant in the ZIP. Backend re-scans and does its own exists check.
  const eligibleKeys = filteredRoms
    .filter((r) => r.platform_id !== null || overrides[r.path])
    .map((r) => `${r.path}::${r.filename}`)

  const toImport = filteredRoms.filter(
    (r) => !r.already_exists && (r.platform_id !== null || overrides[r.path])
  ).length

  const platformOptions = useMemo(() => {
    const seen = new Map<string, string>()
    preview?.roms.forEach((r) => {
      if (r.platform_id === null) return
      const name =
        r.platform_name ??
        platforms.find((p) => p.id === r.platform_id)?.name ??
        `#${r.platform_id}`
      seen.set(String(r.platform_id), name)
    })
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([v, l]) => ({ value: v, label: l }))
  }, [preview, platforms])

  const regionOptions = useMemo(() => {
    const regions = new Set<string>()
    preview?.roms.forEach((r) => {
      if (!r.region || r.region === 'Unknown') return
      r.region.split(',').forEach((part) => {
        const t = part.trim()
        if (t) regions.add(t)
      })
    })
    return [...regions].sort().map((r) => ({ value: r, label: r }))
  }, [preview])

  const typeOptions = useMemo(() => {
    if (!preview) return []
    const counts = new Map<string, number>()
    let retailCount = 0
    preview.roms.forEach((r) => {
      const tags = extractContentTags(r.filename)
      if (tags.length === 0) {
        retailCount++
      } else {
        tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1))
      }
    })
    const tagOptions = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ value: tag, label: `${tag} (${count.toLocaleString()})` }))
    return [
      ...(retailCount > 0
        ? [{ value: RETAIL_TAG, label: `Retail (${retailCount.toLocaleString()})` }]
        : []),
      ...tagOptions,
    ]
  }, [preview])

  const pct = scanStatus?.total ? Math.round((scanStatus.processed / scanStatus.total) * 100) : 0

  /* ── Step 1: path ── */
  if (step === 'path')
    return (
      <div className="import-page">
        <p className="import-page-hint">
          Import an existing organized library to add games to Romarr
        </p>
        <div className="import-page-form">
          <div className="form-group">
            <label className="form-label">Folder Path</label>
            <input
              className="form-control"
              value={folderPath}
              onChange={(e) => {
                setFolderPath(e.target.value)
                setScanError(null)
              }}
              placeholder="/home/user/roms"
              autoFocus
              onKeyDown={(e) =>
                e.key === 'Enter' && folderPath.trim() && scanMutation.mutate(undefined)
              }
            />
            <div className="form-hint">
              Romarr walks the folder recursively. Any subdirectory layout works — filenames and
              folder names don't need to follow any convention.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Platform Hint{' '}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            <select
              className="form-control"
              value={hintPlatformId ?? ''}
              onChange={(e) => setHintPlatformId(e.target.value ? +e.target.value : undefined)}
            >
              <option value="">Auto-detect by file extension</option>
              {platforms
                .filter((p) => p.enabled)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <div className="form-hint">
              Set this if your folder contains ROMs for a single platform and the auto-detect is
              ambiguous (e.g. <code>.bin</code> files).
            </div>
          </div>

          <div
            className="card"
            style={{
              background: 'rgba(53,197,244,.06)',
              borderLeft: '3px solid var(--info)',
              padding: '12px 16px',
              boxShadow: 'none',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--info)' }}>
                Tip: load No-Intro DAT files for best results.
              </strong>
              <br />
              Without DATs, Romarr identifies ROMs by filename. With DATs, it uses CRC32 hashes so
              filenames, languages, and revisions are all identified correctly — even for renamed or
              mislabelled files. DAT files can be uploaded in Settings → Media Management.
            </div>
          </div>

          {scanError && (
            <div className="alert alert-danger">
              <AlertCircle size={14} /> {scanError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={() => scanMutation.mutate(undefined)}
              disabled={!folderPath.trim() || scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                'Starting…'
              ) : (
                <>
                  <FolderOpen size={14} /> Scan
                </>
              )}
            </button>
          </div>

          {recentFolders.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div className="settings-section-title" style={{ marginBottom: 12 }}>
                Recent Folders
              </div>
              <div className="card" style={{ padding: 0 }}>
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recentFolders.map((f, i) => (
                      <tr key={i}>
                        <td
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 13,
                            color: 'var(--text-white)',
                          }}
                        >
                          {f.path}
                        </td>
                        <td className="col-action">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => scanMutation.mutate(f.path)}
                            disabled={scanMutation.isPending}
                          >
                            <Clock size={12} /> Scan
                          </button>
                        </td>
                        <td className="col-action">
                          <button
                            className="btn btn-icon btn-sm"
                            onClick={() => deleteRecentMutation.mutate(f.path)}
                            disabled={deleteRecentMutation.isPending}
                            title="Remove"
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    )

  /* ── Step 2: scanning ── */
  if (step === 'scanning')
    return (
      <div className="import-page">
        <p className="import-page-hint">Scanning folder…</p>
        <div className="import-page-form">
          <div className="card">
            <div
              style={{
                marginBottom: 12,
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}
            >
              {scanStatus?.folder ?? folderPath}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              <span>Identifying ROMs…</span>
              <span>
                {scanStatus?.total
                  ? `${scanStatus.processed.toLocaleString()} / ${scanStatus.total.toLocaleString()}`
                  : scanStatus?.processed
                    ? `${scanStatus.processed.toLocaleString()} files`
                    : 'Counting files…'}
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: 'rgba(255,255,255,.08)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: scanStatus?.total ? `${pct}%` : '100%',
                  background: 'var(--accent)',
                  borderRadius: 3,
                  transition: scanStatus?.total ? 'width .4s ease' : undefined,
                  animation: scanStatus?.total
                    ? undefined
                    : 'progress-indeterminate 1.4s ease infinite',
                }}
              />
            </div>
            {(scanStatus?.total ?? 0) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{pct}%</div>
            )}
          </div>
        </div>
      </div>
    )

  /* ── Step 3: preview ── */
  if (step === 'preview' && preview) {
    const newCount = preview.roms.filter((r) => !r.already_exists).length
    const filterDefs: { key: FilterKey; label: string; count: number; color?: string }[] = [
      { key: 'new', label: 'New', count: newCount, color: 'var(--accent)' },
      { key: 'dat', label: 'DAT', count: preview.dat_matches, color: 'var(--success)' },
      {
        key: 'filename',
        label: 'Filename',
        count: preview.filename_matches,
        color: 'var(--warning)',
      },
      {
        key: 'ambiguous',
        label: 'Ambiguous',
        count: preview.ambiguous,
        color: preview.ambiguous ? 'var(--warning)' : undefined,
      },
      { key: 'exists', label: 'Exists', count: preview.already_imported },
    ]
    return (
      <div className="import-page">
        <div className="import-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => setStep('path')}>
            ← Back
          </button>
          <div className="import-filter-pills">
            <button
              className={`import-filter-pill${activeFilters.size === 0 ? ' active' : ''}`}
              onClick={() => setActiveFilters(new Set())}
            >
              <span>All</span>
              <span className="import-filter-count">{preview.roms.length.toLocaleString()}</span>
            </button>
            {filterDefs.map((f) => {
              const isActive = activeFilters.has(f.key)
              return (
                <button
                  key={f.key}
                  className={`import-filter-pill${isActive ? ' active' : ''}`}
                  onClick={() => toggleFilter(f.key)}
                >
                  <span style={{ color: isActive ? undefined : f.color }}>{f.label}</span>
                  <span className="import-filter-count">{f.count.toLocaleString()}</span>
                </button>
              )
            })}
          </div>
          <MultiSelect
            label="Platform"
            options={platformOptions}
            selected={selectedPlatforms}
            onChange={setSelectedPlatforms}
          />
          <MultiSelect
            label="Region"
            options={regionOptions}
            selected={selectedRegions}
            onChange={setSelectedRegions}
          />
          <MultiSelect
            label="Type"
            options={typeOptions}
            selected={selectedTypes}
            onChange={setSelectedTypes}
          />
          <button
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || toImport === 0}
          >
            {importMutation.isPending ? (
              'Starting…'
            ) : (
              <>
                <ArrowRight size={14} /> Import {toImport.toLocaleString()} ROM
                {toImport !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>

        <div className="import-stat-strip">
          {[
            { label: 'Files scanned', value: preview.total_files_seen },
            { label: 'DAT matches', value: preview.dat_matches, color: 'var(--success)' },
            { label: 'Filename guess', value: preview.filename_matches, color: 'var(--warning)' },
            {
              label: 'Ambiguous',
              value: preview.ambiguous,
              color: preview.ambiguous ? 'var(--warning)' : undefined,
            },
            { label: 'Already exists', value: preview.already_imported },
          ].map((s) => (
            <div key={s.label} className="import-stat">
              <div className="import-stat-value" style={{ color: s.color ?? 'var(--text-white)' }}>
                {s.value.toLocaleString()}
              </div>
              <div className="import-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {activeFilters.has('ambiguous') && preview.ambiguous > 0 && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <AlertCircle size={14} />
            Assign a platform to each file below, or go back and set a Platform Hint and re-scan.
          </div>
        )}

        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <table className="import-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Platform</th>
                <th>Region</th>
                <th>Identified by</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoms.map((rom, i) => (
                <ROMRow
                  key={i}
                  rom={rom}
                  platforms={platforms}
                  override={overrides[rom.path]}
                  onOverride={(pid) => setOverrides((prev) => ({ ...prev, [rom.path]: pid }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  /* ── Step 4: importing ── */
  if (step === 'importing')
    return (
      <div className="import-page">
        <p className="import-page-hint">Importing ROMs…</p>
        <div className="import-page-form">
          <div className="card">
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
              Writing games to library — this may take a moment for large collections.
            </div>
            <div
              style={{
                height: 6,
                background: 'rgba(255,255,255,.08)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: '100%',
                  background: 'var(--accent)',
                  borderRadius: 3,
                  animation: 'progress-indeterminate 1.4s ease infinite',
                }}
              />
            </div>
            {importStatusData?.error && (
              <div className="alert alert-danger" style={{ marginTop: 16 }}>
                <AlertCircle size={14} /> {importStatusData.error}
              </div>
            )}
          </div>
        </div>
      </div>
    )

  /* ── Step 5: done ── */
  return (
    <div className="import-page">
      <div className="import-done">
        <CheckCircle size={56} style={{ color: 'var(--success)', marginBottom: 20 }} />
        <div className="import-done-title">Import complete</div>
        <div className="import-done-stats">
          <div>
            {result.created.toLocaleString()} game{result.created !== 1 ? 's' : ''} added
          </div>
          {result.skipped_existing > 0 && (
            <div style={{ color: 'var(--text-muted)' }}>
              {result.skipped_existing.toLocaleString()} already existed — skipped
            </div>
          )}
          {result.skipped_ambiguous > 0 && (
            <div style={{ color: 'var(--warning)' }}>
              {result.skipped_ambiguous.toLocaleString()} skipped — no platform assigned
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 28 }}
          onClick={() => navigate('/games')}
        >
          Go to Library
        </button>
      </div>
    </div>
  )
}

function ROMRow({
  rom,
  platforms,
  override,
  onOverride,
}: {
  rom: ScannedROM
  platforms: import('../../types').Platform[]
  override: number | undefined
  onOverride: (id: number) => void
}) {
  const src = SOURCE_LABEL[rom.match_source]
  const isAmbiguous = rom.platform_id === null && !override
  const effectivePlatformId = override ?? rom.platform_id

  return (
    <tr
      style={{
        opacity: rom.already_exists ? 0.4 : 1,
        background: isAmbiguous ? 'rgba(255,165,0,.04)' : undefined,
      }}
    >
      <td style={{ maxWidth: 320 }} title={rom.title}>
        {rom.title}
      </td>
      <td>
        {isAmbiguous && rom.candidate_platforms.length > 0 ? (
          <select
            className="form-control"
            style={{ fontSize: 11, padding: '2px 6px', width: '100%' }}
            value={override ?? ''}
            onChange={(e) => e.target.value && onOverride(+e.target.value)}
          >
            <option value="">— pick platform —</option>
            {rom.candidate_platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span>
            {platforms.find((p) => p.id === effectivePlatformId)?.name ?? rom.platform_name ?? '—'}
          </span>
        )}
      </td>
      <td>{rom.region}</td>
      <td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: src.color }}>
          {src.icon} {src.label}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        {rom.already_exists ? (
          <span className="badge badge-imported">Exists</span>
        ) : isAmbiguous ? (
          <span className="badge badge-failed">Needs platform</span>
        ) : (
          <span className="badge badge-wanted">New</span>
        )}
      </td>
    </tr>
  )
}
