import { useState } from 'react'

export default function GeneralPage() {
  const [appName, setAppName] = useState('Romarr')
  const [logLevel, setLogLevel] = useState('INFO')
  const [saved, setSaved] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <div className="settings-section-title">General</div>
      <div className="settings-section-desc">Application-level settings.</div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        <div className="card">
          <div className="form-group">
            <label className="form-label">Application Name</label>
            <input className="form-control" value={appName} onChange={e => setAppName(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Log Level</label>
            <select className="form-control" value={logLevel} onChange={e => setLogLevel(e.target.value)} style={{ maxWidth: 200 }}>
              <option>DEBUG</option>
              <option>INFO</option>
              <option>WARNING</option>
              <option>ERROR</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  )
}
