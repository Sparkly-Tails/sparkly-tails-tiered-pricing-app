import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  verifyShopifyHmac,
  makeSessionToken,
  verifyUrlToken,
} from '@/lib/shopify-auth'

// No cookie anywhere in this file, deliberately — see shopify-auth.ts's
// module comment. The `stt` URL/header token is the one mechanism that
// doesn't depend on anything surviving between requests.

async function nextWithFreshToken(req: NextRequest, shop: string, secret: string): Promise<NextResponse> {
  const freshToken = await makeSessionToken(shop, secret)
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-auth-token', freshToken)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('x-auth-token', freshToken)
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/debug')
  ) {
    return NextResponse.next()
  }

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
  const shop = process.env.SHOPIFY_SHOP

  if (!secret || !apiKey || !shop) {
    return new NextResponse('App misconfigured: missing env vars (503)', { status: 503 })
  }

  if (searchParams.has('hmac') && searchParams.has('shop')) {
    const valid = await verifyShopifyHmac(searchParams, secret)
    if (!valid) {
      return new NextResponse('HMAC verification failed', { status: 403 })
    }

    if (searchParams.has('host')) {
      return nextWithFreshToken(req, shop, secret)
    }

    const startUrl = new URL('/api/auth/start', req.url)
    searchParams.forEach((v, k) => startUrl.searchParams.set(k, v))
    return NextResponse.redirect(startUrl)
  }

  const urlToken = searchParams.get('stt')
  if (urlToken && (await verifyUrlToken(urlToken, secret))) {
    return nextWithFreshToken(req, shop, secret)
  }

  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Access restricted</title></head><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Open this app from your Shopify admin</h2>
      <p><a href="https://${shop}/admin/apps">Go to Shopify admin &rarr;</a></p>
    </body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html' } },
  )
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
