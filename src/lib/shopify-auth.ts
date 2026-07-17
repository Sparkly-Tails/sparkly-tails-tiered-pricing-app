// All crypto uses Web Crypto API — safe to import in Edge middleware (proxy.ts).

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verify Shopify's HMAC signature on the initial app-load URL. */
export async function verifyShopifyHmac(
  params: URLSearchParams,
  secret: string,
): Promise<boolean> {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const message = [...params.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const digest = await hmacSha256(secret, message)
  return timingSafeEqual(digest, hmac)
}

/** Create a signed session token — same format used for both the URL token and (unused here) a cookie fallback. */
export async function makeSessionToken(
  shop: string,
  secret: string,
): Promise<string> {
  const ts = Date.now().toString()
  const payload = `${shop}|${ts}`
  const sig = await hmacSha256(secret, payload)
  return `${payload}|${sig}`
}

async function verifyTokenWithMaxAge(
  token: string,
  secret: string,
  maxAgeMs: number,
): Promise<boolean> {
  const parts = token.split('|')
  if (parts.length !== 3) return false
  const [shop, ts, sig] = parts
  if (Date.now() - parseInt(ts) > maxAgeMs) return false
  const expected = await hmacSha256(secret, `${shop}|${ts}`)
  return timingSafeEqual(expected, sig)
}

/**
 * Verify a stateless URL/header-carried auth token. 10-minute window since it
 * travels in URLs and request/response headers rather than an httpOnly cookie.
 * No cookie or App Bridge session token is used anywhere in this app — both
 * are confirmed unreliable in the Shopify iPad app's webview (see the
 * sparkly-tails-pickup-app repo history and the shopify-app-auth skill).
 */
export async function verifyUrlToken(
  token: string,
  secret: string,
): Promise<boolean> {
  return verifyTokenWithMaxAge(token, secret, 10 * 60 * 1000)
}
