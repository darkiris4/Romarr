import { useState } from 'react'

const SHORT_DATE_FORMATS = [
  { value: 'MM/dd/yyyy', label: 'Month/Day/Year  (05/13/2026)' },
  { value: 'dd/MM/yyyy', label: 'Day/Month/Year  (13/05/2026)' },
  { value: 'yyyy-MM-dd', label: 'ISO 8601         (2026-05-13)' },
  { value: 'MMM d, yyyy', label: 'May 13, 2026' },
  { value: 'd MMM yyyy', label: '13 May 2026' },
]

const LONG_DATE_FORMATS = [
  { value: 'EEEE, MMMM d, yyyy', label: 'Wednesday, May 13, 2026' },
  { value: 'MMMM d, yyyy', label: 'May 13, 2026' },
  { value: 'd MMMM yyyy', label: '13 May 2026' },
]

const TIME_FORMATS = [
  { value: 'HH:mm', label: '24-hour  (14:30)' },
  { value: 'h:mm a', label: '12-hour  (2:30 PM)' },
]

const WEEK_START_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '6', label: 'Saturday' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'ru', label: 'Русский' },
  { value: 'zh-Hans', label: '中文 (简体)' },
]

export default function UISettingsPage() {
  const [shortDate, setShortDate] = useState('MMM d, yyyy')
  const [longDate, setLongDate] = useState('EEEE, MMMM d, yyyy')
  const [timeFormat, setTimeFormat] = useState('HH:mm')
  const [weekStart, setWeekStart] = useState('1')
  const [showRelative, setShowRelative] = useState(true)
  const [language, setLanguage] = useState('en')
  const [theme, setTheme] = useState('dark')
  const [saved, setSaved] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const now = new Date(2026, 4, 13, 14, 30) // fixed preview date
  const previewShort = formatPreview(shortDate, now)
  const previewLong = formatPreview(longDate, now)
  const previewTime = timeFormat === 'HH:mm' ? '14:30' : '2:30 PM'

  return (
    <div>
      <div className="settings-section-title">UI</div>
      <div className="settings-section-desc">Configure date formats, language, and appearance.</div>

      {saved && <div className="alert alert-success">Settings saved.</div>}

      <form onSubmit={handleSave}>
        {/* ── Dates & Times ── */}
        <div className="settings-section-title" style={{ marginTop: 8 }}>
          Dates &amp; Times
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">Short Date Format</label>
            <select
              className="form-control"
              value={shortDate}
              onChange={(e) => setShortDate(e.target.value)}
              style={{ maxWidth: 320 }}
            >
              {SHORT_DATE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="form-hint">
              Preview: <code>{previewShort}</code>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Long Date Format</label>
            <select
              className="form-control"
              value={longDate}
              onChange={(e) => setLongDate(e.target.value)}
              style={{ maxWidth: 360 }}
            >
              {LONG_DATE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="form-hint">
              Preview: <code>{previewLong}</code>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Time Format</label>
            <select
              className="form-control"
              value={timeFormat}
              onChange={(e) => setTimeFormat(e.target.value)}
              style={{ maxWidth: 240 }}
            >
              {TIME_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="form-hint">
              Preview: <code>{previewTime}</code>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Week Starts On</label>
            <select
              className="form-control"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              style={{ maxWidth: 180 }}
            >
              {WEEK_START_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="toggle-row" style={{ borderBottom: 'none' }}>
            <div>
              <div className="toggle-label">Show Relative Dates</div>
              <div className="toggle-hint">
                Display "2 days ago" instead of the full date where space allows.
              </div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showRelative}
                onChange={(e) => setShowRelative(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* ── Style ── */}
        <div className="settings-section-title">Style</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group">
            <label className="form-label">Theme</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['dark', 'light', 'auto'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`theme-option${theme === t ? ' theme-option--active' : ''}`}
                  onClick={() => setTheme(t)}
                >
                  <span className={`theme-option-preview theme-option-preview--${t}`} />
                  <span style={{ textTransform: 'capitalize', fontSize: 12 }}>
                    {t === 'auto' ? 'Auto (System)' : t}
                  </span>
                </button>
              ))}
            </div>
            <div className="form-hint">
              Auto follows your operating system's dark/light preference.
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Language</label>
            <select
              className="form-control"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{ maxWidth: 240 }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <div className="form-hint">
              UI language. Most translations are community-contributed — English is always complete.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button type="submit" className="btn btn-primary">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}

function formatPreview(format: string, date: Date): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const shortMonths = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const m = date.getMonth()
  const d = date.getDate()
  const y = date.getFullYear()

  return format
    .replace('EEEE', days[date.getDay()])
    .replace('MMMM', months[m])
    .replace('MMM', shortMonths[m])
    .replace('MM', String(m + 1).padStart(2, '0'))
    .replace('dd', String(d).padStart(2, '0'))
    .replace('d', String(d))
    .replace('yyyy', String(y))
}
