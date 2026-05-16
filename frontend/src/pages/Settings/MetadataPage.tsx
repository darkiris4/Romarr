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

export default function MetadataPage() {
  const qc = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [scrapeOnAdd, setScrapeOnAdd] = useState(true)
  const [scrapeLanguage, setScrapeLanguage] = useState('en')
  const [certValidation, setCertValidation] = useState(true)

  const { data: igdbConfig, refetch: refetchIgdb } = useQuery<IgdbConfig>({
    queryKey: ['igdb-config'],
    queryFn: () => client.get('/system/config/igdb').then((r) => r.data),
  })

  const { data: scrapeStatus } = useQuery<ScrapeStatus>({
    queryKey: ['scrape-status'],
    queryFn: () => client.get('/system/scrape/status').then((r) => r.data),
    refetchInterval: (query) => (query.state.data?.running ? 1500 : false),
    refetchIntervalInBackground: true,
  })

  const wasDone = scrapeStatus?.done && !scrapeStatus?.running
  if (wasDone && scrapeStatus?.updated && scrapeStatus.updated > 0) {
    qc.invalidateQueries({ queryKey: ['games'] })
  }

  const saveMeta = useMutation({
    mutationFn: () =>
      client.put('/system/config/igdb', {
        igdb_client_id: clientId,
        igdb_client_secret: clientSecret,
      }),
    onSuccess: () => {
      refetchIgdb()
      setTestResult(null)
    },
  })

  const testMeta = useMutation({
    mutationFn: () =>
      client.post<{ ok: boolean; message: string }>('/system/config/igdb/test').then((r) => r.data),
    onSuccess: (data) => setTestResult(data),
  })

  const startScrape = useMutation({
    mutationFn: () => client.post('/system/scrape').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scrape-status'] }),
  })

  const pct = scrapeStatus?.total
    ? Math.round((scrapeStatus.processed / scrapeStatus.total) * 100)
    : 0

  return (
    <div>
      <div className="settings-section-title">Metadata</div>
      <div className="settings-section-desc">
        Configure metadata sources and the scraper that enriches your library with cover art,
        descriptions, and ratings.
      </div>

      {/* ── Metadata Source ── */}
      <div className="settings-section-title" style={{ marginTop: 8 }}>
        Metadata Source
      </div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">IGDB</span>
          {igdbConfig?.configured ? (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: 'var(--success)',
              }}
            >
              <CheckCircle size={13} /> Connected
            </span>
          ) : (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: 'var(--warning)',
              }}
            >
              <AlertCircle size={13} /> Not configured
            </span>
          )}
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
            marginBottom: 20,
          }}
        >
          <strong style={{ color: 'var(--info)' }}>Getting IGDB credentials:</strong>
          <ol style={{ paddingLeft: 20, marginTop: 6, marginBottom: 0 }}>
            <li>
              Go to <strong>dev.twitch.tv/console/apps</strong> and log in with a Twitch account
            </li>
            <li>
              Create a new application — set OAuth redirect to <code>http://localhost</code>
            </li>
            <li>
              Copy the <strong>Client ID</strong> and generate a <strong>New Secret</strong>
            </li>
            <li>
              Paste both values below and click <strong>Save</strong>
            </li>
          </ol>
        </div>

        <div className="form-group">
          <label className="form-label">Client ID</label>
          <input
            className="form-control"
            placeholder={igdbConfig?.igdb_client_id || 'Paste your Twitch Client ID'}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
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
            onChange={(e) => setClientSecret(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        {testResult && (
          <div
            className={`alert ${testResult.ok ? 'alert-success' : 'alert-danger'}`}
            style={{ marginBottom: 16 }}
          >
            {testResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}{' '}
            {testResult.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
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

      {/* ── Scraper Settings ── */}
      <div className="settings-section-title">Scraper Settings</div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">Scrape Metadata on Add</div>
            <div className="toggle-hint">
              Automatically run the IGDB scraper when a new game is added to your library.
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={scrapeOnAdd}
              onChange={(e) => setScrapeOnAdd(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="toggle-row">
          <div>
            <div className="toggle-label">Certificate Validation</div>
            <div className="toggle-hint">
              Validate SSL certificates when connecting to IGDB. Disable only in isolated test
              environments.
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={certValidation}
              onChange={(e) => setCertValidation(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="form-group" style={{ marginBottom: 0, marginTop: 16 }}>
          <label className="form-label">Preferred Language</label>
          <select
            className="form-control"
            value={scrapeLanguage}
            onChange={(e) => setScrapeLanguage(e.target.value)}
            style={{ maxWidth: 240 }}
          >
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="it">Italian</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="pt-BR">Portuguese (Brazil)</option>
            <option value="ru">Russian</option>
            <option value="zh-Hans">Chinese (Simplified)</option>
          </select>
          <div className="form-hint">
            Preferred language for summaries and titles. Falls back to English when a translation is
            unavailable.
          </div>
        </div>
      </div>

      {/* ── Run Scraper ── */}
      <div className="settings-section-title">Run Scraper</div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Scrape Now</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Also runs automatically every 6 hours
          </span>
        </div>

        {scrapeStatus?.running && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              <span>Scraping metadata…</span>
              <span>
                {scrapeStatus.processed} / {scrapeStatus.total || '…'}
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
                  width: `${pct}%`,
                  background: 'var(--accent)',
                  borderRadius: 3,
                  transition: 'width .4s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
              {scrapeStatus.updated} updated · {scrapeStatus.failed} not found
            </div>
          </div>
        )}

        {scrapeStatus?.done && !scrapeStatus.running && (
          <div
            className={`alert ${scrapeStatus.error ? 'alert-danger' : 'alert-success'}`}
            style={{ marginBottom: 16 }}
          >
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
