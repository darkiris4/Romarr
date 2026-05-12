import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, FolderOpen, CheckCircle, AlertCircle, ArrowRight, Database, FileQuestion } from 'lucide-react'
import { libraryApi, type ScannedROM, type ScanPreview } from '../../api/library'
import { platformsApi } from '../../api/platforms'

interface Props {
  onClose: () => void
  onImported: () => void
}

type Step = 'path' | 'preview' | 'done'

const SOURCE_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  dat:       { label: 'DAT match',    color: 'var(--success)', icon: <Database size={11} /> },
  filename:  { label: 'Filename',     color: 'var(--warning)', icon: <FileQuestion size={11} /> },
  unmatched: { label: 'No platform',  color: 'var(--text-muted)', icon: <AlertCircle size={11} /> },
}

export default function ImportModal({ onClose, onImported }: Props) {
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
    onSuccess: data => { setResult(data); setStep('done'); onImported() },
  })

  const toImport = preview
    ? preview.roms.filter(r => !r.already_exists && (r.platform_id !== null || overrides[r.path])).length
    : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Import ROM Collection</span>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* ── Step 1: path + options ── */}
        {step === 'path' && (
          <>
            <div className="modal-body">
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

              <div className="card" style={{ background: 'rgba(53,197,244,.06)', borderLeft: '3px solid var(--info)', padding: '12px 16px', boxShadow: 'none' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--info)' }}>Tip: load No-Intro DAT files for best results.</strong><br />
                  Without DATs, Romarr identifies ROMs by filename. With DATs, it uses CRC32 hashes
                  so filenames, languages, and revisions are all identified correctly — even for renamed or mislabelled files.
                  DAT files are free from <strong>datomatic.no-intro.org</strong>.
                </div>
              </div>

              {scanMutation.isError && (
                <div className="alert alert-danger" style={{ marginTop: 12 }}>
                  <AlertCircle size={14} />
                  {String((scanMutation.error as any)?.response?.data?.detail ?? 'Scan failed')}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => scanMutation.mutate()}
                disabled={!folderPath.trim() || scanMutation.isPending}
              >
                {scanMutation.isPending ? 'Scanning…' : <><FolderOpen size={14} /> Scan</>}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: preview ── */}
        {step === 'preview' && preview && (
          <>
            <div className="modal-body" style={{ padding: 0 }}>
              {/* stat strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                {[
                  { label: 'Files scanned',  value: preview.total_files_seen },
                  { label: 'DAT matches',    value: preview.dat_matches,    color: 'var(--success)' },
                  { label: 'Filename guess', value: preview.filename_matches, color: 'var(--warning)' },
                  { label: 'Ambiguous',      value: preview.ambiguous,      color: preview.ambiguous ? 'var(--warning)' : undefined },
                  { label: 'To import',      value: toImport,               color: 'var(--accent-hover)' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '12px 0', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color ?? 'var(--text-white)' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {preview.ambiguous > 0 && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div className="alert alert-info" style={{ margin: 0 }}>
                    <AlertCircle size={14} />
                    {preview.ambiguous} file{preview.ambiguous !== 1 ? 's have' : ' has'} an ambiguous extension (e.g. <code>.bin</code>).
                    Assign a platform below or set a Platform Hint and re-scan.
                  </div>
                </div>
              )}

              {/* ROM table */}
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Platform</th>
                      <th style={thStyle}>Region</th>
                      <th style={{ ...thStyle, width: 90 }}>Identified by</th>
                      <th style={{ ...thStyle, width: 72, textAlign: 'right' }}>Status</th>
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
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setStep('path')}>Back</button>
              <div className="spacer" />
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
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
          </>
        )}

        {/* ── Step 3: done ── */}
        {step === 'done' && result && (
          <>
            <div className="modal-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 16 }} />
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-white)', marginBottom: 12 }}>
                Import complete
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 2 }}>
                <div>{result.created} game{result.created !== 1 ? 's' : ''} added</div>
                {result.dat_matches > 0 && <div style={{ color: 'var(--success)' }}>{result.dat_matches} identified via DAT hash</div>}
                {result.filename_matches > 0 && <div style={{ color: 'var(--warning)' }}>{result.filename_matches} identified via filename</div>}
                {result.skipped_existing > 0 && <div style={{ color: 'var(--text-muted)' }}>{result.skipped_existing} already existed</div>}
                {result.skipped_ambiguous > 0 && <div style={{ color: 'var(--text-muted)' }}>{result.skipped_ambiguous} skipped (ambiguous platform)</div>}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '7px 14px',
  textAlign: 'left',
  background: 'var(--bg-table-header)',
  color: 'var(--text-muted)',
  fontWeight: 700,
  position: 'sticky',
  top: 0,
  zIndex: 1,
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
    <tr style={{
      borderBottom: '1px solid rgba(255,255,255,.05)',
      opacity: rom.already_exists ? 0.4 : 1,
      background: isAmbiguous ? 'rgba(255,165,0,.04)' : undefined,
    }}>
      <td style={{ padding: '6px 14px', color: 'var(--text-white)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rom.title}>
        {rom.title}
      </td>
      <td style={{ padding: '6px 8px' }}>
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
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {platforms.find(p => p.id === effectivePlatformId)?.name ?? rom.platform_name ?? '—'}
          </span>
        )}
      </td>
      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11 }}>{rom.region}</td>
      <td style={{ padding: '6px 8px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: src.color }}>
          {src.icon} {src.label}
        </span>
      </td>
      <td style={{ padding: '6px 14px', textAlign: 'right' }}>
        {rom.already_exists
          ? <span className="badge badge-imported">Exists</span>
          : isAmbiguous
            ? <span className="badge badge-failed">Needs platform</span>
            : <span className="badge badge-wanted">New</span>}
      </td>
    </tr>
  )
}
