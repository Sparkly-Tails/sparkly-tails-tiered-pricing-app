// Client-side auth token state. Plain module-level variable, not React
// state — nothing needs to re-render when it changes.
let currentToken = ''

export function setAuthToken(token: string) {
  currentToken = token
}

export function getAuthToken(): string {
  return currentToken
}

/** Appends `token` as the `stt` query param, preserving any existing query string. */
export function appendToken(href: string, token: string): string {
  if (!token) return href
  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  params.set('stt', token)
  return `${path}?${params.toString()}`
}
