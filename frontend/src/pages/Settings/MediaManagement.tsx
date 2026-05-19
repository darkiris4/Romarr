import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  Upload,
  FolderInput,
  ListMusic,
} from 'lucide-react'
import { libraryApi } from '../../api/library'
import { settingsApi } from '../../api/settings'

export default function MediaManagement() {
  const [renameEnabled, setRenameEnabled] = useState(true)
  const [autoUpgradeRevisions, setAutoUpgradeRevisions] = useState(true)
  const [verifyChecksums, setVerifyChecksums] = useState(true)
  const [deleteAfterImport, setDeleteAfterImport] = useState(false)
  const [unmonitorDeleted, setUnmonitorDeleted] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [curatedPath, setCuratedPath] = useState('')
  const [curatedSaved, setCuratedSaved] = useState(false)
  const [retroarchPrefix, setRetroarchPrefix] = useState('')
  const [exportStarted, setExportStarted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: rootFolders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ['root-folders'],
    queryFn: settingsApi.listRootFolders,
  })

  const { data: generalSettings } = useQuery({
    queryKey: ['general-settings'],
    queryFn: settingsApi.getGeneral,
  })

  useEffect(() => {
    if (generalSettings) {
      setCuratedPath(generalSettings.curated_library_path)
      setRenameEnabled(generalSettings.rename_roms)
      setAutoUpgradeRevisions(generalSettings.auto_upgrade_revisions)
    }
  }, [generalSettings])

  const saveGeneralMutation = useMutation({
    mutationFn: (payload: {
      curated_library_path: string
      rename_roms: boolean
      auto_upgrade_revisions: boolean
    }) => settingsApi.saveGeneral(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['general-settings'] })
      setCuratedSaved(true)
      setTimeout(() => setCuratedSaved(false), 2500)
    },
  })

  const addFolderMutation = useMutation({
    mutationFn: (path: string) => settingsApi.addRootFolder(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['root-folders'] })
      setNewPath('')
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: (id: number) => settingsApi.deleteRootFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['root-folders'] }),
  })

  const { data: exportStatus } = useQuery({
    queryKey: ['retroarch-export-status'],
    queryFn: libraryApi.retroarchExportStatus,
    refetchInterval: exportStarted ? 800 : false,
  })

  const exportRunning = exportStatus?.running ?? false
  const exportDone = exportStatus?.done ?? false

  useEffect(() => {
    if (!exportDone) return
    setExportStarted(false)
    libraryApi.downloadRetroarchExport()
  }, [exportDone])

  const { data: datStatus } = useQuery({
    queryKey: ['dat-status'],
    queryFn: libraryApi.datStatus,
  })

  const reloadMutation = useMutation({
    mutationFn: () => libraryApi.reloadDats(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dat-status'] }),
  })

  const deleteDatMutation = useMutation({
    mutationFn: (filename: string) => libraryApi.deleteDat(filename),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dat-status'] }),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => libraryApi.uploadDat(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dat-status'] }),
  })

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files)
      .filter((f) => f.name.endsWith('.dat'))
      .forEach((f) => uploadMutation.mutate(f))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveGeneralMutation.mutate(
      {
        curated_library_path: curatedPath,
        rename_roms: renameEnabled,
        auto_upgrade_revisions: autoUpgradeRevisions,
      },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2500)
        },
      }
    )
  }

  function handleAddFolder() {
    const path = newPath.trim()
    if (!path) return
    addFolderMutation.mutate(path)
  }

  const datDir = datStatus?.dat_dir
  const platforms = datStatus?.platforms ?? []
  const loadedCount = platforms.filter((p) => p.loaded).length

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Media Management</div>
        <div className="settings-section-desc">
          Configure how ROMs are stored and renamed after import.
        </div>
      </div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">ROM Renaming</span>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Rename ROMs on Import</div>
              <div className="toggle-hint">
                Rename imported files to the canonical No-Intro title from the DAT file. When no DAT
                match exists, the original filename is kept.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={renameEnabled}
                onChange={(e) => setRenameEnabled(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Auto-Upgrade Revisions</div>
              <div className="toggle-hint">
                When a higher revision of an already-imported ROM is found (e.g. Rev 1 replaces Rev
                0), automatically update the file reference and discard the older revision.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoUpgradeRevisions}
                onChange={(e) => setAutoUpgradeRevisions(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Verify Checksums via DAT</div>
              <div className="toggle-hint">
                Reject imports that don't match a No-Intro DAT entry.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={verifyChecksums}
                onChange={(e) => setVerifyChecksums(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="toggle-row">
            <div>
              <div className="toggle-label">Delete Source File After Import</div>
              <div className="toggle-hint">
                Remove the downloaded file once successfully imported.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={deleteAfterImport}
                onChange={(e) => setDeleteAfterImport(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
        </div>
      </form>

      {/* ── File Management ── */}
      <div className="settings-section-title">File Management</div>
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="toggle-row" style={{ borderBottom: 'none' }}>
          <div>
            <div className="toggle-label">Unmonitor Deleted ROMs</div>
            <div className="toggle-hint">
              Games deleted from disk are automatically unmonitored in Romarr.
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={unmonitorDeleted}
              onChange={(e) => setUnmonitorDeleted(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      {/* ── Root Folders ── */}
      <div className="settings-section-title">Root Folders</div>
      <div className="settings-section-desc">
        Root folders are the top-level directories where Romarr organises your ROM library. Imported
        ROMs are placed under: <code>Root Folder / Platform / Game (Region).ext</code>
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <table className="activity-table">
          <thead>
            <tr>
              <th>Path</th>
              <th style={{ textAlign: 'right', width: 120 }}>Free Space</th>
              <th style={{ textAlign: 'right', width: 160 }}>Unmapped Folders</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {foldersLoading ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}
                >
                  Loading…
                </td>
              </tr>
            ) : rootFolders.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}
                >
                  No root folders configured
                </td>
              </tr>
            ) : (
              rootFolders.map((folder) => (
                <tr key={folder.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-white)' }}>
                    {folder.path}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    {folder.free_space}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    {folder.unmapped_folders}
                  </td>
                  <td className="col-action">
                    <button
                      className="btn-icon"
                      title="Remove root folder"
                      onClick={() => deleteFolderMutation.mutate(folder.id)}
                      disabled={deleteFolderMutation.isPending}
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {addFolderMutation.isError && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <AlertCircle size={13} />
          {String(
            (addFolderMutation.error as { response?: { data?: { detail?: string } } })?.response
              ?.data?.detail ?? 'Failed to add folder'
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 32 }}>
        <input
          className="form-control"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFolder())}
          placeholder="/media/roms"
          style={{ maxWidth: 400, fontFamily: 'monospace' }}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleAddFolder}
          disabled={!newPath.trim() || addFolderMutation.isPending}
        >
          <Plus size={14} /> {addFolderMutation.isPending ? 'Adding…' : 'Add Root Folder'}
        </button>
      </div>

      {/* ── Curated Library ── */}
      <div className="settings-section-title">Curated Library</div>
      <div className="settings-section-desc">
        During library import, Romarr can copy your filtered ROMs to a separate directory organised
        by platform — ideal for pointing RetroArch or other emulators at a clean, noise-free
        collection. Files from multi-ROM ZIPs are extracted individually; only the variants you
        selected are copied.
      </div>
      <div className="card" style={{ marginBottom: 32 }}>
        <div className="card-header" style={{ alignItems: 'flex-start', gap: 10 }}>
          <FolderInput size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>
              Curated Library Path
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Leave blank to disable. Files are organised as{' '}
              <code>path / Platform / filename.ext</code>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className="form-control"
                value={curatedPath}
                onChange={(e) => setCuratedPath(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  saveGeneralMutation.mutate({
                    curated_library_path: curatedPath.trim(),
                    rename_roms: renameEnabled,
                    auto_upgrade_revisions: autoUpgradeRevisions,
                  })
                }
                placeholder="/media/curated-roms"
                style={{ maxWidth: 400, fontFamily: 'monospace' }}
              />
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() =>
                  saveGeneralMutation.mutate({
                    curated_library_path: curatedPath.trim(),
                    rename_roms: renameEnabled,
                    auto_upgrade_revisions: autoUpgradeRevisions,
                  })
                }
                disabled={saveGeneralMutation.isPending}
              >
                {saveGeneralMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              {curatedSaved && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--success)',
                  }}
                >
                  <CheckCircle size={13} /> Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── RetroArch Export ── */}
      {curatedPath && (
        <div className="card" style={{ marginBottom: 32 }}>
          <div className="card-header" style={{ alignItems: 'flex-start', gap: 10 }}>
            <ListMusic size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="card-title" style={{ marginBottom: 4 }}>
                Export RetroArch Package
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Downloads a single ZIP containing <code>playlists/</code> and{' '}
                <code>thumbnails/</code> — extract it at the RetroArch root and everything is ready
                with no scanning or downloading required inside RetroArch. Filenames are sanitized
                to match RetroArch's thumbnail lookup rules. If RetroArch runs on a different
                machine, enter the path to your curated library as that machine sees it.
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: exportRunning ? 12 : 0,
                }}
              >
                <input
                  className="form-control"
                  value={retroarchPrefix}
                  onChange={(e) => setRetroarchPrefix(e.target.value)}
                  placeholder={curatedPath + '  (same machine — leave blank)'}
                  style={{ maxWidth: 420, fontFamily: 'monospace' }}
                  disabled={exportRunning}
                />
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={exportRunning}
                  onClick={async () => {
                    setExportStarted(true)
                    await libraryApi.startRetroarchExport(retroarchPrefix || undefined)
                  }}
                >
                  Export RetroArch Package
                </button>
              </div>

              {exportRunning && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    <span>
                      {exportStatus?.stage === 'fetching' ? 'Fetching cover art…' : 'Building ZIP…'}
                    </span>
                    {exportStatus?.stage === 'fetching' && (exportStatus?.total ?? 0) > 0 && (
                      <span>
                        {exportStatus.fetched.toLocaleString()} /{' '}
                        {exportStatus.total.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: 'rgba(255,255,255,.08)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    {(() => {
                      const pct =
                        exportStatus?.stage === 'fetching' && (exportStatus?.total ?? 0) > 0
                          ? Math.round(((exportStatus?.fetched ?? 0) / exportStatus.total) * 100)
                          : null
                      return (
                        <div
                          style={{
                            height: '100%',
                            width: pct !== null ? `${pct}%` : '100%',
                            background: 'var(--accent)',
                            borderRadius: 3,
                            transition: pct !== null ? 'width .4s ease' : undefined,
                            animation:
                              pct !== null
                                ? undefined
                                : 'progress-indeterminate 1.4s ease infinite',
                          }}
                        />
                      )
                    })()}
                  </div>
                  {exportStatus?.stage === 'fetching' && (exportStatus?.total ?? 0) > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                      {Math.round(((exportStatus?.fetched ?? 0) / exportStatus.total) * 100)}%
                    </div>
                  )}
                </div>
              )}

              {exportStatus?.error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: 'var(--danger)',
                    marginTop: 8,
                  }}
                >
                  <AlertCircle size={13} /> {exportStatus.error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DAT Files ── */}
      <div className="settings-section-title">No-Intro DAT Files</div>
      <div className="settings-section-desc">
        DAT files enable hash-based ROM identification using CRC32 checksums — filenames and folder
        structure are ignored entirely. Upload DAT files using the drop zone below. Romarr matches
        them to platforms automatically and shows the date of each DAT so you know when an update is
        available.
      </div>

      {/* Upload drop zone */}
      <div
        className={`dat-dropzone${dragOver ? ' dat-dropzone--over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dat"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload size={28} style={{ color: 'var(--accent-hover)', marginBottom: 10 }} />
        <div style={{ fontWeight: 500, color: 'var(--text-white)', marginBottom: 4 }}>
          {uploadMutation.isPending ? 'Uploading…' : 'Drop DAT files here or click to browse'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Accepts .dat files — multiple files supported
        </div>
      </div>

      {uploadMutation.isSuccess && uploadMutation.data && (
        <div
          className={`alert ${uploadMutation.data.status === 'loaded' ? 'alert-success' : 'alert-warning'}`}
          style={{ marginBottom: 16 }}
        >
          {uploadMutation.data.status === 'loaded' ? (
            <>
              <CheckCircle size={13} /> <strong>{uploadMutation.data.filename}</strong> loaded for{' '}
              <strong>{uploadMutation.data.matched_platform}</strong>
              {uploadMutation.data.platform_created ? ' (platform created automatically)' : ''}
            </>
          ) : (
            <>
              <AlertCircle size={13} /> <strong>{uploadMutation.data.filename}</strong> saved but
              could not be loaded — the DAT may be malformed
            </>
          )}
        </div>
      )}

      {uploadMutation.isError && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <AlertCircle size={13} />
          {String(
            (uploadMutation.error as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail ?? 'Upload failed'
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <span className="card-title">DAT Directory</span>
            {datDir && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                  fontFamily: 'monospace',
                }}
              >
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

        <div
          style={{
            background: 'rgba(53,197,244,.06)',
            border: '1px solid rgba(53,197,244,.2)',
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            marginBottom: 16,
          }}
        >
          <strong style={{ color: 'var(--info)' }}>Getting DAT files:</strong>
          <ol style={{ paddingLeft: 20, marginTop: 6, marginBottom: 8 }}>
            <li>
              Go to <strong>datomatic.no-intro.org</strong> → Download → Standard DAT
            </li>
            <li>
              Download the <code>.dat</code> file for each platform you want
            </li>
            <li>
              Drag and drop the files onto the upload area above — platforms are matched and loaded
              automatically
            </li>
          </ol>
          <div style={{ color: 'var(--text-muted)' }}>
            To update a DAT, upload the new file — it replaces the existing one automatically. DATs
            are also reloaded each time Romarr starts.
          </div>
        </div>

        {platforms.length === 0 ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 13,
              textAlign: 'center',
              padding: '20px 0',
            }}
          >
            No platforms configured yet. Add platforms in <strong>Settings → Platforms</strong>{' '}
            first.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Date</th>
                  <th>Version</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Entries</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {platforms.map((p) => (
                  <tr key={p.platform_id}>
                    <td style={{ color: 'var(--text-white)' }}>{p.platform_name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {p.dat_date ?? (p.dat_file ? '—' : '')}
                    </td>
                    <td
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.dat_version ?? (p.dat_file ? '—' : '')}
                    </td>
                    <td style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                      {p.loaded ? p.entries.toLocaleString() : p.dat_file ? '—' : ''}
                    </td>
                    <td>
                      {p.loaded ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            color: 'var(--success)',
                          }}
                        >
                          <CheckCircle size={12} /> Loaded
                        </span>
                      ) : p.dat_file ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            color: 'var(--warning)',
                          }}
                        >
                          <AlertCircle size={12} /> Not loaded
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No DAT</span>
                      )}
                    </td>
                    <td className="col-action">
                      {p.dat_file && (
                        <button
                          className="btn-icon"
                          title={`Remove ${p.dat_file}`}
                          onClick={() => deleteDatMutation.mutate(p.dat_file!)}
                          disabled={deleteDatMutation.isPending}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          {loadedCount} of {platforms.length} platform{platforms.length !== 1 ? 's' : ''} have a DAT
          loaded
        </div>
      </div>
    </div>
  )
}
