import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyHmac } from '@/lib/shopify-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shop = searchParams.get('shop')
  const code = searchParams.get('code')

  if (!shop || !code) {
    return new NextResponse('Missing shop or code', { status: 400 })
  }

  const secret = process.env.SHOPIFY_API_SECRET_KEY
  const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY

  if (!secret || !apiKey) {
    return new NextResponse('App misconfigured', { status: 503 })
  }

  const valid = await verifyShopifyHmac(searchParams, secret)
  if (!valid) return new NextResponse('Invalid HMAC', { status: 403 })

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: apiKey, client_secret: secret, code }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[auth/callback] token exchange failed:', tokenRes.status, body)
    return new NextResponse('Token exchange failed', { status: 502 })
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }

  // No database in this app — there is nowhere to persist the token
  // automatically. Log it once so it can be copied into the
  // SHOPIFY_ACCESS_TOKEN env var in Vercel. This only happens on install/
  // reinstall, which is rare for a single-store private app (see spec §2.6
  // and §9 for the accepted trade-off).
  console.log('[auth/callback] OAuth complete for shop:', shop)
  console.log('[auth/callback] Copy this into SHOPIFY_ACCESS_TOKEN in Vercel env vars:')
  console.log('[auth/callback] ACCESS_TOKEN=' + access_token)

  const adminUrl = `https://${shop}/admin`
  return NextResponse.redirect(adminUrl)
}
