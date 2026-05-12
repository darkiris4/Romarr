import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, RefreshCw, Play } from 'lucide-react'
import client from '../../api/client'

interface IgdbConfig {
  igdb_client_id: string
  igdb_client_secret: string
  configured: boolean
}

interface ScrapeStatus {
  running: boolean
  total: number
  processed: number
  updated: number
  failed: number
  done: boolean
  error: string | null
}

export default function GeneralPage() {
  const qc = useQueryClient()
  const [appName, setAppName] = useState('Romarr')
  const [logLevel, setLogLevel] = useState('INFO')
  const [saved, setSaved] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const { data: igdbConfig, refetch: refetchIgdb } = useQuery<IgdbConfig>({
    queryKey: ['igdb-config'],
    queryFn: () => client.get('/system/config/igdb').then(r => r.data),
  })

  // Poll scrape status — interval is active only while running, persists across navigation
  const { data: scrapeStatus } = useQuery<ScrapeStatus>({
    queryKey: ['scrape-status'],
    queryFn: () => client.get('/system/scrape/status').then(r => r.data),
    refetchInterval: query => (query.state.data?.running ? 1500 : false),
    refetchIntervalInBackground: true,
  })

  // Invalidate games cache once when the scrape transitions to done
  const wasDone = scrapeStatus?.done && !scrapeStatus?.running
  if (wasDone && scrapeStatus?.updated && scrapeStatus.updated > 0) {
    qc.invalidateQueries({ queryKey: ['games'] })
  }

  const saveMeta = useMutation({
    mutationFn: () => client.put('/system/config/igdb', {
      igdb_client_id: clientId,
      igdb_client_secret: clientSecret,
    }),
    onSuccess: () => { refetchIgdb(); setTestResult(null) },
  })

  const testMeta = useMutation({
    mutationFn: () => client.post<{ ok: boolean; message: string }>('/system/config/igdb/test').then(r => r.data),
    onSuccess: data => setTestResult(data),
  })

  const startScrape = useMutation({
    mutationFn: () => client.post('/system/scrape').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape-status'] }),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const pct = scrapeStatus?.total
    ? Math.round((scrapeStatus.processed / scrapeStatus.total) * 100)
    : 0

  return (
    <div>
      <div className="settings-section-title">General</div>
      <div className="settings-section-desc">Application-level settings.</div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: 24 }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary">Save Changes</button>
        </div>
      </form>

      {/* ── Metadata Scraper ── */}
      <div className="settings-section-title">Metadata Scraper</div>
      <div className="settings-section-desc">
        IGDB provides cover art and release information. Get free credentials at{' '}
        <strong>dev.twitch.tv/console/apps</strong> — create an app, set OAuth redirect to{' '}
        <code>http://localhost</code>, then copy the Client ID and generate a Client Secret.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">IGDB Credentials</span>
          {igdbConfig?.configured ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success)' }}>
              <CheckCircle size={13} /> Configured
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--warning)' }}>
              <AlertCircle size={13} /> Not configured
            </span>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Client ID</label>
          <input
            className="form-control"
            placeholder={igdbConfig?.igdb_client_id || 'Paste your Twitch Client ID'}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Client Secret</label>
          <input
            className="form-control"
            type="password"
            placeholder={igdbConfig?.configured ? '••••••••' : 'Paste your Client Secret'}
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        {testResult && (
          <div className={`alert ${testResult.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: 16 }}>
            {testResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {' '}{testResult.message}
          </div>
        )}

        <div className="flex-center gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => testMeta.mutate()}
            disabled={testMeta.isPending}
          >
            <RefreshCw size={13} />
            {testMeta.isPending ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saveMeta.isPending || (!clientId && !clientSecret)}
            onClick={() => saveMeta.mutate()}
          >
            {saveMeta.isPending ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Run Scraper</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Also runs automatically every 6 hours</span>
        </div>

        {/* Progress bar */}
        {scrapeStatus?.running && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>Scraping metadata…</span>
              <span>{scrapeStatus.processed} / {scrapeStatus.total || '…'}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--accent)',
                borderRadius: 3,
                transition: 'width .4s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
              {scrapeStatus.updated} updated · {scrapeStatus.failed} not found
            </div>
          </div>
        )}

        {/* Done result */}
        {scrapeStatus?.done && !scrapeStatus.running && (
          <div className={`alert ${scrapeStatus.error ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: 16 }}>
            {scrapeStatus.error
              ? `Error: ${scrapeStatus.error}`
              : `Done — ${scrapeStatus.updated} games updated, ${scrapeStatus.failed} not found on IGDB.`}
          </div>
        )}

        <button
          className="btn btn-primary"
          type="button"
          onClick={() => startScrape.mutate()}
          disabled={scrapeStatus?.running || startScrape.isPending || !igdbConfig?.configured}
        >
          <Play size={13} />
          {scrapeStatus?.running ? 'Scraping…' : 'Scrape Metadata Now'}
        </button>

        {!igdbConfig?.configured && (
          <div className="form-hint" style={{ marginTop: 8 }}>
            Configure IGDB credentials above before running the scraper.
          </div>
        )}
      </div>
    </div>
  )
}
