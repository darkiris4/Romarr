import { CheckCircle } from 'lucide-react'

export default function UpdatesPage() {
  return (
    <div>
      <div className="settings-section-title" style={{ marginBottom: 16 }}>Updates</div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--success)', marginBottom: 16 }}>
          <CheckCircle size={18} />
          <span>You are running the latest version — <strong style={{ color: 'var(--text-white)' }}>v0.1.0</strong></span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Romarr has not yet had a formal release. Check the GitHub repository for the latest commits and upcoming releases.
        </p>
        <div style={{ marginTop: 16 }}>
          <a
            href="https://github.com/darkiris4/Romarr/releases"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            View Releases on GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
