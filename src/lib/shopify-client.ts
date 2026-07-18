const SHOPIFY_API_VERSION = '2025-10'

function apiUrl(): string {
  const shop = process.env.SHOPIFY_SHOP
  if (!shop) throw new Error('SHOPIFY_SHOP is not set')
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
}

function accessToken(): string {
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!token) throw new Error('SHOPIFY_ACCESS_TOKEN is not set')
  return token
}

export async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken(),
    },
    body: JSON.stringify({ query, variables }),
  })

  // Shopify (or the proxy/gateway in front of it) can return a non-JSON
  // body on real failure paths — an HTML error page on a 502, plain text
  // on some 429s. Without this, res.json() throws a bare native
  // SyntaxError with no HTTP status and no indication the failure came
  // from Shopify at all, and every caller of this module inherits that
  // opacity.
  let json: { data?: T; errors?: unknown }
  try {
    json = await res.json()
  } catch (err) {
    throw new Error(
      `Shopify API returned a non-JSON response (HTTP ${res.status} ${res.statusText}): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new Error(`Shopify API error (HTTP ${res.status}): ${JSON.stringify(json)}`)
  }

  if (json.errors) {
    throw new Error(
      Array.isArray(json.errors)
        ? json.errors.map((e: { message: string }) => e.message).join('; ')
        : JSON.stringify(json.errors),
    )
  }
  return json.data as T
}
