const FALLBACK = '/'

// Accepts only same-origin relative paths: a single leading '/', no
// protocol-relative '//' or backslash forms, and no control characters.
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return FALLBACK
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return FALLBACK
  const path = raw.split(/[?#]/)[0]
  if (path === '/login' || path === '/setup') return FALLBACK
  return raw
}

export function loginUrl(returnUrl: string): string {
  const target = safeReturnUrl(returnUrl)
  return target === FALLBACK ? '/login' : `/login?returnUrl=${encodeURIComponent(target)}`
}
