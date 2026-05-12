import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, CheckCircle, AlertCircle, Database } from 'lucide-react'
import { libraryApi } from '../../api/library'

export default function MediaManagement() {
  const [libraryPath, setLibraryPath] = useState('./library')
  const [renameEnabled, setRenameEnabled] = useState(true)
  const [verifyChecksums, setVerifyChecksums] = useState(true)
  const [deleteAfterImport, setDeleteAfterImport] = useState(false)
  const [saved, setSaved] = useState(false)
  const qc = useQueryClient()

  const { data: datStatus } = useQuery({
    queryKey: ['dat-status'],
    queryFn: libraryApi.datStatus,
  })

  const reloadMutation = useMutation({
    mutationFn: () => libraryApi.reloadDats(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dat-status'] }),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const datDir = datStatus?.dat_dir
  const platforms = datStatus?.platforms ?? []
  const loadedCount = platforms.filter((p: any) => p.loaded).length

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Media Management</div>
        <div className="settings-section-desc">Configure how ROMs are stored and renamed after import.</div>
      </div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header"><span className="card-title">ROM Library</span></div>

          <div className="form-group">
            <label className="form-label">Library Root Path</label>
            <input
              className="form-control"
              value={libraryPath}
              onChange={e => setLibraryPath(e.target.value)}
              placeholder="/media/roms"
              style={{ maxWidth: 400 }}
            />
            <div className="form-hint">
              Imported ROMs are organised as: <code>Library Path / Platform Folder / Game (Region).ext</code>
            </div>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Rename ROMs on Import</div>
              <div className="toggle-hint">Apply No-Intro standard naming to imported files.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={renameEnabled} onChange={e => setRenameEnabled(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Verify Checksums via DAT</div>
              <div className="toggle-hint">Reject imports that don't match a No-Intro DAT entry.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={verifyChecksums} onChange={e => setVerifyChecksums(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Delete Source File After Import</div>
              <div className="toggle-hint">Remove the downloaded file once successfully imported.</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={deleteAfterImport} onChange={e => setDeleteAfterImport(e.target.checked)} />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>

      {/* ── DAT Files ── */}
      <div className="settings-section-title">No-Intro DAT Files</div>
      <div className="settings-section-desc">
        DAT files enable hash-based ROM identification — filenames and folder structure are ignored entirely.
        Download DAT files free from <strong>datomatic.no-intro.org</strong> and place them in the folder below.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <span className="card-title">DAT Directory</span>
            {datDir && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                {datDir}
              </div>
            )}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reloadMutation.mutate()}
            disabled={reloadMutation.isPending}
          >
            <RefreshCw size={13} />
            {reloadMutation.isPending ? 'Reloading…' : 'Reload DATs'}
          </button>
        </div>

        <div style={{
          background: 'rgba(53,197,244,.06)',
          border: '1px solid rgba(53,197,244,.2)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          marginBottom: 16,
        }}>
          <strong style={{ color: 'var(--info)' }}>How to add DAT files:</strong>
          <ol style={{ paddingLeft: 20, marginTop: 6 }}>
            <li>Go to <strong>datomatic.no-intro.org</strong> → Download → P/C XML</li>
            <li>Download the <code>.dat</code> file for each platform you want</li>
            <li>Place the files into <code style={{ color: 'var(--accent-hover)' }}>{datDir ?? 'data/dats/'}</code></li>
            <li>Click <strong>Reload DATs</strong> — Romarr auto-matches by the DAT name</li>
          </ol>
          <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
            DATs are also auto-loaded each time Romarr starts.
            Filenames don't need to match exactly — Romarr reads the name from inside the file.
          </div>
        </div>

        {platforms.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No platforms configured yet. Add platforms in <strong>Settings → Platforms</strong> first.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>DAT File</th>
                  <th style={{ width: 90 }}>Entries</th>
                  <th style={{ width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map((p: any) => (
                  <tr key={p.platform_id}>
                    <td style={{ color: 'var(--text-white)' }}>{p.platform_name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.dat_file ?? <span style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {p.loaded ? p.entries.toLocaleString() : '—'}
                    </td>
                    <td>
                      {p.loaded ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success)' }}>
                          <CheckCircle size={12} /> Loaded
                        </span>
                      ) : p.dat_file ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--warning)' }}>
                          <AlertCircle size={12} /> Not loaded
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No DAT</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          {loadedCount} of {platforms.length} platform{platforms.length !== 1 ? 's' : ''} have a DAT loaded
        </div>
      </div>
    </div>
  )
}
