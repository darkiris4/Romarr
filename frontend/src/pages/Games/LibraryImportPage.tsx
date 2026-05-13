import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, CheckCircle, AlertCircle, ArrowRight, Database, FileQuestion } from 'lucide-react'
import { libraryApi, type ScannedROM, type ScanPreview } from '../../api/library'
import { platformsApi } from '../../api/platforms'

type Step = 'path' | 'preview' | 'done'

const SOURCE_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  dat:       { label: 'DAT match',   color: 'var(--success)',   icon: <Database size={11} /> },
  filename:  { label: 'Filename',    color: 'var(--warning)',   icon: <FileQuestion size={11} /> },
  unmatched: { label: 'No platform', color: 'var(--text-muted)', icon: <AlertCircle size={11} /> },
}

export default function LibraryImportPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep] = useState<Step>('path')
  const [folderPath, setFolderPath] = useState('')
  const [hintPlatformId, setHintPlatformId] = useState<number | undefined>()
  const [preview, setPreview] = useState<ScanPreview | null>(null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [result, setResult] = useState<any>(null)

  const { data: platforms = [] } = useQuery({ queryKey: ['platforms'], queryFn: platformsApi.list })

  const scanMutation = useMutation({
    mutationFn: () => libraryApi.scan(folderPath.trim(), hintPlatformId),
    onSuccess: data => { setPreview(data); setStep('preview') },
  })

  const importMutation = useMutation({
    mutationFn: () => libraryApi.import(folderPath.trim(), {
      platform_hint_id: hintPlatformId,
      platform_overrides: overrides,
    }),
    onSuccess: data => {
      setResult(data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['games'] })
    },
  })

  const toImport = preview
    ? preview.roms.filter(r => !r.already_exists && (r.platform_id !== null || overrides[r.path])).length
    : 0

  /* ── Step 1 ── */
  if (step === 'path') return (
    <div className="import-page">
      <div className="import-page-form">
        <div className="form-group">
          <label className="form-label">Folder Path</label>
          <input
            className="form-control"
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="/home/user/roms"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && folderPath.trim() && scanMutation.mutate()}
          />
          <div className="form-hint">
            Romarr walks the folder recursively. Any subdirectory layout works — filenames and folder names don't need to follow any convention.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            Platform Hint <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <select
            className="form-control"
            value={hintPlatformId ?? ''}
            onChange={e => setHintPlatformId(e.target.value ? +e.target.value : undefined)}
          >
            <option value="">Auto-detect by file extension</option>
            {platforms.filter(p => p.enabled).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="form-hint">
            Set this if your folder contains ROMs for a single platform and the auto-detect is ambiguous (e.g. <code>.bin</code> files).
          </div>
        </div>

        <div className="card" style={{ background: 'rgba(53,197,244,.06)', borderLeft: '3px solid var(--info)', padding: '12px 16px', boxShadow: 'none', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--info)' }}>Tip: load No-Intro DAT files for best results.</strong><br />
            Without DATs, Romarr identifies ROMs by filename. With DATs, it uses CRC32 hashes
            so filenames, languages, and revisions are all identified correctly — even for renamed or mislabelled files.
            DAT files are free from <strong>datomatic.no-intro.org</strong>.
          </div>
        </div>

        {scanMutation.isError && (
          <div className="alert alert-danger">
            <AlertCircle size={14} />
            {String((scanMutation.error as any)?.response?.data?.detail ?? 'Scan failed')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={() => scanMutation.mutate()}
            disabled={!folderPath.trim() || scanMutation.isPending}
          >
            {scanMutation.isPending ? 'Scanning…' : <><FolderOpen size={14} /> Scan</>}
          </button>
        </div>
      </div>
    </div>
  )

  /* ── Step 2 ── */
  if (step === 'preview' && preview) return (
    <div className="import-page">
      {/* Stat strip */}
      <div className="import-stat-strip">
        {[
          { label: 'Files scanned',  value: preview.total_files_seen },
          { label: 'DAT matches',    value: preview.dat_matches,      color: 'var(--success)' },
          { label: 'Filename guess', value: preview.filename_matches, color: 'var(--warning)' },
          { label: 'Ambiguous',      value: preview.ambiguous,        color: preview.ambiguous ? 'var(--warning)' : undefined },
          { label: 'To import',      value: toImport,                 color: 'var(--accent-hover)' },
        ].map(s => (
          <div key={s.label} className="import-stat">
            <div className="import-stat-value" style={{ color: s.color ?? 'var(--text-white)' }}>{s.value}</div>
            <div className="import-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {preview.ambiguous > 0 && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} />
          {preview.ambiguous} file{preview.ambiguous !== 1 ? 's have' : ' has'} an ambiguous extension (e.g. <code>.bin</code>).
          Assign a platform below or set a Platform Hint and re-scan.
        </div>
      )}

      {/* ROM table */}
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
            {preview.roms.map((rom, i) => (
              <ROMRow
                key={i}
                rom={rom}
                platforms={platforms}
                override={overrides[rom.path]}
                onOverride={pid => setOverrides(prev => ({ ...prev, [rom.path]: pid }))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" onClick={() => setStep('path')}>Back</button>
        <button
          className="btn btn-primary"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || toImport === 0}
        >
          {importMutation.isPending
            ? 'Importing…'
            : <><ArrowRight size={14} /> Import {toImport} ROM{toImport !== 1 ? 's' : ''}</>}
        </button>
      </div>
    </div>
  )

  /* ── Step 3 ── */
  return (
    <div className="import-page">
      <div className="import-done">
        <CheckCircle size={56} style={{ color: 'var(--success)', marginBottom: 20 }} />
        <div className="import-done-title">Import complete</div>
        <div className="import-done-stats">
          <div>{result.created} game{result.created !== 1 ? 's' : ''} added</div>
          {result.dat_matches > 0 && <div style={{ color: 'var(--success)' }}>{result.dat_matches} identified via DAT hash</div>}
          {result.filename_matches > 0 && <div style={{ color: 'var(--warning)' }}>{result.filename_matches} identified via filename</div>}
          {result.skipped_existing > 0 && <div style={{ color: 'var(--text-muted)' }}>{result.skipped_existing} already existed</div>}
          {result.skipped_ambiguous > 0 && <div style={{ color: 'var(--text-muted)' }}>{result.skipped_ambiguous} skipped (ambiguous platform)</div>}
        </div>
        <button className="btn btn-primary" style={{ marginTop: 28 }} onClick={() => navigate('/games')}>
          Go to Library
        </button>
      </div>
    </div>
  )
}

function ROMRow({ rom, platforms, override, onOverride }: {
  rom: ScannedROM
  platforms: import('../../types').Platform[]
  override: number | undefined
  onOverride: (id: number) => void
}) {
  const src = SOURCE_LABEL[rom.match_source]
  const isAmbiguous = rom.platform_id === null && !override
  const effectivePlatformId = override ?? rom.platform_id

  return (
    <tr style={{ opacity: rom.already_exists ? 0.4 : 1, background: isAmbiguous ? 'rgba(255,165,0,.04)' : undefined }}>
      <td style={{ maxWidth: 320 }} title={rom.title}>{rom.title}</td>
      <td>
        {isAmbiguous && rom.candidate_platforms.length > 0 ? (
          <select
            className="form-control"
            style={{ fontSize: 11, padding: '2px 6px', width: '100%' }}
            value={override ?? ''}
            onChange={e => e.target.value && onOverride(+e.target.value)}
          >
            <option value="">— pick platform —</option>
            {rom.candidate_platforms.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span>{platforms.find(p => p.id === effectivePlatformId)?.name ?? rom.platform_name ?? '—'}</span>
        )}
      </td>
      <td>{rom.region}</td>
      <td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: src.color }}>
          {src.icon} {src.label}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        {rom.already_exists
          ? <span className="badge badge-imported">Exists</span>
          : isAmbiguous
            ? <span className="badge badge-failed">Needs platform</span>
            : <span className="badge badge-wanted">New</span>}
      </td>
    </tr>
  )
}
