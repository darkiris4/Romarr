import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import client from '../../api/client'

interface IgdbConfig {
  igdb_client_id: string
  igdb_client_secret: string
  configured: boolean
}

export default function MetadataPage() {
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

    </div>
  )
}
