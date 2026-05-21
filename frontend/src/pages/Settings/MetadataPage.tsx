import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import client from '../../api/client'

interface IgdbConfig {
  igdb_client_id: string
  igdb_client_secret: string
  configured: boolean
}

interface RawgConfig {
  rawg_api_key: string
  metadata_provider: 'igdb' | 'rawg'
  configured: boolean
}

export default function MetadataPage() {
  const qc = useQueryClient()

  const { data: igdbConfig, refetch: refetchIgdb } = useQuery<IgdbConfig>({
    queryKey: ['igdb-config'],
    queryFn: () => client.get('/system/config/igdb').then((r) => r.data),
  })

  const { data: rawgConfig, refetch: refetchRawg } = useQuery<RawgConfig>({
    queryKey: ['rawg-config'],
    queryFn: () => client.get('/system/config/rawg').then((r) => r.data),
  })

  const activeProvider = rawgConfig?.metadata_provider ?? 'igdb'

  // IGDB form state
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [igdbTestResult, setIgdbTestResult] = useState<{ ok: boolean; message: string } | null>(
    null
  )

  // RAWG form state
  const [rawgKey, setRawgKey] = useState('')
  const [rawgTestResult, setRawgTestResult] = useState<{ ok: boolean; message: string } | null>(
    null
  )

  const setProvider = useMutation({
    mutationFn: (provider: 'igdb' | 'rawg') =>
      client.put('/system/config/rawg', { metadata_provider: provider }),
    onSuccess: () => {
      refetchRawg()
      qc.invalidateQueries({ queryKey: ['rawg-config'] })
    },
  })

  const saveIgdb = useMutation({
    mutationFn: () =>
      client.put('/system/config/igdb', {
        igdb_client_id: clientId,
        igdb_client_secret: clientSecret,
      }),
    onSuccess: () => {
      refetchIgdb()
      setIgdbTestResult(null)
    },
  })

  const testIgdb = useMutation({
    mutationFn: () =>
      client.post<{ ok: boolean; message: string }>('/system/config/igdb/test').then((r) => r.data),
    onSuccess: (data) => setIgdbTestResult(data),
  })

  const saveRawg = useMutation({
    mutationFn: () => client.put('/system/config/rawg', { rawg_api_key: rawgKey }),
    onSuccess: () => {
      refetchRawg()
      setRawgTestResult(null)
      setRawgKey('')
    },
  })

  const testRawg = useMutation({
    mutationFn: () =>
      client.post<{ ok: boolean; message: string }>('/system/config/rawg/test').then((r) => r.data),
    onSuccess: (data) => setRawgTestResult(data),
  })

  return (
    <div>
      <div className="settings-section-title">Metadata</div>
      <div className="settings-section-desc">
        Configure your metadata source and scraper settings. The active provider is used for all
        automatic scraping and manual match searches.
      </div>

      {/* ── Provider selector ── */}
      <div className="settings-section-title" style={{ marginTop: 8 }}>
        Active Provider
      </div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(
            [
              {
                id: 'igdb' as const,
                label: 'IGDB',
                desc: 'Best retro coverage. Requires a free Twitch Developer account.',
              },
              {
                id: 'rawg' as const,
                label: 'RAWG',
                desc: 'Large modern database. Free API key, no Twitch account needed.',
              },
            ] as const
          ).map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => setProvider.mutate(id)}
              disabled={setProvider.isPending}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 'var(--radius)',
                border: `2px solid ${activeProvider === id ? 'var(--accent)' : 'rgba(255,255,255,.1)'}`,
                background:
                  activeProvider === id ? 'rgba(123,104,238,.12)' : 'rgba(255,255,255,.03)',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'inherit',
                transition: 'border-color .15s, background .15s',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: activeProvider === id ? 'var(--accent)' : 'var(--text-primary)',
                  marginBottom: 4,
                }}
              >
                {label}
                {activeProvider === id && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 400,
                      color: 'var(--accent)',
                      opacity: 0.8,
                    }}
                  >
                    active
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── IGDB card ── */}
      <div className="settings-section-title">IGDB</div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">IGDB (via Twitch)</span>
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
            <li>Go to dev.twitch.tv/console/apps and log in with a Twitch account</li>
            <li>
              Create a new application — set OAuth redirect to <code>http://localhost</code>
            </li>
            <li>
              Copy the <strong>Client ID</strong> and generate a <strong>New Secret</strong>
            </li>
            <li>Paste both values below and click Save</li>
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

        {igdbTestResult && (
          <div
            className={`alert ${igdbTestResult.ok ? 'alert-success' : 'alert-danger'}`}
            style={{ marginBottom: 16 }}
          >
            {igdbTestResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}{' '}
            {igdbTestResult.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => testIgdb.mutate()}
            disabled={testIgdb.isPending}
          >
            <RefreshCw size={13} />
            {testIgdb.isPending ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saveIgdb.isPending || (!clientId && !clientSecret)}
            onClick={() => saveIgdb.mutate()}
          >
            {saveIgdb.isPending ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      </div>

      {/* ── RAWG card ── */}
      <div className="settings-section-title">RAWG</div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">RAWG.io</span>
          {rawgConfig?.configured ? (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: 'var(--success)',
              }}
            >
              <CheckCircle size={13} /> Key saved
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
          <strong style={{ color: 'var(--info)' }}>Getting a RAWG API key:</strong>
          <ol style={{ paddingLeft: 20, marginTop: 6, marginBottom: 0 }}>
            <li>Go to rawg.io and create a free account</li>
            <li>Visit your profile → API key</li>
            <li>Paste the key below and click Save</li>
          </ol>
        </div>

        <div className="form-group">
          <label className="form-label">API Key</label>
          <input
            className="form-control"
            type="password"
            placeholder={rawgConfig?.configured ? '••••••••' : 'Paste your RAWG API key'}
            value={rawgKey}
            onChange={(e) => setRawgKey(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>

        {rawgTestResult && (
          <div
            className={`alert ${rawgTestResult.ok ? 'alert-success' : 'alert-danger'}`}
            style={{ marginBottom: 16 }}
          >
            {rawgTestResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}{' '}
            {rawgTestResult.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => testRawg.mutate()}
            disabled={testRawg.isPending}
          >
            <RefreshCw size={13} />
            {testRawg.isPending ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saveRawg.isPending || !rawgKey}
            onClick={() => saveRawg.mutate()}
          >
            {saveRawg.isPending ? 'Saving…' : 'Save Key'}
          </button>
        </div>
      </div>

      {/* ── Scraper Settings ── */}
      <div className="settings-section-title">Scraper Settings</div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="toggle-row" style={{ borderBottom: 'none' }}>
          <div>
            <div className="toggle-label">Scrape Metadata on Add</div>
            <div className="toggle-hint">
              Automatically run the metadata scraper when a new game is added to your library.
            </div>
          </div>
          <label className="toggle">
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  )
}
