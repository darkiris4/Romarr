import { useState } from 'react'

export default function MediaManagement() {
  const [libraryPath, setLibraryPath] = useState('./library')
  const [renameEnabled, setRenameEnabled] = useState(true)
  const [verifyChecksums, setVerifyChecksums] = useState(true)
  const [deleteAfterImport, setDeleteAfterImport] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section-title">Media Management</div>
        <div className="settings-section-desc">Configure how ROMs are stored and renamed after import.</div>
      </div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        <div className="card">
          <div className="card-header"><span className="card-title">ROM Library</span></div>

          <div className="form-group">
            <label className="form-label">Library Root Path</label>
            <input
              className="form-control"
              value={libraryPath}
              onChange={e => setLibraryPath(e.target.value)}
              placeholder="/media/roms"
            />
            <div className="form-hint">
              ROMs will be organised as: Library Path / Platform Folder / Game (Region).ext
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

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  )
}
